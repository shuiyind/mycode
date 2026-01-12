# 🎬 Emby Custom CSS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Emby Version](https://img.shields.io/badge/Emby-4.7%2B-green.svg)

一套精简、高效的 Emby 媒体服务器视觉优化方案。

---

## ✨ 核心特性

* **🖋️ 字体重塑**：全局引入 **霞鹜文楷 (LXGW WenKai)**，针对中文字体深度优化。
* **📺 纯净模式**：隐藏页脚版本号、Logo 及其他冗余界面元素。
* **📱 响应式布局**：优化不同设备下的全屏显示效果，适配移动端。
* **🧩 现代交互**：统一按钮及海报卡片的圆角风格（12px），观感更柔和。

## 🚀 安装步骤

1.  **获取代码**：打开目录下的 [`emby-custom-css.css`](./emby-custom-css.css) 并**复制全文**。
2.  **进入后台**：登录 Emby 控制台，点击 **设置 -> 通用** (General)。
3.  **应用样式**：找到页面下方的 **“自定义 CSS”** 文本框，粘贴代码并保存。
4.  **即时生效**：刷新浏览器或重新打开 App 即可看到效果。

> **注意**：不建议使用 `@import` 远程导入，因为 Emby 的安全机制通常会拦截外部资源的加载。

## 🛠️ 代码结构说明
* `--- 1. 字体声明 ---`: 远程加载霞鹜文楷字体。
* `--- 2. 基础布局 ---`: 全局变量与核心样式微调。
* `--- 3. 元素隐藏 ---`: 净化 UI，隐藏页脚等无关元素。

---
[⬅️ 返回代码集主页](https://github.com/shuiyind/mycode)
