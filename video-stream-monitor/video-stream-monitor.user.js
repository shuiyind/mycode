// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.3
// @description  Real-time monitoring of IP location, smooth network speed, and MB/s conversion for YouTube/Bilibili.
// @description:zh-CN  实时视频流信息监控：显示IP定位、平滑网速及原生面板MB/s换算。
// @description:zh-TW  即時影片串流資訊監控：顯示IP定位、平滑網速及原生面板MB/s換算。
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

    // --- 逻辑与 UI 配置 ---
    const userLang = navigator.language || 'en';
    const isCN = userLang.includes('zh-CN');
    const isTW = userLang.includes('zh-TW') || userLang.includes('zh-HK');
    
    let locationInfo = isTW ? "獲取中" : (isCN ? "获取中" : "Fetching...");
    let lastBuffered = 0;
    let lastTime = Date.now();
    const speedWindow = []; 
    const windowSize = 5; 
    let smoothSpeedText = "0.00 MB/s";
    const ipCache = {}; 

    const infoSpan = document.createElement('span');
    infoSpan.id = 'native-monitor-info';
    infoSpan.style = "margin: 0 12px; white-space: nowrap; font-size: 13px; color: #00ff00; display: inline-block; vertical-align: middle; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.5); pointer-events: none; transition: all 0.3s;";

    function injectUI() {
        if (document.getElementById('native-monitor-info')) return;
        const host = window.location.host;
        if (host.includes('youtube')) {
            const ytRight = document.querySelector('.ytp-right-controls');
            if (ytRight) { 
                infoSpan.style.lineHeight = "48px"; 
                ytRight.insertBefore(infoSpan, ytRight.firstChild); 
            }
        } else if (host.includes('bilibili')) {
            const biliRight = document.querySelector('.bpx-player-control-bottom-right') || document.querySelector('.squirtle-controller-right');
            if (biliRight) {
                biliRight.insertBefore(infoSpan, biliRight.firstChild);
            }
        }
    }

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
            document.querySelectorAll('.bpx-player-info-panel .info-line').forEach(line => {
                const title = line.querySelector('.info-title'), data = line.querySelector('.info-data');
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

    function fetchPreciseLocation(hostname) {
        if (ipCache[hostname]) { locationInfo = ipCache[hostname]; return; }
        if (!hostname.includes('googlevideo') && !hostname.includes('bilivideo')) return;

        GM_xmlhttpRequest({
            method: "GET",
            url: `https://ipapi.co/${hostname}/json/`,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.country_name) {
                        const resStr = `[${data.country_code} ${data.city || ''}]`.trim();
                        locationInfo = resStr;
                        ipCache[hostname] = resStr;
                    }
                } catch(e) { console.error("Monitor: IP fetch failed", e); }
            }
        });
    }

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

    setInterval(() => {
        injectUI();
        const video = document.querySelector('video');
        if (video && video.buffered.length > 0) {
            const now = Date.当前();
            const duration = (当前 - lastTime) / 1000;
            const currentEnd = video.buffered.end(video.buffered.length - 1);
            const growth = currentEnd - lastBuffered;
            
            if (duration > 0 && growth >= 0) {
                const speed = (growth * 0.45) / duration; 
                speedWindow.push(speed);
            }
            
            if (speedWindow.length > windowSize) speedWindow.shift();
            const avgSpeed = speedWindow.length > 0 ? speedWindow.reduce((a, b) => a + b, 0) / speedWindow.length : 0;
            smoothSpeedText = avgSpeed.toFixed(2) + " MB/s";
            
            lastBuffered = currentEnd;
            lastTime = now;
        }
        infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
    }, 1000);

    setInterval(enhanceNativeStats, 500);
})();
