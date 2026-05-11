// 时间线渲染：读 data/photos.json，按拍摄时间升序排，所有照片共享同一个 photo-stage 容器。
// 翻页时只换中心 hero（照片 + 日期 + 计数器 + 章节戳），外壳/装饰保持稳定。
//
// 暴露：
//   NB.buildChapters() — 构造唯一的 #photo-stage 并装载首张
//   NB.renderHero(entry, idx, total) — 切换中心 hero
//   NB.photoSeries — 排序后的照片条目数组（main.js 用来翻页）

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

  function parseTakenAt(iso) {
    const [d, t = "00:00:00"] = iso.split("T");
    const [y, mo, da] = d.split("-").map(Number);
    const [h, mi, s] = t.split(":").map(Number);
    return new Date(y, mo - 1, da, h, mi, s);
  }

  function chapterKeyOf(date) {
    const m = date.getMonth() + 1;
    return { year: date.getFullYear(), season: SEASON_BY_MONTH[m] };
  }

  // ============================================================
  // 小工具
  // ============================================================

  function hash(str) {
    let h = 0;
    for (const ch of str) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
    return Math.abs(h);
  }

  const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
  const pad3 = (n) => (n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n);

  // ============================================================
  // 场景视觉变体（4 套循环，按章节 index 切换）
  // ============================================================

  const SCENE_VARIANTS = [
    {
      bg: "linear-gradient(180deg, #ffd6ec 0%, #d8c8ff 55%, #ffe45e 100%)",
      paperPink: "#ffa3d1",
      washiTop: "var(--bubble-pink)",
      washiAccent: "var(--cream-yellow)",
    },
    {
      bg: "linear-gradient(180deg, #fff4dc 0%, #ffd6ec 50%, #d8c8ff 100%)",
      paperPink: "#ffc1dd",
      washiTop: "var(--cream-yellow)",
      washiAccent: "var(--mint)",
    },
    {
      bg: "linear-gradient(180deg, #d8f5e7 0%, #ffd6ec 50%, #fff4dc 100%)",
      paperPink: "#ff8ad1",
      washiTop: "var(--mint)",
      washiAccent: "var(--bubble-pink)",
    },
    {
      bg: "linear-gradient(180deg, #e8d8ff 0%, #ffd6ec 50%, #b8ffd9 100%)",
      paperPink: "#ffd6ec",
      washiTop: "var(--baby-violet)",
      washiAccent: "var(--cream-yellow)",
    },
  ];

  const HAND_NOTES = [
    "♡",
    "✦",
    "★",
    "诺宝 ✿",
    "小寿星 ♡",
    "可爱本爱",
    "甜甜",
    "舞台 ✨",
    "镜头前",
    "炸 ✦",
    "Cute!",
    "Pose ★",
    "love this",
    "off-stage",
    "this one ♡",
  ];
  const pickHandNote = (seed) => HAND_NOTES[seed % HAND_NOTES.length];

  // ============================================================
  // 外壳装饰（一次性渲染，整个 photo-stage 共用）
  // ============================================================

  function appendStageDecor(stage) {
    const decor = document.createDocumentFragment();

    const holo = document.createElement("div");
    holo.className = "holo-bg";
    holo.setAttribute("aria-hidden", "true");
    decor.appendChild(holo);

    const grid = document.createElement("div");
    grid.className = "grid-bg";
    grid.setAttribute("aria-hidden", "true");
    decor.appendChild(grid);

    const lined = document.createElement("div");
    lined.className = "paper paper-lined paper-ps-lined";
    lined.setAttribute("aria-hidden", "true");
    decor.appendChild(lined);

    const pink = document.createElement("div");
    pink.className = "paper paper-pink paper-ps-pink";
    pink.id = "ps-paper-pink";
    pink.setAttribute("aria-hidden", "true");
    decor.appendChild(pink);

    const w1 = document.createElement("span");
    w1.className = "washi washi-ps-1";
    w1.id = "ps-washi-1";
    w1.setAttribute("aria-hidden", "true");
    decor.appendChild(w1);

    const w2 = document.createElement("span");
    w2.className = "washi washi-ps-2";
    w2.id = "ps-washi-2";
    w2.setAttribute("aria-hidden", "true");
    decor.appendChild(w2);

    // 固定漂浮：4 个 emoji 散落（位置随章节略动 → 但目前固定，避免每翻一张视觉跳动）
    const emojiPool = [
      ["💖", 10, 16],
      ["🦋", 88, 14],
      ["✨", 8, 78],
      ["🎀", 86, 82],
    ];
    emojiPool.forEach(([ch, x, y], i) => {
      const span = document.createElement("span");
      span.className = "ps-floater";
      span.style.left = `${x}%`;
      span.style.top = `${y}%`;
      span.style.setProperty("--rot", `${(i * 4 - 6).toFixed(0)}deg`);
      span.style.setProperty("--delay", `${i * 0.5}s`);
      span.textContent = ch;
      span.setAttribute("aria-hidden", "true");
      decor.appendChild(span);
    });

    stage.appendChild(decor);
  }

  // ============================================================
  // 主流程
  // ============================================================

  const PHOTO_DIR = "public/photos";

  async function loadManifest() {
    const res = await fetch("data/photos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`photos.json fetch failed: ${res.status}`);
    return res.json();
  }

  function buildPhotoSeries(photos) {
    const selected = photos.filter(
      (p) => p.selected && p.kind === "image" && !p.broken
    );
    selected.sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));

    const seasonOrder = { spring: 0, summer: 1, autumn: 2, winter: 3 };
    const chapterKeys = [];
    const seenKeys = new Set();
    for (const p of selected) {
      const d = parseTakenAt(p.takenAt);
      const ch = chapterKeyOf(d);
      const key = `${ch.year}-${ch.season.key}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        chapterKeys.push({ key, year: ch.year, seasonKey: ch.season.key, seasonCn: ch.season.cn });
      }
    }
    chapterKeys.sort(
      (a, b) =>
        a.year - b.year || seasonOrder[a.seasonKey] - seasonOrder[b.seasonKey]
    );
    const chapterIdxByKey = new Map();
    chapterKeys.forEach((ck, i) => chapterIdxByKey.set(ck.key, i));

    return selected.map((p) => {
      const d = parseTakenAt(p.takenAt);
      const ch = chapterKeyOf(d);
      const key = `${ch.year}-${ch.season.key}`;
      return {
        photo: p,
        year: ch.year,
        seasonCn: ch.season.cn,
        chapterIdx: chapterIdxByKey.get(key),
      };
    });
  }

  function buildHeroShell() {
    const fig = document.createElement("figure");
    fig.className = "polaroid polaroid-hero";
    fig.id = "hero-polaroid";

    const tape = document.createElement("span");
    tape.className = "tape-corner tl";
    tape.id = "hero-tape";
    tape.setAttribute("aria-hidden", "true");
    fig.appendChild(tape);

    const picture = document.createElement("picture");
    picture.id = "hero-picture";
    const source = document.createElement("source");
    source.id = "hero-source";
    source.type = "image/webp";
    picture.appendChild(source);
    const img = document.createElement("img");
    img.id = "hero-img";
    img.alt = "";
    img.decoding = "async";
    picture.appendChild(img);
    fig.appendChild(picture);

    const cap = document.createElement("figcaption");
    const date = document.createElement("span");
    date.className = "ps-date";
    date.id = "hero-date";
    cap.appendChild(date);
    const note = document.createElement("span");
    note.className = "ps-note";
    note.id = "hero-note";
    cap.appendChild(note);
    fig.appendChild(cap);

    return fig;
  }

  // ============================================================
  // 渲染 hero（翻页时调用，不重建 DOM）
  // ============================================================

  NS.renderHero = function renderHero(entry, idx, total) {
    const { photo, year, seasonCn, chapterIdx } = entry;
    const variant = SCENE_VARIANTS[chapterIdx % SCENE_VARIANTS.length];
    const stage = document.getElementById("photo-stage");
    if (!stage) return;

    // 背景渐变 + 装饰配色：CSS transition 平滑过渡（同章节内完全不变）
    stage.style.background = variant.bg;
    stage.dataset.variant = String(chapterIdx % SCENE_VARIANTS.length);
    const pink = document.getElementById("ps-paper-pink");
    if (pink) pink.style.setProperty("--paper-color", variant.paperPink);
    const w1 = document.getElementById("ps-washi-1");
    const w2 = document.getElementById("ps-washi-2");
    if (w1) w1.style.setProperty("--tape", variant.washiTop);
    if (w2) w2.style.setProperty("--tape", variant.washiAccent);

    // 章节戳 + 进度计数器
    const stamp = document.getElementById("ps-stamp");
    if (stamp) stamp.textContent = `${year} · ${seasonCn}`;
    const counter = document.getElementById("ps-counter");
    if (counter) counter.innerHTML = `<em>${pad3(idx + 1)}</em> / ${pad3(total)}`;

    // Hero picture（只换 src/srcset，不重建节点）
    const base = photo.file.replace(/\.[^.]+$/, "");
    const thumb = `${PHOTO_DIR}/${base}-thumb.webp`;
    const medium = `${PHOTO_DIR}/${base}-medium.webp`;
    const large = `${PHOTO_DIR}/${base}-large.webp`;
    const source = document.getElementById("hero-source");
    const img = document.getElementById("hero-img");
    if (source) {
      source.srcset = `${thumb} 320w, ${medium} 1280w, ${large} 2400w`;
      source.sizes = "(max-width: 600px) 84vw, (max-width: 1100px) 60vw, 50vw";
    }
    if (img) {
      img.src = medium;
      if (photo.width && photo.height) {
        img.width = photo.width;
        img.height = photo.height;
      } else {
        img.removeAttribute("width");
        img.removeAttribute("height");
      }
    }

    // 日期 + 旁注
    const seed = hash(photo.file);
    const d = parseTakenAt(photo.takenAt);
    const dateEl = document.getElementById("hero-date");
    if (dateEl) dateEl.textContent = `${d.getMonth() + 1}·${pad2(d.getDate())}`;
    const noteEl = document.getElementById("hero-note");
    if (noteEl) noteEl.textContent = pickHandNote(seed);

    // 拍立得旋转角度 + 胶带朝向（按照片 hash）
    const fig = document.getElementById("hero-polaroid");
    if (fig) {
      const rot = ((seed % 11) - 5) * 0.6;
      fig.style.setProperty("--rot", `${rot.toFixed(2)}deg`);

      // 翻页动画：先移除再重加，强制 reflow 重启动画
      fig.classList.remove("is-flipping");
      void fig.offsetWidth;
      fig.classList.add("is-flipping");
    }
    const tape = document.getElementById("hero-tape");
    if (tape) tape.className = "tape-corner " + (seed % 2 === 0 ? "tl" : "tr");
  };

  // ============================================================
  // 构造 photo-stage 容器（只跑一次）
  // ============================================================

  NS.buildChapters = async function buildChapters() {
    const mount = document.getElementById("chapters-mount");
    if (!mount) throw new Error("#chapters-mount not found");

    const manifest = await loadManifest();
    const series = buildPhotoSeries(manifest.photos);

    const stage = document.createElement("section");
    stage.id = "photo-stage";
    stage.className = "scene photo-scene hidden";
    appendStageDecor(stage);

    const head = document.createElement("header");
    head.className = "ps-header";
    const stamp = document.createElement("span");
    stamp.className = "stamp stamp-ps";
    stamp.id = "ps-stamp";
    head.appendChild(stamp);
    const counter = document.createElement("span");
    counter.className = "ps-counter";
    counter.id = "ps-counter";
    head.appendChild(counter);
    stage.appendChild(head);

    const body = document.createElement("div");
    body.className = "ps-body";
    body.appendChild(buildHeroShell());
    stage.appendChild(body);

    mount.appendChild(stage);

    NS.photoSeries = series;
    NS.photoTotal = series.length;

    // 初始装载第一张（隐藏状态，由 main.js 翻到时显示）
    if (series.length > 0) {
      NS.renderHero(series[0], 0, series.length);
    }

    return { chapterCount: series.length };
  };
})();
