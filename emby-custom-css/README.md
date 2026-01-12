# 🎬 Emby Custom CSS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Emby Version](https://img.shields.io/badge/Emby-4.7%2B-green.svg)

提升 Emby 媒体服务器视觉体验的自定义 CSS 样式。

---

## ✨ 主要特性

* **字体美化**：全局引入 **霞鹜文楷 (LXGW WenKai)**，提供更优质的中文阅读体验。
* **沉浸式 UI**：隐藏多余的页脚（Footer）信息及版本标识。
* **现代圆角**：对海报、按钮及卡片进行了圆角处理，视觉更柔和。
* **界面精简**：去除了部分不必要的标题和装饰，使界面更清爽。

## 🚀 如何使用

### 方法 A：直接复制（推荐）
1.  打开 `emby-custom-css.css` 文件。
2.  全选并复制所有代码。
3.  登录 Emby 服务端：`设置` -> `管理` -> `控制台` -> `设置` -> `界面`。
4.  在 **自定义 CSS** 文本框中粘贴代码，保存即可。

### 方法 B：外链导入（需公网/CDN）
将以下代码填入 Emby 的自定义 CSS 框中：
```css
@import url("[https://cdn.jsdelivr.net/gh/shuiyind/mycode@main/emby-custom-css/emby-custom-css.css](https://cdn.jsdelivr.net/gh/shuiyind/mycode@main/emby-custom-css/emby-custom-css.css)");
