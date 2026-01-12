// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.14
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

    // 存储B站速度信息元素的引用，用于MutationObserver
    const biliSpeedElements = new Map();

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
                    let existingAddon = dataNode.querySelector('.mbps-addon');

                    // 获取当前kbps值
                    const kbpsText = dataNode.innerText;
                    const kbpsMatch = kbpsText.match(/[\d.]+/);

                    if (kbpsMatch) {
                        const kbps = parseFloat(kbpsMatch[0]);
                        if (!isNaN(kbps)) {
                            const mbpsValue = (kbps/8000).toFixed(2);

                            if (!existingAddon) {
                                // 如果不存在MB/s标签，则创建一个新的
                                existingAddon = document.createElement('span');
                                existingAddon.className = 'mbps-addon';
                                existingAddon.style = "color:#00ff00; font-weight:bold; margin-left:5px;";
                                dataNode.appendChild(existingAddon);

                                // 如果是B站，保存元素引用用于后续监测
                                if (!host.includes('youtube')) {
                                    biliSpeedElements.set(dataNode, existingAddon);
                                }
                            }

                            // 更新MB/s标签的文本
                            existingAddon.innerText = `(${mbpsValue} MB/s)`;
                        }
                    }
                }
            }
        });
    }

    // 为B站创建MutationObserver来监听DOM变化
    function setupBiliObserver() {
        if (!window.location.host.includes('bilibili')) {
            return; // 只在B站启用
        }

        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // 检查是否有已知的速度元素受到影响
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        // 检查添加的节点是否包含之前的速度元素
                        biliSpeedElements.forEach(function(mbpsSpan, dataNode) {
                            // 如果MB/s标签不见了，重新添加
                            if (!dataNode.contains(mbpsSpan)) {
                                // 重新获取kbps值并更新MB/s显示
                                const kbpsText = dataNode.innerText;
                                const kbpsMatch = kbpsText.match(/[\d.]+/);

                                if (kbpsMatch) {
                                    const kbps = parseFloat(kbpsMatch[0]);
                                    if (!isNaN(kbps)) {
                                        const mbpsValue = (kbps/8000).toFixed(2);
                                        mbpsSpan.innerText = `(${mbpsValue} MB/s)`;
                                        dataNode.appendChild(mbpsSpan); // 重新添加到父节点
                                    }
                                }
                            }
                        });
                    }
                });

                // 检查属性变化（如class变化可能影响元素）
                if (mutation.type === 'attributes' && mutation.target) {
                    biliSpeedElements.forEach(function(mbpsSpan, dataNode) {
                        if (mutation.target === dataNode || dataNode.contains(mutation.target)) {
                            // 如果目标元素或其子元素发生变化，确保MB/s标签仍然存在
                            if (!dataNode.contains(mbpsSpan)) {
                                // 重新获取kbps值并更新MB/s显示
                                const kbpsText = dataNode.innerText;
                                const kbpsMatch = kbpsText.match(/[\d.]+/);

                                if (kbpsMatch) {
                                    const kbps = parseFloat(kbpsMatch[0]);
                                    if (!isNaN(kbps)) {
                                        const mbpsValue = (kbps/8000).toFixed(2);
                                        mbpsSpan.innerText = `(${mbpsValue} MB/s)`;
                                        dataNode.appendChild(mbpsSpan); // 重新添加到父节点
                                    }
                                }
                            }
                        }
                    });
                }
            });
        });

        // 监听整个body的变化，以捕获播放器区域的更新
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'data-state']
        });

        return observer;
    }

    // 初始化B站观察器
    if (window.location.host.includes('bilibili')) {
        setupBiliObserver();
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
