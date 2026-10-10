// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.17
// @description  Real-time monitoring of IP location, smooth network speed, and MB/s conversion for YouTube/Bilibili.
// @author       shuiyind
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      ipapi.co
// @connect      ip-api.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// @updateURL    https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const userLang = navigator.language || 'en';
    const isCN = userLang.includes('zh-CN');
    const isTW = userLang.includes('zh-TW') || userLang.includes('zh-HK');

    let locationInfo = isTW ? "獲取中" : (isCN ? "获取中" : "Fetching...");
    const speedWindow = [];
    let smoothSpeedText = "0.00 MB/s";
    const ipCache = {};

    const infoSpan = document.createElement('span');
    infoSpan.id = 'native-monitor-info';
    infoSpan.style = "margin: 0 15px; white-space: nowrap; font-size: 13px; color: #00ff00; display: inline-block; vertical-align: middle; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.8); pointer-events: none; z-index: 100;";

    function injectUI() {
        if (document.getElementById('native-monitor-info')) return;
        const host = window.location.host;
        const target = host.includes('youtube') ?
            document.querySelector('.ytp-right-controls') :
            (document.querySelector('.bpx-player-control-bottom-right') || document.querySelector('.squirtle-controller-right') || document.querySelector('.bilibili-player-video-control-bottom-right'));

        if (target) {
            if (host.includes('youtube')) infoSpan.style.lineHeight = "48px";
            target.prepend(infoSpan);
        }
    }

    // --- 增强型 IP 获取逻辑 ---
    function fetchPreciseLocation(hostname = '') {
        if (hostname && ipCache[hostname]) { locationInfo = ipCache[hostname]; return; }

        // 使用 ip-api.com 的 JSON 接口 (如果 HTTPS 报错，脚本会自动尝试兼容)
        const apiUrl = hostname ? `http://ip-api.com/json/${hostname}?lang=zh-CN` : `https://ipapi.co/json/`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            timeout: 3000,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    const country = data.country_code || data.countryCode || "";
                    const city = data.city || "";
                    const result = `[${country} ${city}]`.replace(/\s\]/, ']').trim();

                    if (country) {
                        locationInfo = result;
                        if (hostname) ipCache[hostname] = result;
                    } else if (hostname) {
                        // 节点查询无有效结果（如 ip-api 返回 status:fail），回退到出口 IP
                        fetchPreciseLocation('');
                    }
                } catch(e) {
                    // 如果视频节点查询失败，尝试获取本地出口 IP 作为兜底
                    if (hostname) fetchPreciseLocation('');
                }
            },
            onerror: () => { if (hostname) fetchPreciseLocation(''); }
        });
    }

    // 初始获取一次当前位置
    fetchPreciseLocation('');

    // 真实下载速度：用资源条目的 transferSize / duration（字节/秒 -> MB/s）
    const isStreamUrl = (name) => name.includes('googlevideo.com') || name.includes('bilivideo.com') || name.includes('bilivideo.cn');

    const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
            if (!isStreamUrl(entry.name)) return;
            try {
                const url = new URL(entry.name);
                fetchPreciseLocation(url.hostname);
            } catch(e) {}
            if (entry.transferSize > 0 && entry.duration > 0) {
                const speed = entry.transferSize / (1024 * 1024) / (entry.duration / 1000);
                speedWindow.push(speed);
                if (speedWindow.length > 5) speedWindow.shift();
            }
        });
    });
    try {
        observer.observe({ entryTypes: ['resource'] });
    } catch(e) {
        console.warn('[Video Stream Monitor] PerformanceObserver 不支持');
    }

    function enhanceNativeStats() {
        const host = window.location.host;
        const selectors = host.includes('youtube') ?
            '.ytp-sfn-content tr, .ytp-sfn-content > div' :
            '.bpx-player-info-panel .info-line, .bilibili-player-video-info-panel-line';

        document.querySelectorAll(selectors).forEach(line => {
            const text = line.innerText;
            if ((text.includes('Speed') || text.includes('速度')) && text.includes('Kbps')) {
                let dataNode = line.querySelector('span:last-child, .info-data, .content');
                if (!dataNode) dataNode = line; // YouTube 行内可能没有独立数据节点，回退到整行

                // 检查是否已经有MB/s显示
                let existingAddon = dataNode.querySelector('.mbps-addon');

                // 取最后一个数字（值在行尾），并去掉千分位逗号
                const nums = dataNode.innerText.replace(/,/g, '').match(/[\d.]+/g);

                if (nums) {
                    const kbps = parseFloat(nums[nums.length - 1]);
                    if (!isNaN(kbps) && kbps > 0) {
                        const mbpsValue = (kbps / 8000).toFixed(2);

                        if (!existingAddon) {
                            // 如果不存在MB/s标签，则创建一个新的
                            existingAddon = document.createElement('span');
                            existingAddon.className = 'mbps-addon';
                            existingAddon.style = "color:#00ff00; font-weight:bold; margin-left:5px;";
                            dataNode.appendChild(existingAddon);
                        }

                        // 更新MB/s标签的文本
                        existingAddon.innerText = `(${mbpsValue} MB/s)`;
                    }
                }
            }
        });
    }

    // 为B站创建更精确的MutationObserver来监听统计面板变化
    function setupBiliObserver() {
        if (!window.location.host.includes('bilibili')) {
            return; // 只在B站启用
        }

        let debounceTimer = null;

        const observer = new MutationObserver(function(mutations) {
            let shouldUpdate = false;

            for (const mutation of mutations) {
                if (shouldUpdate) break;

                // 面板内文本变化（如速度数值刷新）也会触发
                if (mutation.type === 'characterData') {
                    shouldUpdate = true;
                    break;
                }

                // 检查添加的节点是否包含info-line
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.querySelector &&
                        (node.classList.contains('info-line') ||
                         node.querySelector('.info-line'))) {
                        shouldUpdate = true;
                        break;
                    }
                }
            }

            if (shouldUpdate) {
                // 防抖，避免自身写入再次触发形成循环
                if (debounceTimer) return;
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    enhanceNativeStats();
                }, 100);
            }
        });

        const attach = () => {
            const panel = document.querySelector('.bpx-player-info-panel');
            if (panel) {
                observer.observe(panel, {
                    childList: true,
                    subtree: true,
                    characterData: true // 速度数值是文本节点变化，必须监听
                });
                bootObserver.disconnect();
                setTimeout(enhanceNativeStats, 50); // 面板刚打开时先刷新一次
            }
        };

        // B站信息面板要等用户点击"详情"才挂载，因此持续等待而不是限时10秒
        const bootObserver = new MutationObserver(attach);
        bootObserver.observe(document.documentElement, { childList: true, subtree: true });
        attach(); // 面板可能已存在
        setTimeout(() => bootObserver.disconnect(), 60000);

        return observer;
    }

    // 初始化B站观察器
    if (window.location.host.includes('bilibili')) {
        setupBiliObserver();
    }

    setInterval(() => {
        injectUI();
        if (speedWindow.length > 0) {
            const avgSpeed = speedWindow.reduce((a, b) => a + b, 0) / speedWindow.length;
            smoothSpeedText = avgSpeed.toFixed(2) + " MB/s";
        }
        infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
    }, 1000);

    if (!window.location.host.includes('bilibili')) {
        setInterval(enhanceNativeStats, 500);
    }
})();
