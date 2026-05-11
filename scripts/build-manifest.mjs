#!/usr/bin/env node
// 扫描 photos-source/，按拍摄时间生成 data/photos.json。
// 时间来源优先级：EXIF.DateTimeOriginal → 文件名时间戳 → 文件 mtime → null。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "photos-source");
const OUTPUT = path.join(ROOT, "data", "photos.json");

const MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".mp4", ".mov"]);

const pad = (n) => String(n).padStart(2, "0");
const dateToLocalIso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// 把任意时间戳按"妹妹所在时区（中国，UTC+8）"格式化。
// 用于 unix 时间戳类输入（微信文件名、WechatIMG birthtime 等），
// 让所有照片时间统一按"她那边的本地时间"理解，不受 build 机器时区影响。
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;
function dateToCstIso(d) {
  const shifted = new Date(d.getTime() + CST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

// 校验候选时间是否在合理范围（防止文件名里的长 ID 被误识别为日期）
function isReasonableIso(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < 1990 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  if (h > 23 || mi > 59 || s > 59) return false;
  return true;
}

// 文件名时间戳 pattern。返回匹配到的本地时间字符串 "YYYY-MM-DDTHH:mm:ss" 或 null。
// 顺序敏感：17 位时间戳必须先匹配，否则会被 14 位贪心匹配吃掉。
function parseTimeFromFilename(name) {
  // 1) faceu_<id>_20200717134800590.jpg：末尾 17 位 YYYYMMDDHHMMSSmmm，前后必须不是数字
  const seventeen = name.match(/(?<!\d)(\d{17})(?!\d)/);
  if (seventeen) {
    const t = seventeen[1];
    const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}`;
    if (isReasonableIso(iso)) return iso;
  }
  // 2) IMG_20200406_140111 / video_20210430_103314 / Screenshot_20220101-120000：8+分隔+6
  const dashed = name.match(/(?<!\d)(\d{8})[_-](\d{6})(?!\d)/);
  if (dashed) {
    const [, ymd, hms] = dashed;
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}`;
    if (isReasonableIso(iso)) return iso;
  }
  // 3) WeChat HD 导出 <4-digit-seq><10-digit-unix>_.pic_hd.jpg：消息时间戳（秒）
  //    例：77831777704682_.pic_hd.jpg → seq=7783, unix=1777704682
  //    必须在通用 unix 模式之前匹配，否则会被吃掉。Unix 时间统一按 CST 显示。
  const wxHd = name.match(/^\d{4}(\d{10})_\.pic_hd\.(jpe?g|png)$/i);
  if (wxHd) {
    const iso = dateToCstIso(new Date(Number(wxHd[1]) * 1000));
    if (isReasonableIso(iso)) return iso;
  }
  // 4) mmexport1597893712345.jpg / WeChat_1597893712.jpeg：unix 毫秒或秒
  const wx = name.match(/(?:mmexport|wechat[_-]?image|wx[_-]?camera)[_-]?(\d{10,13})/i);
  if (wx) {
    const n = wx[1];
    const ms = n.length === 13 ? Number(n) : Number(n) * 1000;
    if (!Number.isNaN(ms)) {
      const iso = dateToCstIso(new Date(ms));
      if (isReasonableIso(iso)) return iso;
    }
  }
  return null;
}

async function readExifTime(absPath) {
  try {
    const exif = await exifr.parse(absPath, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] });
    if (!exif) return null;
    const dt = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
    if (!dt) return null;
    const d = dt instanceof Date ? dt : new Date(dt);
    if (Number.isNaN(d.getTime())) return null;
    // 用本地墙钟字段（getFullYear/getHours…）保留"拍摄时手机上显示的时间"
    const iso = dateToLocalIso(d);
    return isReasonableIso(iso) ? iso : null;
  } catch {
    return null;
  }
}

const VIDEO_EXT = new Set([".mp4", ".mov"]);
const kindOf = (name) => (VIDEO_EXT.has(path.extname(name).toLowerCase()) ? "video" : "image");

async function classifyOne(absPath) {
  const stat = await fs.stat(absPath);
  const name = path.basename(absPath);
  const kind = kindOf(name);
  const base = { kind, bytes: stat.size };

  // 文件名时间戳优先：IMG_YYYYMMDD_HHMMSS / faceu 17 位 / video_YYYYMMDD_HHMMSS 等
  // 这些反映"保存到相册的瞬间"，是时间线想要的叙事时间；EXIF 可能是转发图的原始拍摄时间，
  // 用 EXIF 会把转发的旧图误归到几年前，破坏时间线连续性。
  const filenameTime = parseTimeFromFilename(name);
  if (filenameTime) return { ...base, takenAt: filenameTime, source: "filename" };

  // 文件名没有时间戳 → 退回 EXIF（仅图片）
  if (kind === "image") {
    const exifTime = await readExifTime(absPath);
    if (exifTime) return { ...base, takenAt: exifTime, source: "exif" };
  }

  // 文件系统创建时间（macOS birthtime）优于 mtime：
  // 微信导出图片擦了 EXIF，文件名又没时间戳时，birthtime 是"保存到本地的瞬间"，
  // 比 mtime 稳定（mtime 可能被编辑器、缩略图生成等改动）。
  // 注意：cp 会重置 birthtime，photos-source 里的文件需用 `cp -p` 来源复制。
  const fsTime = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
  const source = stat.birthtimeMs > 0 ? "birthtime" : "mtime";
  // birthtime/mtime 也按 CST 解释，跟 unix 时间戳保持一致
  return { ...base, takenAt: dateToCstIso(fsTime), source };
}

async function main() {
  let entries;
  try {
    entries = await fs.readdir(SOURCE_DIR);
  } catch (err) {
    console.error(`[build-manifest] cannot read ${SOURCE_DIR}: ${err.message}`);
    process.exit(1);
  }

  const candidates = entries.filter((n) => MEDIA_EXT.has(path.extname(n).toLowerCase()));
  console.log(`[build-manifest] scanning ${candidates.length} images in ${SOURCE_DIR}`);

  // 并发跑 EXIF 读取（控制并发避免打满文件描述符）
  const CONCURRENCY = 16;
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const i = cursor++;
      const name = candidates[i];
      const abs = path.join(SOURCE_DIR, name);
      const meta = await classifyOne(abs);
      results.push({ file: name, ...meta });
      if (results.length % 50 === 0) {
        console.log(`  …${results.length}/${candidates.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 按时间升序；时间相同时按文件名稳定排序
  results.sort((a, b) => {
    if (a.takenAt === b.takenAt) return a.file.localeCompare(b.file);
    return a.takenAt < b.takenAt ? -1 : 1;
  });

  const tally = results.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {});

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, SOURCE_DIR),
    count: results.length,
    sourceTally: tally,
    photos: results,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`[build-manifest] wrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`  total : ${results.length}`);
  console.log(`  source: ${JSON.stringify(tally)}`);
  if (results.length) {
    console.log(`  range : ${results[0].takenAt}  →  ${results[results.length - 1].takenAt}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
