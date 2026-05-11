#!/usr/bin/env node
// 从 data/photos.json 中挑选 60-100 张精选作为时间线展示用。
// 策略：
//   1) 同一分钟内多张：去连拍，保留 ≤2 张（优先大文件 + 原图 vs 滤镜混合）
//   2) 按月份均匀：每月目标 ~5 张，超额按质量分剔除
//   3) 视频全部保留
//   4) 用户可在 data/keep.txt / data/drop.txt 中手动 override
//
// 输出：在原 photos.json 中给每条加 `selected: true|false`，并打印统计。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "data", "photos.json");
const KEEP_LIST = path.join(ROOT, "data", "keep.txt");
const DROP_LIST = path.join(ROOT, "data", "drop.txt");

const PER_MONTH_TARGET = 12;
const MAX_PER_MINUTE = 4;
// 月份特例：某些月想多保留时单独写。键是 "YYYY-MM"
const MONTH_TARGET_OVERRIDE = {
  "2026-05": 50, // 微信新批次（妹妹近期照片，2026 春），整批一起保留
};
// 这些月份跳过"同分钟最多 N 张"的去连拍逻辑：
// 适用于"批量发送/转存"而非真实连拍的情形（一秒内 10 张 != 连拍）
const MONTH_SKIP_DEDUPE = new Set(Object.keys(MONTH_TARGET_OVERRIDE));

const isFaceu = (file) => /^faceu_/i.test(file);
const isOriginal = (file) => /^(IMG|DCIM|DSC|P_|MVIMG)_/i.test(file);
const monthKey = (iso) => iso.slice(0, 7);     // "2020-04"
const minuteKey = (iso) => iso.slice(0, 16);   // "2020-04-06T14:01"

// 简单可重复的伪随机（同一文件每次结果一致，便于 review）
function seededRand(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function score(p) {
  const sizeScore = Math.log10(Math.max(p.bytes, 1) / 1000);   // 大致 1.0–4.0
  const originalBonus = isOriginal(p.file) ? 0.6 : 0;
  const faceuPenalty = isFaceu(p.file) ? -0.15 : 0;
  const noise = seededRand(p.file) * 0.2;
  return sizeScore + originalBonus + faceuPenalty + noise;
}

async function readListFile(filepath) {
  try {
    const text = await fs.readFile(filepath, "utf8");
    return new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    );
  } catch {
    return new Set();
  }
}

function pickFromMinute(group) {
  // 同一分钟内：留最多 MAX_PER_MINUTE 张，混合原图和滤镜风格
  if (group.length <= MAX_PER_MINUTE) return group;
  const originals = group.filter((p) => !isFaceu(p.file));
  const filtered = group.filter((p) => isFaceu(p.file));
  // 各自按 score 排序
  originals.sort((a, b) => b.score - a.score);
  filtered.sort((a, b) => b.score - a.score);

  const out = [];
  if (originals.length) out.push(originals[0]);
  if (filtered.length && out.length < MAX_PER_MINUTE) out.push(filtered[0]);
  // 还差就从剩下的 originals 补
  for (const p of originals.slice(1)) {
    if (out.length >= MAX_PER_MINUTE) break;
    out.push(p);
  }
  return out;
}

function trimMonthToTarget(monthPhotos, target) {
  if (monthPhotos.length <= target) return monthPhotos;
  // 高分优先；但保证视频和首尾时刻被保留
  const sorted = [...monthPhotos].sort((a, b) => b.score - a.score);
  const kept = sorted.slice(0, target);
  // 重新按时间序输出
  return kept.sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
}

async function main() {
  const raw = await fs.readFile(MANIFEST, "utf8");
  const manifest = JSON.parse(raw);
  const photos = manifest.photos.map((p) => ({ ...p, score: score(p) }));

  const [keepSet, dropSet] = await Promise.all([
    readListFile(KEEP_LIST),
    readListFile(DROP_LIST),
  ]);

  // === 1) 视频与图片分流 ===
  const videos = photos.filter((p) => p.kind === "video");
  const images = photos.filter((p) => p.kind === "image");

  // === 2) 图片：去连拍（按分钟分组） ===
  const minuteGroups = new Map();
  for (const p of images) {
    const k = minuteKey(p.takenAt);
    if (!minuteGroups.has(k)) minuteGroups.set(k, []);
    minuteGroups.get(k).push(p);
  }
  const dedupedImages = [];
  for (const [mk, group] of minuteGroups.entries()) {
    const monthOfMinute = mk.slice(0, 7);
    if (MONTH_SKIP_DEDUPE.has(monthOfMinute)) {
      dedupedImages.push(...group);
    } else {
      dedupedImages.push(...pickFromMinute(group));
    }
  }

  // === 3) 按月份均匀采样 ===
  const monthGroups = new Map();
  for (const p of dedupedImages) {
    const k = monthKey(p.takenAt);
    if (!monthGroups.has(k)) monthGroups.set(k, []);
    monthGroups.get(k).push(p);
  }
  let curatedImages = [];
  for (const [mKey, group] of [...monthGroups.entries()].sort()) {
    const target = MONTH_TARGET_OVERRIDE[mKey] ?? PER_MONTH_TARGET;
    curatedImages.push(...trimMonthToTarget(group, target));
  }

  // === 4) 用户手动 override ===
  const finalSelected = new Set([
    ...videos.map((v) => v.file),
    ...curatedImages.map((p) => p.file),
  ]);
  for (const f of dropSet) finalSelected.delete(f);
  for (const f of keepSet) finalSelected.add(f);

  // === 5) 写回 manifest，给每条加 selected 字段 ===
  const updatedPhotos = manifest.photos.map((p) => ({
    ...p,
    selected: finalSelected.has(p.file),
  }));

  // 排序保持原（已按时间升序）
  const newManifest = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    curated: {
      target: { perMonth: PER_MONTH_TARGET, maxPerMinute: MAX_PER_MINUTE },
      keepListSize: keepSet.size,
      dropListSize: dropSet.size,
      selectedCount: finalSelected.size,
    },
    photos: updatedPhotos,
  };
  await fs.writeFile(MANIFEST, JSON.stringify(newManifest, null, 2) + "\n");

  // === 6) 控制台报告 ===
  const selectedImages = updatedPhotos.filter((p) => p.selected && p.kind === "image");
  const selectedVideos = updatedPhotos.filter((p) => p.selected && p.kind === "video");

  // eslint-disable-next-line no-console
  console.log(`[curate] photos.json updated · ${path.relative(ROOT, MANIFEST)}`);
  // eslint-disable-next-line no-console
  console.log(`  total in source : ${photos.length}`);
  // eslint-disable-next-line no-console
  console.log(`  selected        : ${finalSelected.size}  (images ${selectedImages.length} · videos ${selectedVideos.length})`);

  const monthBreakdown = {};
  for (const p of selectedImages) {
    const k = monthKey(p.takenAt);
    monthBreakdown[k] = (monthBreakdown[k] || 0) + 1;
  }
  // eslint-disable-next-line no-console
  console.log(`  per-month image distribution:`);
  for (const k of Object.keys(monthBreakdown).sort()) {
    // eslint-disable-next-line no-console
    console.log(`    ${k} : ${monthBreakdown[k]}`);
  }
  if (keepSet.size || dropSet.size) {
    // eslint-disable-next-line no-console
    console.log(`  manual overrides: keep=${keepSet.size}, drop=${dropSet.size}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
