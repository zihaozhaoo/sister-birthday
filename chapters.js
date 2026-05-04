// 时间线章节渲染：读 data/photos.json，按"年·季"分章，每章生成一张拼贴照片墙。
// 输出挂到 #chapters-mount，被 main.js 当作 .scene 接管翻页。

(() => {
  const NS = (window.NB = window.NB || {});

  // ============================================================
  // 季节工具
  // ============================================================

  const SEASONS = [
    { key: "winter", cn: "冬", months: [12, 1, 2] },
    { key: "spring", cn: "春", months: [3, 4, 5] },
    { key: "summer", cn: "夏", months: [6, 7, 8] },
    { key: "autumn", cn: "秋", months: [9, 10, 11] },
  ];
  const SEASON_BY_MONTH = SEASONS.reduce((acc, s) => {
    s.months.forEach((m) => (acc[m] = s));
    return acc;
  }, {});

  const ZH_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

  function parseTakenAt(iso) {
    // "2020-04-06T14:01:11" — 不带时区，按本地时间构造
    const [d, t = "00:00:00"] = iso.split("T");
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi, s] = t.split(":").map(Number);
    return new Date(y, mo - 1, da, h, mi, s);
  }

  function chapterOf(date) {
    const m = date.getMonth() + 1;
    const season = SEASON_BY_MONTH[m];
    return { year: date.getFullYear(), season, month: m };
  }

  // ============================================================
  // 字符串小工具
  // ============================================================

  function hash(str) {
    let h = 0;
    for (const ch of str) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
    return Math.abs(h);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  // ============================================================
  // 剪报字母调色板（与 cover 视觉宇宙保持一致）
  // ============================================================

  const ROMAN_PALETTE = [
    { bg: "#ffffff", c: "#1a0028", font: "'Bowlby One',sans-serif" },
    { bg: "#ffe45e", c: "#c41a78", font: "Anton,sans-serif" },
    { bg: "#ffb3da", c: "#1a2c8c", font: "'Permanent Marker',cursive" },
    { bg: "#c8e8ff", c: "#1d6b3a", font: "Bungee,sans-serif" },
    { bg: "#ff8ad1", c: "#1a0028", font: "Shrikhand,serif" },
    { bg: "#b8ffd9", c: "#1a2c8c", font: "'Rubik Mono One',sans-serif" },
    { bg: "#d8c8ff", c: "#1a0028", font: "Frijole,cursive" },
    { bg: "#ffcfa8", c: "#c41a78", font: "Bungee,sans-serif" },
    { bg: "#fffafd", c: "#6f2dc4", font: "Anton,sans-serif" },
    { bg: "#ffe45e", c: "#1a0028", font: "'Bebas Neue',sans-serif" },
  ];

  const CN_PALETTE = [
    { bg: "#ff8ad1", c: "#1a0028", font: "'ZCOOL KuaiLe',cursive" },
    { bg: "#ffe45e", c: "#c41a78", font: "'Ma Shan Zheng',cursive" },
    { bg: "#b8ffd9", c: "#1a0028", font: "'ZCOOL XiaoWei',serif" },
    { bg: "#d8c8ff", c: "#6f2dc4", font: "'Long Cang',cursive" },
    { bg: "#ffffff", c: "#c41a78", font: "'Ma Shan Zheng',cursive" },
  ];

  function ransomLetter(ch, paletteIdx, rotIdx, isChinese, isAccent) {
    const palette = isChinese ? CN_PALETTE : ROMAN_PALETTE;
    const sty = palette[paletteIdx % palette.length];
    const rot = ((rotIdx % 7) - 3) * 1.4;
    const span = document.createElement("span");
    span.className = "rl" + (isChinese ? " cn" : "") + (isAccent ? " big" : "");
    span.style.cssText = `--bg:${sty.bg};--c:${sty.c};--rot:${rot}deg;--font:${sty.font}`;
    span.textContent = ch;
    return span;
  }

  function buildRansomTitle(year, seasonCn, seedKey) {
    const seed = hash(seedKey);
    const wrap = document.createElement("h3");
    wrap.className = "ransom ransom-ch";
    wrap.setAttribute("aria-label", `${year} ${seasonCn}`);

    const row = document.createElement("span");
    row.className = "rl-row";

    const yearStr = String(year);
    [...yearStr].forEach((digit, i) => {
      row.appendChild(ransomLetter(digit, seed + i, seed + i * 3, false, false));
    });

    // 中点分隔（小字号）
    const dot = ransomLetter("·", seed + 9, seed + 2, false, false);
    dot.classList.add("rl-dot");
    row.appendChild(dot);

    row.appendChild(ransomLetter(seasonCn, seed + 7, seed + 11, true, true));

    wrap.appendChild(row);
    return wrap;
  }

  // ============================================================
  // 章节装饰：根据 index 切换变体（4 套循环）
  // ============================================================

  const CH_VARIANTS = [
    { paperPink: "#ffa3d1", washiTop: "var(--bubble-pink)", washiAccent: "var(--cream-yellow)" },
    { paperPink: "#ffc1dd", washiTop: "var(--cream-yellow)", washiAccent: "var(--mint)" },
    { paperPink: "#ff8ad1", washiTop: "var(--mint)", washiAccent: "var(--bubble-pink)" },
    { paperPink: "#ffd6ec", washiTop: "var(--baby-violet)", washiAccent: "var(--cream-yellow)" },
  ];

  function buildDecor(variantIdx) {
    const frag = document.createDocumentFragment();
    const v = CH_VARIANTS[variantIdx % CH_VARIANTS.length];

    // 全息 + 网格背景层
    const holo = document.createElement("div");
    holo.className = "holo-bg";
    holo.setAttribute("aria-hidden", "true");
    frag.appendChild(holo);

    const grid = document.createElement("div");
    grid.className = "grid-bg";
    grid.setAttribute("aria-hidden", "true");
    frag.appendChild(grid);

    // 撕纸大块（沿用 timeline 既有定位类）
    const lined = document.createElement("div");
    lined.className = "paper paper-lined paper-lined-tl";
    lined.setAttribute("aria-hidden", "true");
    frag.appendChild(lined);

    const pink = document.createElement("div");
    pink.className = "paper paper-pink paper-pink-tl";
    pink.style.setProperty("--paper-color", v.paperPink);
    pink.setAttribute("aria-hidden", "true");
    frag.appendChild(pink);

    const mint = document.createElement("div");
    mint.className = "paper paper-mint paper-mint-tl";
    mint.setAttribute("aria-hidden", "true");
    frag.appendChild(mint);

    // washi tape 两条
    const w1 = document.createElement("span");
    w1.className = "washi washi-tl-1";
    w1.style.setProperty("--tape", v.washiTop);
    w1.setAttribute("aria-hidden", "true");
    frag.appendChild(w1);

    const w2 = document.createElement("span");
    w2.className = "washi washi-tl-2";
    w2.style.setProperty("--tape", v.washiAccent);
    w2.setAttribute("aria-hidden", "true");
    frag.appendChild(w2);

    return frag;
  }

  function buildChapterHead(chapterIdx, year, seasonCn, monthsCovered) {
    const head = document.createElement("header");
    head.className = "ch-head";

    const stamp = document.createElement("span");
    stamp.className = "stamp stamp-ch";
    stamp.textContent = `CH·${pad2(chapterIdx + 1)}`;
    head.appendChild(stamp);

    head.appendChild(buildRansomTitle(year, seasonCn, `${year}-${seasonCn}`));

    const sub = document.createElement("p");
    sub.className = "caveat ch-sub";
    const monthsStr = monthsCovered.map((m) => `${ZH_NUM[m]}月`).join(" · ");
    sub.textContent = `${monthsStr}  ✿`;
    head.appendChild(sub);

    return head;
  }

  // ============================================================
  // 拍立得
  // ============================================================

  const PHOTO_DIR = "public/photos";

  function polaroidFor(photo, idx, seed) {
    const base = photo.file.replace(/\.[^.]+$/, "");
    const fig = document.createElement("figure");
    fig.className = "polaroid";

    // 旋转：按 hash 选 -5° ~ +5°
    const rot = (((seed + idx * 13) % 11) - 5) * 0.9;
    fig.style.setProperty("--rot", `${rot.toFixed(2)}deg`);

    // 间或加一段 washi 胶带角（每 3 张一张胶带）
    if ((seed + idx) % 3 === 0) {
      const tape = document.createElement("span");
      tape.className = "tape-corner " + ((seed + idx) % 2 === 0 ? "tl" : "tr");
      tape.setAttribute("aria-hidden", "true");
      fig.appendChild(tape);
    }

    const picture = document.createElement("picture");

    const source = document.createElement("source");
    source.type = "image/webp";
    const thumb = `${PHOTO_DIR}/${base}-thumb.webp`;
    const medium = `${PHOTO_DIR}/${base}-medium.webp`;
    const large = `${PHOTO_DIR}/${base}-large.webp`;
    source.srcset = `${thumb} 320w, ${medium} 1280w, ${large} 2400w`;
    source.sizes = "(max-width: 600px) 90vw, (max-width: 1100px) 45vw, 30vw";
    picture.appendChild(source);

    const img = document.createElement("img");
    img.src = medium;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    if (photo.width && photo.height) {
      img.width = photo.width;
      img.height = photo.height;
    }
    picture.appendChild(img);

    fig.appendChild(picture);

    // 日期标签（手帐风：4·6）
    const cap = document.createElement("figcaption");
    const d = parseTakenAt(photo.takenAt);
    cap.textContent = `${d.getMonth() + 1}·${pad2(d.getDate())}`;
    fig.appendChild(cap);

    return fig;
  }

  // ============================================================
  // 主流程
  // ============================================================

  async function loadManifest() {
    const res = await fetch("data/photos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`photos.json fetch failed: ${res.status}`);
    return res.json();
  }

  function groupChapters(photos) {
    // 仅图片（视频另行处理），按"年·季"分组
    const buckets = new Map();
    for (const p of photos) {
      if (!p.selected || p.kind !== "image" || p.broken) continue;
      const d = parseTakenAt(p.takenAt);
      const ch = chapterOf(d);
      const key = `${ch.year}-${ch.season.key}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          year: ch.year,
          season: ch.season,
          photos: [],
          months: new Set(),
        });
      }
      const b = buckets.get(key);
      b.photos.push(p);
      b.months.add(ch.month);
    }

    // 排序：按年 → 按季节顺序（春夏秋冬，但 winter 跨年用所属年）
    const seasonOrder = { spring: 0, summer: 1, autumn: 2, winter: 3 };
    return [...buckets.values()]
      .map((b) => ({
        ...b,
        photos: [...b.photos].sort((a, z) => a.takenAt.localeCompare(z.takenAt)),
        months: [...b.months].sort((a, z) => a - z),
      }))
      .sort((a, z) => a.year - z.year || seasonOrder[a.season.key] - seasonOrder[z.season.key]);
  }

  function buildChapterScene(chapter, idx) {
    const section = document.createElement("section");
    section.id = `ch-${chapter.key}`;
    section.className = "scene chapter hidden";
    section.dataset.key = chapter.key;
    section.dataset.variant = String(idx % CH_VARIANTS.length);

    section.appendChild(buildDecor(idx));
    section.appendChild(buildChapterHead(idx, chapter.year, chapter.season.cn, chapter.months));

    const body = document.createElement("div");
    body.className = "chapter-body";
    const wall = document.createElement("div");
    wall.className = "photo-wall";

    const seed = hash(chapter.key);
    chapter.photos.forEach((p, i) => wall.appendChild(polaroidFor(p, i, seed)));

    body.appendChild(wall);
    section.appendChild(body);

    // 章末手写小尾巴
    const tail = document.createElement("p");
    tail.className = "caveat ch-tail";
    tail.textContent = chapter.photos.length === 1
      ? "就这一张，但够珍贵 ♡"
      : `${chapter.photos.length} 帧 · ${chapter.season.cn}天的诺宝 ♡`;
    section.appendChild(tail);

    return section;
  }

  NS.buildChapters = async function buildChapters() {
    const mount = document.getElementById("chapters-mount");
    if (!mount) throw new Error("#chapters-mount not found");

    const manifest = await loadManifest();
    const chapters = groupChapters(manifest.photos);

    const frag = document.createDocumentFragment();
    chapters.forEach((ch, i) => frag.appendChild(buildChapterScene(ch, i)));
    mount.appendChild(frag);

    return { chapterCount: chapters.length };
  };
})();
