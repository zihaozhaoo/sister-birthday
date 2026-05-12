// 入口：让 chapters.js 构造唯一的 photo-stage，然后用"虚拟 scenes"实现一张照片一翻：
// scenes 是 static DOM scene + N 个 photo entry 混合的数组；翻到 photo entry 时
// 只调用 NB.renderHero 换 hero 内容，不切换 DOM scene，外壳/装饰稳定不闪烁。

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let scenes = [];
let staticEls = [];
let photoStage = null;
let currentIdx = 0;
let prevBtn, nextBtn;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function show(target) {
  const idx = clamp(target, 0, scenes.length - 1);
  if (idx === currentIdx) return;

  const next = scenes[idx];
  const prev = scenes[currentIdx];
  const enteringPhoto = next.type === "photo";
  const leavingPhoto = prev && prev.type === "photo";

  if (enteringPhoto) {
    // 内容切换：只换 hero，不切 scene
    window.NB.renderHero(next.entry, next.photoIdx, window.NB.photoTotal);

    if (!leavingPhoto) {
      // 从 static (开场/封面) 第一次进入 photo-stage
      staticEls.forEach((el) => {
        el.classList.add("hidden");
        el.classList.remove("show");
      });
      photoStage.classList.remove("hidden");
      photoStage.classList.add("show");
      photoStage.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // photo → photo: 不滚动，外壳保持
  } else {
    // 切到 static scene
    staticEls.forEach((el) => {
      el.classList.add("hidden");
      el.classList.remove("show");
    });
    if (photoStage) {
      photoStage.classList.add("hidden");
      photoStage.classList.remove("show");
    }
    next.el.classList.remove("hidden");
    next.el.classList.add("show");
    next.el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  currentIdx = idx;
  updatePager();
}

function pad3(n) {
  return n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n;
}

function updatePager() {
  const counter = $(".pager-counter");
  if (counter) {
    const cur = scenes[currentIdx];
    if (!cur || cur.type === "static") {
      counter.innerHTML = `<em>${(cur && cur.label) || "·"}</em>`;
    } else {
      const total = window.NB.photoTotal || 0;
      counter.innerHTML = `<em>${pad3(cur.photoIdx + 1)}</em><span class="pc-sep">/</span>${pad3(total)}`;
    }
  }
  if (prevBtn) prevBtn.disabled = currentIdx === 0;
  if (nextBtn) nextBtn.disabled = currentIdx === scenes.length - 1;
}

function renderPagerCounter() {
  const ol = $(".pager-dots");
  if (!ol) return;
  ol.outerHTML = '<div class="pager-counter" aria-hidden="true"></div>';
}

function bindNavigation() {
  prevBtn = $("#prevBtn");
  nextBtn = $("#nextBtn");

  $("#playBtn").addEventListener("click", () => show(1));
  prevBtn.addEventListener("click", () => show(currentIdx - 1));
  nextBtn.addEventListener("click", () => show(currentIdx + 1));

  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const next = ["ArrowDown", "ArrowRight", "PageDown", " "];
    const prev = ["ArrowUp", "ArrowLeft", "PageUp"];
    if (next.includes(e.key)) {
      e.preventDefault();
      show(currentIdx + 1);
    } else if (prev.includes(e.key)) {
      e.preventDefault();
      show(currentIdx - 1);
    }
  });

  let touchStartY = null;
  let touchStartX = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("button, a, picture, img")) return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (touchStartY === null) return;
      if (e.target.closest("button, a, picture, img")) return;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartY = null;
      touchStartX = null;
      // 水平滑动也支持（一张照片一页时，左右滑更自然）
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        show(currentIdx + (dx < 0 ? 1 : -1));
      } else if (Math.abs(dy) > 80) {
        show(currentIdx + (dy < 0 ? 1 : -1));
      }
    },
    { passive: true }
  );
}

// ====== 像素闪粉粒子（光标 / 触摸跟随） ======
const SPARKLE_COLORS = ["#ff2e9f", "#9d4eff", "#00e5ff", "#ffe45e", "#ffb3da"];
let lastSpawn = 0;

function spawnSparkle(x, y) {
  const now = performance.now();
  if (now - lastSpawn < 28) return;
  lastSpawn = now;

  const s = document.createElement("span");
  s.className = "sparkle";
  s.textContent = ["✦", "✧", "✺", "★"][Math.floor(Math.random() * 4)];
  s.style.cssText = `
    position: fixed;
    left: ${x}px; top: ${y}px;
    color: ${SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]};
    font-size: ${10 + Math.random() * 10}px;
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
    text-shadow: 0 0 8px currentColor;
    animation: sparkle-fly .9s ease-out forwards;
    --dx: ${(Math.random() - 0.5) * 60}px;
    --dy: ${-20 - Math.random() * 50}px;
  `;
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1000);
}

