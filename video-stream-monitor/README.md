# 🚀 Video Stream Monitor (视频流监控)

一个轻量级的油猴脚本，专为 YouTube 和 Bilibili 深度用户设计。实时监控视频流 CDN 节点地理位置、平滑下载网速，并增强原生统计面板。

---

## ✨ 功能特性

* **多端深度适配**：完美兼容 YouTube (Stats for nerds) 和 Bilibili (新旧版播放器) 的详细统计面板。
* **智能 IP 定位**：
    * 自动解析视频流 CDN 节点的地理位置（显示 `[国家 城市]`）。
    * **双重回退机制**：若无法直接获取视频节点 IP，则自动显示当前用户的出口 IP 位置，告别“获取中”卡死。
* **平滑网速显示**：采用滑动窗口算法，每秒更新平稳的 `MB/s` 数值，避免数据剧烈跳动。
* **面板增强**：在 YouTube/B站 原生的 `Kbps` 数据后自动追加绿色的 `(MB/s)` 换算标注，换算更直观。
* **多语言支持**：界面自适应浏览器语言（支持简/繁/英）。

---

## 📥 安装方式

1.  首先确保已安装 [Tampermonkey](https://www.tampermonkey.net/) (油猴) 扩展。
2.  [点击此处安装脚本](https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js)
3.  **权限说明**：首次运行若弹出跨域请求警告，请选择 **“总是允许全部域名”** 以确保 IP 解析功能正常。

---

## 🛠 技术细节

* **数据接口**：地理位置由 `ipapi.co` 与 `ip-api.com` 动态提供。
* **性能优化**：通过 `PerformanceObserver` 监听资源请求，仅在视频流切换时触发位置更新，极低功耗。
* **安全性**：仅获取视频 CDN 节点的 IP，不涉及用户敏感隐私。

---

## 📝 更新日志

* **v1.0.5**：
    * 更换 HTTPS 兼容接口，解决浏览器安全拦截问题。
    * 增加节点获取失败时的本地 IP 回退机制。
    * 修复 B 站新版 UI (bpx-player) 注入失效及层级遮挡问题。
* **v1.0.3**：修复 `Date.now()` 中文语法错误，优化 GitHub 托管更新规则。
* **v1.0.0**：初始版本发布。

---

## 🤝 贡献与反馈

如果您在使用过程中发现任何 BUG 或有新的功能建议，欢迎提交 [Issues](https://github.com/shuiyind/mycode/issues) 或 Pull Request。
