# Video Stream Monitor

一个轻量级的油猴脚本，专为提升 YouTube 和 Bilibili 视频观看体验设计。

## 功能特性
- **IP 定位**：自动解析视频流来源，在控制栏显示 `[国家 城市]`。
- **平滑网速**：采用滑动窗口算法，每秒更新平稳的下载速度，避免数值剧烈跳动。
- **面板换算**：在原生详细信息面板（Stats for Nerds）的 `Kbps` 数据后自动添加绿色的 `MB/s` 标注，更符合直觉。
- **智能过滤**：仅针对下载速度进行换算，不干扰视频码率（DataRate）显示。

## 安装
[点击此处安装脚本](https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js)

## 预览
- **Bilibili**: 显示在右侧控件组（画质/倍速）左邻。
- **YouTube**: 显示在右侧设置按钮左邻。
