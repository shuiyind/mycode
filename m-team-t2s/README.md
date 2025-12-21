# M-Team 繁简转换 (OpenCC 版)

针对 M-Team 专门优化的繁体转简体脚本，基于官方最新的 OpenCC-JS 引擎。

### 🚀 一键安装
[![Install](https://img.shields.io/badge/Install-Click%20to%20Install-green?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js)

> **注意**：安装前请确保浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) 插件。

### ✨ 功能特点
- **精准转换**：使用 OpenCC 港台标准进行繁转简。
- **动态支持**：完美支持 M-Team 的异步加载、列表翻页和悬停预览转换。
- **性能优化**：加入防抖逻辑，避免页面滚动时产生卡顿。
- **自动更新**：脚本托管于 GitHub，支持通过油猴自动检查并同步最新版本。

### 🛠 故障排查
如果脚本未生效，请检查：
1. 脚本是否已开启。
2. 访问的域名是否匹配（支持 `.cc` 和 `.io`）。
3. 按 `F12` 查看控制台是否有 `OpenCC is not defined` 报错。