function injectSparkleStyles() {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes sparkle-fly {
      0%   { opacity: 1; transform: translate(-50%, -50%) scale(.4); }
      50%  { opacity: 1; }
      100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.2); }
    }
  `;
  document.head.appendChild(styleSheet);
}

function bindSparkles() {
  injectSparkleStyles();
  document.addEventListener("pointermove", (e) => spawnSparkle(e.clientX, e.clientY));
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (t) spawnSparkle(t.clientX, t.clientY);
    },
    { passive: true }
  );
}


// ====== 背景音乐（PRESS PLAY 解锁 + 右下角随时切换） ======
let audio, musicToggle;
let pendingRetry = false;

function setMusicState(playing) {
  if (!musicToggle) return;
  musicToggle.classList.toggle("is-on", playing);
  musicToggle.classList.toggle("is-off", !playing);
  musicToggle.setAttribute("aria-pressed", playing ? "true" : "false");
  const state = musicToggle.querySelector(".mt-state");
  if (state) state.textContent = playing ? "ON" : "OFF";
}

function tryPlay() {
  if (!audio) return Promise.reject(new Error("no audio el"));
  const p = audio.play();
  if (!p || typeof p.then !== "function") {
    setMusicState(true);
    return Promise.resolve();
  }
  return p.then(() => {
    setMusicState(true);
    pendingRetry = false;
  });
}

function armRetryFallback() {
  if (pendingRetry) return;
  pendingRetry = true;
  const retry = () => {
    document.removeEventListener("click", retry, true);
    document.removeEventListener("touchend", retry, true);
    document.removeEventListener("keydown", retry, true);
    tryPlay().catch(() => {
      pendingRetry = false;
    });
  };
  document.addEventListener("click", retry, true);
  document.addEventListener("touchend", retry, true);
  document.addEventListener("keydown", retry, true);
}

function armMusic() {
  if (!audio) return;
  if (!audio.paused) return;
  tryPlay().catch((err) => {
    console.warn("[bgm] play blocked:", err && err.message);
    armRetryFallback();
  });
}

function bindMusic() {
  audio = document.getElementById("bgm");
  musicToggle = document.getElementById("musicToggle");
  if (!audio || !musicToggle) return;

  audio.volume = 0.85;

  musicToggle.addEventListener("click", () => {
    if (audio.paused) {
      tryPlay().catch(() => setMusicState(false));
    } else {
      audio.pause();
      setMusicState(false);
    }
  });

  audio.addEventListener("play", () => setMusicState(true));
  audio.addEventListener("pause", () => setMusicState(false));
}

function bindPressPlayEarly() {
  const playBtn = document.getElementById("playBtn");
  if (!playBtn) return;
  playBtn.addEventListener("click", armMusic, { once: false });
}

async function init() {
  bindMusic();
  bindPressPlayEarly();

  try {
    await window.NB.buildChapters();
  } catch (err) {
    const mount = document.getElementById("chapters-mount");
    if (mount) {
      mount.innerHTML = `
        <section class="scene timeline">
          <div class="memo-card">
            <h4 class="memo-title">⚠ 时间线加载失败</h4>
            <p>无法读取 data/photos.json — 请用静态服务器跑（不能用 file:// 直接打开）。</p>
            <p class="memo-hint">npx serve . 或 python3 -m http.server</p>
          </div>
        </section>`;
    }
    console.error("[chapters] build failed:", err);
  }

  // 构建 scenes 列表：开场幕 + 封面 → 162 张照片（photo-stage 单容器）→ 信
  const curtainEl = $("#curtain");
  const coverEl = $("#cover");
  const letterEl = $("#letter");
  staticEls = [curtainEl, coverEl, letterEl];
  photoStage = document.getElementById("photo-stage");
  const photoSeries = (window.NB && window.NB.photoSeries) || [];
  scenes = [
    { type: "static", el: curtainEl, label: "开场" },
    { type: "static", el: coverEl, label: "封面" },
    ...photoSeries.map((entry, i) => ({ type: "photo", entry, photoIdx: i })),
    { type: "static", el: letterEl, label: "信 ♡" },
  ];

  renderPagerCounter();
  bindNavigation();
  bindSparkles();
  updatePager();
}

init();
