// 场景切换 + 翻页导航（按钮 / 键盘 / 触摸滑动）+ 像素闪粉跟随光标
// 音频接入留 TODO，等 mp3 到位再补

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const scenes = [$("#curtain"), $("#cover"), $("#timeline")];
let currentIdx = 0;

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

// PRESS PLAY 直接跳到 cover；后续翻页交给 pager
$("#playBtn").addEventListener("click", () => show(1));

const prevBtn = $("#prevBtn");
const nextBtn = $("#nextBtn");
prevBtn.addEventListener("click", () => show(currentIdx - 1));
nextBtn.addEventListener("click", () => show(currentIdx + 1));

// 键盘快捷键：↑↓←→ / PageUp/Down / 空格
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

// 触摸滑动：上滑 = 下一页，下滑 = 上一页
let touchStartY = null;
document.addEventListener(
  "touchstart",
  (e) => {
    if (e.target.closest("button, a")) return;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);
document.addEventListener(
  "touchend",
  (e) => {
    if (touchStartY === null) return;
    if (e.target.closest("button, a")) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartY = null;
    if (Math.abs(dy) > 80) show(currentIdx + (dy < 0 ? 1 : -1));
  },
  { passive: true }
);

updatePager();


// ====== 像素闪粉粒子（光标 / 触摸跟随） ======
const sparkleColors = ["#ff2e9f", "#9d4eff", "#00e5ff", "#ffe45e", "#ffb3da"];
let lastSpawn = 0;

function spawnSparkle(x, y) {
  const now = performance.now();
  if (now - lastSpawn < 28) return; // 节流
  lastSpawn = now;

  const s = document.createElement("span");
  s.className = "sparkle";
  s.textContent = ["✦", "✧", "✺", "★"][Math.floor(Math.random() * 4)];
  s.style.cssText = `
    position: fixed;
    left: ${x}px; top: ${y}px;
    color: ${sparkleColors[Math.floor(Math.random() * sparkleColors.length)]};
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

// 注入闪粉的关键帧（一次性）
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes sparkle-fly {
    0%   { opacity: 1; transform: translate(-50%, -50%) scale(.4); }
    50%  { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.2); }
  }
`;
document.head.appendChild(styleSheet);

document.addEventListener("pointermove", (e) => spawnSparkle(e.clientX, e.clientY));
document.addEventListener("touchmove",
  (e) => {
    const t = e.touches[0];
    if (t) spawnSparkle(t.clientX, t.clientY);
  },
  { passive: true }
);
