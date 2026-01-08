# Video Stream Monitor (视频流监控)

一个轻量级的油猴脚本，专为提升 YouTube 和 Bilibili 视频观看体验设计。

## ✨ 功能特性
- **多语言自适应**：自动识别浏览器语言，支持 简体中文、繁体中文 及 英文 界面。
- **IP 定位**：自动解析视频流服务器地理位置，显示 `[国家 城市]`。
- **平滑网速**：采用滑动窗口算法，每秒更新平稳的下载速度，避免数值剧烈跳动。
- **面板增强**：在原生详细信息面板的 `Kbps` 数据后自动添加绿色的 `MB/s` 标注。

## 📥 安装
[点击此处安装脚本](https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js)

## 🛠 技术细节
- **数据源**：地理位置由 `ip-api.com` 提供。
- **隐私**：仅获取视频 CDN 节点的 IP，不涉及用户个人 IP 泄露。
- **兼容性**：支持最新版 Bilibili (bpx-player) 和 YouTube 面板。
