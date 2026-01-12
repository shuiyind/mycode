# 🎬 Emby Custom CSS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Emby Version](https://img.shields.io/badge/Emby-4.7%2B-green.svg)

一套精简、高效的 Emby 媒体服务器视觉优化方案。

---

## ✨ 核心特性

* **🖋️ 字体重塑**：全局引入 **霞鹜文楷 (LXGW WenKai)**，内置 CDN 加速。
* **📺 纯净模式**：隐藏页脚版本号、Logo 及冗余界面元素。
* **📱 响应式布局**：针对不同屏幕尺寸优化了全屏显示效果。
* **🧩 现代交互**：统一按钮及海报卡片的圆角风格，提升视觉一致性。

## 🚀 快速使用

### 方式 1：直接粘贴 (推荐)
复制 [`emby-custom-css.css`](./emby-custom-css.css) 中的全部代码，粘贴至 Emby **控制台 -> 设置 -> 通用 -> 自定义 CSS** 框内即可。

### 方式 2：远程导入
在 Emby 自定义 CSS 框内输入以下代码，实现自动同步更新：
```css
@import url("[https://fastly.jsdelivr.net/gh/shuiyind/mycode@main/emby-custom-css/emby-custom-css.css](https://fastly.jsdelivr.net/gh/shuiyind/mycode@main/emby-custom-css/emby-custom-css.css)");
