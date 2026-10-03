# M-Team 繁简转换 (OpenCC 高性能版)

针对 M-Team 专门优化的繁体转简体脚本，采用增量渲染技术，实现零延迟、无感知的阅读体验。

### 🚀 一键安装
[![Install](https://img.shields.io/badge/Install-Click%20to%20Install-green?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js)

### ✨ 功能特点
- **零延迟转换**：采用 `document-start` 注入与增量 `MutationObserver` 技术，节点渲染即转换，消除视觉闪烁。
- **精准识别**：基于 [OpenCC-JS](https://github.com/BYVoid/OpenCC) 港台标准字典，支持一简多繁的智能处理。
- **智能过滤**：自动排除 `CODE`、`PRE`、输入框等区域，确保技术参数与代码原样保留。
- **动态适配**：完美支持 M-Team 的异步加载列表、悬停预览弹窗及翻页功能。

### 🛠 技术细节
- **注入时机**：`document-start`。
- **转换引擎**：OpenCC-JS (hk -> cn)。
- **优化策略**：使用 `TreeWalker` 与增量 DOM 监听，避开全量扫描，极低 CPU 占用。

### 📄 开源协议
MIT License
