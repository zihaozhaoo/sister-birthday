# sister-birthday 🎂

一个送给妹妹的生日小网站，纯静态（HTML / CSS / JS），可一键部署到 Vercel。

## 本地预览

直接用浏览器打开 `index.html` 即可，或用任意静态服务器：

```bash
npx serve .
```

## 部署到 Vercel

1. 进入 [vercel.com/new](https://vercel.com/new)
2. 选择这个 GitHub 仓库（Import）
3. Framework Preset 保持 **Other**，其他默认即可
4. 点 **Deploy**

或使用 CLI：

```bash
npm i -g vercel
vercel
```

## 文件结构

```
.
├── index.html   # 页面结构
├── styles.css   # 样式
├── main.js      # 「许个愿」交互
└── README.md
```

想换祝福语就改 `main.js` 里的 `wishes` 数组；想换配色改 `styles.css` 顶部的 CSS 变量。
