#!/usr/bin/env node
// 用 sharp 生成 thumb / medium / large 三档 WebP，方便对比清晰度。
// 输出到 data/comparison/，原图也复制进去做并排对比参考。

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "photos-source");
const OUT_DIR = path.join(ROOT, "data", "comparison");

const SAMPLES = [
  "IMG_20200504_085429.jpg",                              // 6.4 MB 原相机大图
  "faceu_6835913639824724487_20200929193711558.jpg",      // ~1 MB 滤镜自拍 (1080x1440)
];

const SIZES = [
  { tag: "thumb",  width: 320,  quality: 85 },
  { tag: "medium", width: 1280, quality: 85 },
  { tag: "large",  width: 2400, quality: 85 },
];

async function processOne(filename) {
  const src = path.join(SOURCE_DIR, filename);
  const stat = await fs.stat(src);
  const base = path.basename(filename, path.extname(filename));

  // 复制一份原图做对比基准
  const originalCopy = path.join(OUT_DIR, `${base}-ORIGINAL${path.extname(filename)}`);
  await fs.copyFile(src, originalCopy);

  const results = [{
    tag: "original",
    file: path.basename(originalCopy),
    bytes: stat.size,
  }];

  for (const { tag, width, quality } of SIZES) {
    const out = path.join(OUT_DIR, `${base}-${tag}.webp`);
    await sharp(src)
      .rotate()                       // 应用 EXIF orientation
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toFile(out);
    const outStat = await fs.stat(out);
    results.push({ tag, file: path.basename(out), bytes: outStat.size, width, quality });
  }

  return { source: filename, results };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[compare] processing ${SAMPLES.length} samples → ${path.relative(ROOT, OUT_DIR)}`);
  for (const f of SAMPLES) {
    // eslint-disable-next-line no-console
    console.log(`\n  ${f}`);
    const { results } = await processOne(f);
    for (const r of results) {
      const sizeStr = r.width ? `  ${r.width}px` : "         ";
      // eslint-disable-next-line no-console
      console.log(`    ${r.tag.padEnd(9)}${sizeStr}  ${fmtBytes(r.bytes).padStart(8)}   ${r.file}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n[compare] done. open the folder: open ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
