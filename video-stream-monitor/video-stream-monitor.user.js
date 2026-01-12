// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.12
// @description  Real-time monitoring of IP location, smooth network speed, and MB/s conversion for YouTube/Bilibili.
// @author       shuiyind
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      cp.cloudflare.com
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
    let lastBuffered = 0;
    let lastTime = Date.now();
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

    const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
            if (entry.name.includes('googlevideo.com') || entry.name.includes('bilivideo.com')) {
                try {
                    const url = new URL(entry.name);
                    fetchPreciseLocation(url.hostname);
                } catch(e) {}
            }
        });
    });
    observer.observe({ entryTypes: ['resource'] });

    // 用于存储已添加MB/s标签的元素，避免重复添加
    const processedElements = new Set();

    function enhanceNativeStats() {
        const host = window.location.host;
        const selectors = host.includes('youtube') ?
            '.ytp-sfn-content tr, .ytp-sfn-content > div' :
            '.bpx-player-info-panel .info-line, .bilibili-player-video-info-panel-line';

        document.querySelectorAll(selectors).forEach(line => {
            const text = line.innerText;
            if ((text.includes('Speed') || text.includes('速度')) && text.includes('Kbps')) {
                const dataNode = line.querySelector('span:last-child, .info-data, .content');
                if (dataNode) {
                    // 检查是否已经有MB/s显示
                    const existingAddon = dataNode.querySelector('.mbps-addon');
                    if (!existingAddon) {
                        const kbps = parseFloat(dataNode.innerText.replace(/[^\d.]/g, ''));
                        if (!isNaN(kbps)) {
                            const mbpsSpan = document.createElement('span');
                            mbpsSpan.className = 'mbps-addon';
                            mbpsSpan.style = "color:#00ff00; font-weight:bold; margin-left:5px;";
                            mbpsSpan.innerText = `(${(kbps/8000).toFixed(2)} MB/s)`;
                            dataNode.appendChild(mbpsSpan);

                            // 记录已处理的元素
                            processedElements.add(dataNode);
                        }
                    } else {
                        // 如果已经有MB/s显示，检查是否需要更新数值
                        const kbps = parseFloat(dataNode.innerText.replace(/[^\d.]/g, ''));
                        if (!isNaN(kbps)) {
                            const expectedText = `(${(kbps/8000).toFixed(2)} MB/s)`;
                            if (existingAddon.innerText !== expectedText) {
                                existingAddon.innerText = expectedText;
                            }
                        }
                    }
                }
            }
        });
    }

    setInterval(() => {
        injectUI();
        const video = document.querySelector('video');
        if (video && video.buffered.length > 0) {
            const now = Date.now();
            const duration = (now - lastTime) / 1000;
            const currentEnd = video.buffered.end(video.buffered.length - 1);
            const growth = currentEnd - lastBuffered;

            if (duration > 0 && growth >= 0) {
                const speed = (growth * 0.45) / duration;
                speedWindow.push(speed);
                if (speedWindow.length > 5) speedWindow.shift();
            }

            const avgSpeed = speedWindow.reduce((a, b) => a + b, 0) / (speedWindow.length || 1);
            smoothSpeedText = avgSpeed.toFixed(2) + " MB/s";
            lastBuffered = currentEnd;
            lastTime = now;
        }
        infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
    }, 1000);

    setInterval(enhanceNativeStats, 500);
})();
