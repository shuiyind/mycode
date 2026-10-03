// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.2.4
// @description  Real-time monitoring of IP location, smooth network speed, and MB/s conversion for YouTube/Bilibili.
// @author       shuiyind
// @match        *://www.bilibili.com/video/*
// @match        *://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      cf-ns.com
// @connect      ipinfo.io
// @connect      ip-api.com
// @connect      ipapi.co
// @connect      cp.cloudflare.com
// @connect      cloudflare-dns.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// @updateURL    https://raw.githubusercontent.com/shuiyind/mycode/main/video-stream-monitor/video-stream-monitor.user.js
// ==/UserScript==

(function() {
    'use strict';

    const userLang = navigator.language || 'en';
    const isCN = userLang.includes('zh-CN');
    const isTW = userLang.includes('zh-TW') || userLang.includes('zh-HK');

    let locationInfo = isTW ? "\u6458\u53d6\u4e2d" : (isCN ? "\u83b7\u53d6\u4e2d" : "Fetching...");
    const speedWindow = [];
    let smoothSpeedText = "0.00 MB/s";
    const ipCache = {};
    let panelRefreshTimer = null;
    let lastBuffered = 0;
    let lastTime = Date.now();
    let perfObserver = null;
    let biliPanelObserver = null;
    let panelDebounceTimer = null;
    let updateTimer = null;

    const infoSpan = document.createElement('span');
    infoSpan.id = 'native-monitor-info';
    infoSpan.style = "margin: 0 15px; white-space: nowrap; font-size: 13px; color: #00ff00; display: inline-block; vertical-align: middle; font-weight: bold; text-shadow: 1px 1px 1px rgba(0,0,0,0.8); pointer-events: none; z-index: 100;";

    function injectUI() {
        if (document.getElementById('native-monitor-info')) return;
        const host = window.location.host;
        let target = null;
        if (host.includes('youtube')) {
            target = document.querySelector('.ytp-right-controls');
        } else if (host.includes('bilibili')) {
            target = document.querySelector('.bpx-player-control-bottom-right') ||
                     document.querySelector('.squirtle-controller-right') ||
                     document.querySelector('.bilibili-player-video-control-bottom-right');
        }
        if (target) {
            if (host.includes('youtube')) infoSpan.style.lineHeight = '48px';
            target.prepend(infoSpan);
        }
    }

    // API \u94fe: Cloudflare Trace -> ipinfo.io -> ip-api.com -> ipapi.co
    async function fetchIPInfo(apiUrl, fallbackUrl = null) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: apiUrl,
                timeout: 3000,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        resolve(data);
                    } catch(e) {
                        if (fallbackUrl) {
                            fetchIPInfo(fallbackUrl, null).then(resolve).catch(() => resolve(null));
                        } else resolve(null);
                    }
                },
                onerror: () => {
                    if (fallbackUrl) {
                        fetchIPInfo(fallbackUrl, null).then(resolve).catch(() => resolve(null));
                    } else resolve(null);
                }
            });
        });
    }

    // Resolve hostname to IP via Cloudflare DNS-over-HTTPS
    function resolveHostToIP(hostname) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://cloudflare-dns.com/dns-query?name=' + hostname + '&type=A',
                headers: { 'Accept': 'application/dns-json' },
                timeout: 5000,
                onload: (res) => {
                    console.log('[VSM] DoH response:', res.status, res.responseText.substring(0, 200));
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.Answer) {
                            for (const a of data.Answer) {
                                if (a.type === 1 && a.data) { resolve(a.data); return; }
                            }
                        }
                        resolve(null);
                    } catch(e) { resolve(null); }
                },
                onerror: (e) => { console.log('[VSM] DoH error:', e); resolve(null); },
                ontimeout: () => { console.log('[VSM] DoH timeout'); resolve(null); }
            });
        });
    }

    async function fetchPreciseLocation(hostname = '') {
        if (hostname && ipCache[hostname]) { locationInfo = ipCache[hostname]; return; }
        if (!hostname && ipCache.__global) { locationInfo = ipCache.__global; return; }

        let result = null;

        if (hostname) {
            console.log('[VSM] Resolving CDN hostname:', hostname);
            locationInfo = '[CDN ...\] ';
            const ip = await resolveHostToIP(hostname);
            console.log('[VSM] Resolved IP:', ip);

            if (ip) {
                try {
                    const apiUrl = 'http://ip-api.com/json/' + ip + '?lang=zh-CN';
                    const data = await fetchIPInfo(apiUrl);
                    console.log('[VSM] IP location data:', cc, data && data.city);
                    const cc = data.countryCode || data.country_code || '';
                    if (data && cc) {
                        result = '[' + cc + ' ' + (data.city || '') + ']'
                            .trim();
                        ipCache[hostname] = result;
                    }
                } catch(e) {
                    console.log('[VSM] IP lookup error:', e);
                }
            }

            if (!result) {
                console.log('[VSM] CDN lookup failed, falling back to global');
                await fetchGlobalLocation();
                return;
            }
        } else {
            await fetchGlobalLocation();
        }

        if (result) {
            locationInfo = result;
            console.log('[VSM] Location updated to:', result);
        }
    }

    async function fetchGlobalLocation() {
        // Step 1: Cloudflare Trace\uff08\u6700\u5feb\uff0cHTTP\uff09
        try {
            const traceRes = await fetchIPInfo('http://cp.cloudflare.com/cdn-cgi/trace', null);
            if (traceRes && traceRes.loc) {
                const loc = traceRes.loc;
                const country = loc.split(',')[0] || '';
                const city = loc.split(',')[1] || '';
                if (country || city) {
                    locationInfo = '[' + country + ' ' + city + ']'
                        .trim();
                    ipCache.__global = locationInfo;
                    return;
                }
            }
        } catch(e) {}

        // Step 2: ipinfo.io\uff08\u652f\u6301 HTTPS\uff09
        try {
            const data = await fetchIPInfo('https://ipinfo.io/json', null);
            if (data && data.country) {
                const city = data.city || '';
                locationInfo = '[' + data.country + ' ' + city + ']';
                ipCache.__global = locationInfo;
                return;
            }
        } catch(e) {}

        // Step 3: ip-api.com
        try {
            const data = await fetchIPInfo('http://ip-api.com/json/?lang=zh-CN', null);
            const cc = data.countryCode || data.country_code || '';
                    if (data && cc) {
                const city = data.city || '';
                locationInfo = '[' + data.country_code + ' ' + city + ']';
                ipCache.__global = locationInfo;
                return;
            }
        } catch(e) {}

        // Step 4: ipapi.co\uff08\u6700\u540e\u519c\u5e95\uff09
        try {
            const data = await fetchIPInfo('https://ipapi.co/json/', null);
            const cc = data.countryCode || data.country_code || '';
                    if (data && cc) {
                const city = data.city || '';
                locationInfo = '[' + data.country_code + ' ' + city + ']';
                ipCache.__global = locationInfo;
            }
        } catch(e) {}
    }

    // \u521d\u59cb\u5316\u5168\u5c40\u4f4d\u7f6e\u67e5\u8be2
    fetchPreciseLocation('');

    // PerformanceObserver \u76d1\u63a7\u89c6\u9891\u6bb5\u4e0b\u8f7d
    function setupPerfObserver() {
        // \u65ad\u5f00\u65e7\u7684 observer \u9632\u6b62\u6cc4\u6f0f
        if (perfObserver) {
            perfObserver.disconnect();
        }

        perfObserver = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                const url = entry.name;
                if (url.includes('googlevideo.com') || url.includes('bilivideo.com') || url.includes('bilivideo.cn')) {
                    try {
                        const urlObj = new URL(url);
                        const hostname = urlObj.hostname;
                console.log('[VSM] PerfObserver detected video resource:', hostname);
                        fetchPreciseLocation(hostname);

                        // \u8ba1\u7b97\u5b9e\u9645\u4e0b\u8f7d\u901f\u5ea6
                        if (entry.transferSize > 0 && entry.duration > 0) {
                            const speedMBps = (entry.transferSize / (1024 * 1024)) / entry.duration;
                            speedWindow.push(speedMBps);
                            if (speedWindow.length > 10) speedWindow.shift();
                        }
                    } catch(e) {}
                }
            });
        });

        try {
            perfObserver.observe({ entryTypes: ['resource'] });
        } catch(e) {
            console.warn('[Video Stream Monitor] PerformanceObserver not supported');
        }
    }

    function enhanceNativeStats() {
        const host = window.location.host;
        let selectors = '';

        if (host.includes('youtube')) {
            selectors = '.ytp-sfn-content tr, .ytp-sfn-content > div';
        } else if (host.includes('bilibili')) {
            selectors = '.bpx-player-info-panel .info-line, .bilibili-player-video-info-panel-line';
        }

        if (!selectors) return;

        document.querySelectorAll(selectors).forEach((line) => {
            const text = line.innerText;
            const isSpeed = text.includes('Speed') || text.includes('\u901f\u5ea6');
            const isKbps = text.includes('Kbps');

            if (isSpeed && isKbps) {
                const dataNode = line.querySelector('span:last-child, .info-data, .content');
                if (!dataNode) return;

                let existingAddon = dataNode.querySelector('.mbps-addon');
                const kbpsMatch = dataNode.innerText.match(/[\d.]+/);

                if (kbpsMatch) {
                    const kbps = parseFloat(kbpsMatch[0]);
                    if (!isNaN(kbps) && kbps > 0) {
                        const mbpsValue = (kbps / 8000).toFixed(2);

                        if (!existingAddon) {
                            existingAddon = document.createElement('span');
                            existingAddon.className = 'mbps-addon';
                            existingAddon.style = 'color:#00ff00; font-weight:bold; margin-left:5px;';
                            dataNode.appendChild(existingAddon);
                        }
                        existingAddon.innerText = '(' + mbpsValue + ' MB/s)';
                    }
                }
            }
        });
    }

    function setupBiliPanelObserver() {
        if (!window.location.host.includes('bilibili')) return;
        if (biliPanelObserver) return; // \u5df2\u7ecf\u8bbe\u7f6e\u8fc7\u4e86

        const waitForPanel = setInterval(() => {
            const panel = document.querySelector('.bpx-player-info-panel');
            if (panel) {
                clearInterval(waitForPanel);

                biliPanelObserver = new MutationObserver((mutations) => {
                    if (panelDebounceTimer) return;
                    panelDebounceTimer = setTimeout(() => {
                        enhanceNativeStats();
                        panelDebounceTimer = null;
                    }, 100);
                });

                biliPanelObserver.observe(panel, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['class']
                });
            }
        }, 500);

        setTimeout(() => clearInterval(waitForPanel), 15000);
    }

    function cleanup() {
        if (perfObserver) { perfObserver.disconnect(); perfObserver = null; }
        if (biliPanelObserver) { biliPanelObserver.disconnect(); biliPanelObserver = null; }
        if (panelDebounceTimer) { clearTimeout(panelDebounceTimer); panelDebounceTimer = null; }
        if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
        if (panelRefreshTimer) { clearInterval(panelRefreshTimer); panelRefreshTimer = null; }
    }

    if (window.location.host.includes('bilibili')) {
        setupBiliPanelObserver();
        // Low-frequency polling fallback every 3s
        panelRefreshTimer = setInterval(() => { try { enhanceNativeStats(); } catch(e) {} }, 3000);
    }

    setupPerfObserver();
    injectUI();

    const lastSpeed = { value: '0.00 MB/s', lastUpdate: 0 };
    updateTimer = setInterval(() => {
        if (!infoSpan.parentNode) {
            injectUI();
        }

        // \u5408\u5e76 PerfObserver \u6570\u636e

        // video.buffered speed
        const video = document.querySelector('video');
        if (video && video.buffered.length > 0) {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            const currentEnd = video.buffered.end(video.buffered.length - 1);
            const growth = currentEnd - lastBuffered;
            if (elapsed > 0 && growth >= 0) {
                const speed = (growth * 0.45) / elapsed;
                speedWindow.push(speed);
                if (speedWindow.length > 10) speedWindow.shift();
            }
            lastBuffered = currentEnd;
            lastTime = now;
        }
        if (speedWindow.length > 0) {
            const avgSpeed = speedWindow.reduce((a, b) => a + b, 0) / speedWindow.length;
            smoothSpeedText = avgSpeed.toFixed(2) + ' MB/s';
        }

        // \u9632\u6296\uff1a\u53ea\u5728\u901f\u5ea6\u53d8\u5316\u8d85\u8fc7 10% \u65f6\u66f4\u65b0 UI
        const newText = locationInfo + ' | ' + smoothSpeedText;
        if (newText !== lastSpeed.value) {
            infoSpan.textContent = newText;
            lastSpeed.value = newText;
        }
    }, 1000);

    // GM \u83dc\u5355\uff1a\u624b\u52a8\u5237\u65b0\u4f4d\u7f6e
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand((isCN ? '\ud83d\udd04 \u5237\u65b0 IP \u4f4d\u7f6e' : '\ud83d\udd04 Refresh IP Location'), () => {
            fetchPreciseLocation('');
        });
        GM_registerMenuCommand((isCN ? "\u26a1 \u5f3a\u5236\u5237\u65b0 B\u7ad9\u9762\u677f" : "\u26a1 Force Refresh Bilibili Panel"), () => { enhanceNativeStats(); });
    }
})();



