#!/usr/bin/env node
// 把 manifest 里 selected:true 的图片转成三档 WebP，输出到 public/photos/
// 同时：
//   - 把原图的 width / height 写回 manifest（前端布局用，避免 layout shift）
//   - 检测损坏文件（sharp 读不出元数据），标记 broken:true 并取消 selected
//   - 跳过 kind:video（视频另外处理）

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "photos-source");
const OUT_DIR = path.join(ROOT, "public", "photos");
const MANIFEST = path.join(ROOT, "data", "photos.json");

const SIZES = [
  { tag: "thumb",  width: 320,  quality: 80 },
  { tag: "medium", width: 1280, quality: 85 },
  { tag: "large",  width: 2400, quality: 88 },
];

const CONCURRENCY = 4;

async function processOne(file) {
  const src = path.join(SOURCE_DIR, file);
  const base = path.basename(file, path.extname(file));

  try {
    // rotate() 应用 EXIF orientation；metadata 拿尺寸
    const meta = await sharp(src).rotate().metadata();
    if (!meta.width || !meta.height) {
      throw new Error("no dimensions");
    }

    for (const { tag, width, quality } of SIZES) {
      const out = path.join(OUT_DIR, `${base}-${tag}.webp`);
      await sharp(src)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toFile(out);
    }

    return { ok: true, file, width: meta.width, height: meta.height };
  } catch (err) {
    return { ok: false, file, error: err.message };
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const targets = manifest.photos.filter((p) => p.selected && p.kind === "image");

  await fs.mkdir(OUT_DIR, { recursive: true });

  // eslint-disable-next-line no-console
  console.log(`[optimize] processing ${targets.length} images @ concurrency=${CONCURRENCY}`);
  // eslint-disable-next-line no-console
  console.log(`  source : ${path.relative(ROOT, SOURCE_DIR)}`);
  // eslint-disable-next-line no-console
  console.log(`  output : ${path.relative(ROOT, OUT_DIR)}`);

  const t0 = performance.now();
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const r = await processOne(targets[i].file);
      results.push(r);
      if (results.length % 5 === 0) {
        // eslint-disable-next-line no-console
        console.log(`  ...${results.length}/${targets.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 把结果写回 manifest
  const dimsByFile = new Map();
  const brokenSet = new Set();
  for (const r of results) {
    if (r.ok) {
      dimsByFile.set(r.file, { width: r.width, height: r.height });
    } else {
      brokenSet.add(r.file);
    }
  }

  const updatedPhotos = manifest.photos.map((p) => {
    const d = dimsByFile.get(p.file);
    const broken = brokenSet.has(p.file);
    const next = { ...p };
    if (d) {
      next.width = d.width;
      next.height = d.height;
    }
    if (broken) {
      next.broken = true;
      next.selected = false;
    }
    return next;
  });

  const newManifest = {
    ...manifest,
    optimized: {
      generatedAt: new Date().toISOString(),
      sizes: SIZES.map((s) => ({ tag: s.tag, width: s.width, quality: s.quality })),
      processedOk: results.filter((r) => r.ok).length,
      broken: [...brokenSet],
    },
    photos: updatedPhotos,
  };

  await fs.writeFile(MANIFEST, JSON.stringify(newManifest, null, 2) + "\n");

  // 总结
  const t1 = performance.now();
  const ok = results.filter((r) => r.ok).length;
  const totalSize = await dirSize(OUT_DIR);
  // eslint-disable-next-line no-console
  console.log(`\n[optimize] done in ${((t1 - t0) / 1000).toFixed(1)}s`);
  // eslint-disable-next-line no-console
  console.log(`  processed ok : ${ok}`);
  // eslint-disable-next-line no-console
  console.log(`  broken       : ${brokenSet.size}${brokenSet.size ? "  " + [...brokenSet].slice(0, 3).join(", ") + (brokenSet.size > 3 ? " …" : "") : ""}`);
  // eslint-disable-next-line no-console
  console.log(`  output total : ${(totalSize / 1024 / 1024).toFixed(1)} MB across ${ok * SIZES.length} files`);
}

async function dirSize(dir) {
  const entries = await fs.readdir(dir);
  let total = 0;
  for (const e of entries) {
    const s = await fs.stat(path.join(dir, e));
    if (s.isFile()) total += s.size;
  }
  return total;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
