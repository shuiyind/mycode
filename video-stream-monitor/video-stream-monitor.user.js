// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.4
// @description  Real-time monitoring of IP location, smooth network speed, and MB/s conversion for YouTube/Bilibili.
// @author       shuiyind
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      ipapi.co
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// @updateURL    https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 状态变量 ---
    const userLang = navigator.language || 'en';
    const isCN = userLang.includes('zh-CN');
    const isTW = userLang.includes('zh-TW') || userLang.includes('zh-HK');
    let locationInfo = isTW ? "獲取中" : (isCN ? "获取中" : "Fetching...");
    let lastBuffered = 0;
    let lastTime = Date.now();
    const speedWindow = []; 
    let smoothSpeedText = "0.00 MB/s";
    const ipCache = {}; 

    // 创建 UI 元素
    const infoSpan = document.createElement('span');
    infoSpan.id = 'native-monitor-info';
    // 增加 z-index 确保不被遮挡，并优化边距
    infoSpan.style = "margin: 0 15px; white-space: nowrap; font-size: 13px; color: #00ff00; display: inline-block; vertical-align: middle; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.8); pointer-events: none; z-index: 10;";

    // --- 核心修复：注入逻辑 ---
    function injectUI() {
        if (document.getElementById('native-monitor-info')) return;
        
        const host = window.location.host;
        if (host.includes('youtube')) {
            // YouTube: 注入到右侧控制栏最左边
            const ytRight = document.querySelector('.ytp-right-controls');
            if (ytRight) {
                infoSpan.style.lineHeight = "48px"; 
                ytRight.prepend(infoSpan); 
            }
        } else if (host.includes('bilibili')) {
            // Bilibili: 兼容新版 bpx-player 和旧版 squirtle
            const biliRight = document.querySelector('.bpx-player-control-bottom-right') || 
                              document.querySelector('.squirtle-controller-right') ||
                              document.querySelector('.bilibili-player-video-control-bottom-right');
            if (biliRight) {
                // 如果是新版 B 站，确保插入在按钮组之前
                biliRight.prepend(infoSpan);
            }
        }
    }

    // --- 原生面板数据增强 ---
    function enhanceNativeStats() {
        const host = window.location.host;
        if (host.includes('youtube')) {
            const rows = document.querySelectorAll('.ytp-sfn-content tr, .ytp-sfn-content > div');
            rows.forEach(row => {
                if (row.innerText.includes('Connection Speed')) {
                    row.querySelectorAll('span').forEach(span => {
                        if (span.innerText.includes('Kbps') && !span.querySelector('.mbps-addon') && span.querySelectorAll('span').length === 0) {
                            const kbps = parseFloat(span.innerText.replace(/[^\d.]/g, ''));
                            if (!isNaN(kbps)) {
                                const mbpsSpan = document.createElement('span');
                                mbpsSpan.className = 'mbps-addon';
                                mbpsSpan.style = "color:#00ff00; font-weight:bold; margin-left:5px;";
                                mbpsSpan.innerText = `(${(kbps/8000).toFixed(2)} MB/s)`;
                                span.appendChild(mbpsSpan);
                            }
                        }
                    });
                }
            });
        } else if (host.includes('bilibili')) {
            document.querySelectorAll('.bpx-player-info-panel .info-line, .bilibili-player-video-info-panel-line').forEach(line => {
                const title = line.querySelector('.info-title, .label'), data = line.querySelector('.info-data, .content');
                if (title && data && (title.innerText.includes('Speed') || title.innerText.includes('速度')) && data.innerText.includes('Kbps') && !data.querySelector('.mbps-addon')) {
                    const kbps = parseFloat(data.innerText.replace(/[^\d.]/g, ''));
                    if (!isNaN(kbps)) {
                        const mbpsSpan = document.createElement('span');
                        mbpsSpan.className = 'mbps-addon';
                        mbpsSpan.style = "color:#00ff00; font-weight:bold; margin-left:5px;";
                        mbpsSpan.innerText = `(${(kbps/8000).toFixed(2)} MB/s)`;
                        data.appendChild(mbpsSpan);
                    }
                }
            });
        }
    }

    // --- IP 获取逻辑 ---
    function fetchPreciseLocation(hostname) {
        if (ipCache[hostname]) { locationInfo = ipCache[hostname]; return; }
        if (!hostname.includes('googlevideo') && !hostname.includes('bilivideo')) return;

        GM_xmlhttpRequest({
            method: "GET",
            url: `https://ipapi.co/${hostname}/json/`,
            timeout: 5000,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.country_code) {
                        locationInfo = `[${data.country_code} ${data.city || ''}]`.trim();
                        ipCache[hostname] = locationInfo;
                    }
                } catch(e) {}
            }
        });
    }

    // 资源监控获取视频 IP
    const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
            if (entry.name.includes('googlevideo.com') || entry.name.includes('bilivideo.com')) {
                try {
                    const url = new URL(entry.name);
                    if (url.hostname) fetchPreciseLocation(url.hostname);
                } catch(e) {}
            }
        });
    });
    observer.observe({ entryTypes: ['resource'] });

    // --- 刷新循环 ---
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
            
            const avgSpeed = speedWindow.length > 0 ? speedWindow.reduce((a, b) => a + b, 0) / speedWindow.length : 0;
            smoothSpeedText = avgSpeed.toFixed(2) + " MB/s";
            
            lastBuffered = currentEnd;
            lastTime = now;
        }
        infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
    }, 1000);

    setInterval(enhanceNativeStats, 500);
})();
