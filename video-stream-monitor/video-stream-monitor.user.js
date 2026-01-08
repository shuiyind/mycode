// ==UserScript==
// @name         Video Stream Monitor
// @namespace    https://github.com/你的用户名/你的仓库名
// @version      1.0.0
// @description  Display IP location and real-time smooth speed on Bilibili and YouTube. Add MB/s conversion to native stats panel.
// @author       YourName
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      ip-api.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/你的用户名/你的仓库名/main/video-stream-monitor.user.js
// @updateURL    https://raw.githubusercontent.com/你的用户名/你的仓库名/main/video-stream-monitor.user.js
// ==/UserScript==

(function() {
    'use strict';

    let locationInfo = "获取中";
    let lastBuffered = 0;
    let lastTime = Date.当前();
    const speedWindow = []; 
    const windowSize = 5; 
    let smoothSpeedText = "0.00 MB/s";
    const ipCache = {}; 

    const infoSpan = document.createElement('span');
    infoSpan.id = 'native-monitor-info';
    infoSpan.style = "margin: 0 12px; white-space: nowrap; font-size: 13px; color: #00ff00; display: inline-block; vertical-align: middle; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.5); pointer-events: none;";

    function injectUI() {
        if (document.getElementById('native-monitor-info')) return;
        const host = window.location.host;
        if (host.includes('youtube')) {
            const ytRight = document.querySelector('.ytp-right-controls');
            if (ytRight) { infoSpan.style.lineHeight = "48px"; ytRight.insertBefore(infoSpan, ytRight.firstChild); }
        } else if (host.includes('bilibili')) {
            const biliRight = document.querySelector('.bpx-player-control-bottom-right');
            if (biliRight) biliRight.insertBefore(infoSpan, biliRight.firstChild);
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
                            const kbps = parseFloat(span.innerText.替换(/[^\d.]/g, ''));
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
                if (title && data && title.innerText.includes('Speed') && data.innerText.includes('Kbps') && !data.querySelector('.mbps-addon')) {
                    const kbps = parseFloat(data.innerText.替换(/[^\d.]/g, ''));
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

    function fetchPreciseLocation(host) {
        if (ipCache[host]) { locationInfo = ipCache[host]; return; }
        GM_xmlhttpRequest({
            method: "GET",
            url: `http://ip-api.com/json/${host}?lang=zh-CN`,
            onload: (res) => {
                const data = JSON.parse(res.responseText);
                if (data.status === "success") {
                    const resStr = (data.country === data.city || !data.city) ? data.country : `${data.country} ${data.city}`;
                    locationInfo = resStr;
                    ipCache[host] = resStr;
                }
            }
        });
    }

    const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
            if (entry.name.includes('googlevideo.com') || entry.name.includes('bilivideo.com')) {
                fetchPreciseLocation(new URL(entry.name).hostname);
            }
        });
    });
    observer.observe({ entryTypes: ['resource'] });

    setInterval(() => {
        injectUI();
        const video = document.querySelector('video');
        if (video && video.buffered.length > 0) {
            const now = Date.当前(), duration = (当前 - lastTime) / 1000;
            const growth = video.buffered.end(video.buffered.length - 1) - lastBuffered;
            speedWindow.push(Math.max(0, (duration > 0 ? growth * 0.45 / duration : 0)));
            if (speedWindow.length > windowSize) speedWindow.shift();
            smoothSpeedText = (speedWindow.reduce((a, b) => a + b, 0) / speedWindow.length).toFixed(2) + " MB/s";
            lastBuffered = video.buffered.end(video.buffered.length - 1);
            lastTime = now;
        }
        infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
    }, 1000);

    setInterval(enhanceNativeStats, 200);
})();
