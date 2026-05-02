const wishes = [
  "愿你笑容常开，烦恼绕道走 🌷",
  "愿你被世界温柔以待，被生活轻轻拥抱 🤍",
  "愿你眼里有光，心中有梦，脚下有路 ✨",
  "愿新的一岁，所有期待都如约而至 🎁",
  "愿你永远是那个被偏爱的小朋友 🍰",
];

const btn = document.getElementById("wishBtn");
const text = document.getElementById("wishText");

btn.addEventListener("click", () => {
  const pick = wishes[Math.floor(Math.random() * wishes.length)];
  text.textContent = pick;
  text.hidden = false;
});
