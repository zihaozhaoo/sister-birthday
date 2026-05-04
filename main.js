// 入口：先让 chapters.js 把动态章节灌进 DOM，再绑定翻页/键盘/触摸/光粉。

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let scenes = [];
let currentIdx = 0;
let prevBtn, nextBtn;

function show(target) {
  const idx = Math.max(0, Math.min(scenes.length - 1, target));
  if (idx === currentIdx) return;

  scenes.forEach((s, j) => {
    s.classList.toggle("hidden", j !== idx);
    s.classList.toggle("show", j === idx);
  });
  scenes[idx].scrollIntoView({ behavior: "smooth", block: "start" });
  currentIdx = idx;
  updatePager();
}

function updatePager() {
  $$(".pager-dots .dot").forEach((d, j) => d.classList.toggle("active", j === currentIdx));
  prevBtn.disabled = currentIdx === 0;
  nextBtn.disabled = currentIdx === scenes.length - 1;
}

function renderPagerDots(count) {
  const ol = $(".pager-dots");
  ol.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    li.className = "dot" + (i === 0 ? " active" : "");
    frag.appendChild(li);
  }
  ol.appendChild(frag);
}

function bindNavigation() {
  prevBtn = $("#prevBtn");
  nextBtn = $("#nextBtn");

  // 音频解锁已由 bindPressPlayEarly 提前绑好；这里只挂场景跳转
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
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("button, a, picture, img")) return;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    (e) => {
      if (touchStartY === null) return;
      if (e.target.closest("button, a, picture, img")) return;
      const dy = e.changedTouches[0].clientY - touchStartY;
      touchStartY = null;
      if (Math.abs(dy) > 80) show(currentIdx + (dy < 0 ? 1 : -1));
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


// ====== 背景音乐（PRESS PLAY 解锁 + 右上角随时切换） ======
let audio, musicToggle;
let pendingRetry = false; // 浏览器拒绝过 play() 时挂的全局兜底

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
  // 只要用户在页面上再点 / 触摸 / 按键一次，就重试一次
  const retry = () => {
    document.removeEventListener("click", retry, true);
    document.removeEventListener("touchend", retry, true);
    document.removeEventListener("keydown", retry, true);
    tryPlay().catch(() => {
      // 第二次还失败说明是权限/系统级（iOS 静音键），交给用户自己点右上角
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
    // eslint-disable-next-line no-console
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

  // 浏览器自动暂停 / 切标签页时同步状态
  audio.addEventListener("play", () => setMusicState(true));
  audio.addEventListener("pause", () => setMusicState(false));
}

// 在 chapters 还没加载好时就把 PRESS PLAY 的「音频解锁」绑上，
// 避免用户看见按钮就点、但 click handler 还没注册的竞态。
function bindPressPlayEarly() {
  const playBtn = document.getElementById("playBtn");
  if (!playBtn) return;
  playBtn.addEventListener("click", armMusic, { once: false });
}

async function init() {
  // 音频元素 + PRESS PLAY 解锁：在 chapters 异步加载之前先绑好
  bindMusic();
  bindPressPlayEarly();

  try {
    await window.NB.buildChapters();
  } catch (err) {
    // 章节构建失败时给 mount 注入降级提示，避免页面看起来"半截"
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
    // eslint-disable-next-line no-console
    console.error("[chapters] build failed:", err);
  }

  scenes = [...$$(".scene")];
  renderPagerDots(scenes.length);
  bindNavigation();
  bindSparkles();
  updatePager();
}

init();
