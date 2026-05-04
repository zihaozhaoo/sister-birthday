// 场景切换 + 像素闪粉跟随光标
// 音频接入留 TODO，等 mp3 到位再补

const $ = (sel) => document.querySelector(sel);

const curtain = $("#curtain");
const cover = $("#cover");
const timeline = $("#timeline");
const playBtn = $("#playBtn");
const enterBtn = $("#enterTimelineBtn");

function showScene(el) {
  [curtain, cover, timeline].forEach((s) => s.classList.add("hidden"));
  el.classList.remove("hidden");
  el.classList.add("show");
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

playBtn.addEventListener("click", () => {
  // TODO: audio.play() 等 mp3 接入
  showScene(cover);
});

enterBtn.addEventListener("click", () => showScene(timeline));


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
document.addEventListener("touchmove", (e) => {
  const t = e.touches[0];
  if (t) spawnSparkle(t.clientX, t.clientY);
}, { passive: true });
