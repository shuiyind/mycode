// ==UserScript==
// @name         Video Stream Monitor
// @name:zh-CN   视频流监控
// @name:zh-TW   影片串流監控
// @namespace    https://github.com/shuiyind/mycode
// @version      1.0.7
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

    // 配置选项
    const CONFIG = {
        UPDATE_INTERVAL: 1000,
        STATS_UPDATE_INTERVAL: 500,
        SPEED_WINDOW_SIZE: 5,
        CACHE_DURATION: 300000, // 5分钟缓存
        TIMEOUT: 3000,
        DEBUG: false
    };

    // 多语言支持
    const LANG = {
        cn: {
            fetching: "获取中",
            fallback: "本地IP"
        },
        tw: {
            fetching: "獲取中",
            fallback: "本地IP"
        },
        en: {
            fetching: "Fetching...",
            fallback: "Local IP"
        }
    };

    const userLang = navigator.language || 'en';
    const isCN = userLang.includes('zh-CN');
    const isTW = userLang.includes('zh-TW') || userLang.includes('zh-HK');
    const lang = isTW ? LANG.tw : (isCN ? LANG.cn : LANG.en);

    // 状态管理
    let locationInfo = lang.fetching;
    let lastBuffered = 0;
    let lastTime = Date.now();
    const speedWindow = [];
    let smoothSpeedText = "0.00 MB/s";

    // IP缓存，包含过期时间
    const ipCache = new Map();

    // UI元素
    let infoSpan = null;
    let uiInjected = false;

    // 创建UI元素
    function createUIElement() {
        if (infoSpan) return infoSpan;

        infoSpan = document.createElement('span');
        infoSpan.id = 'native-monitor-info';
        infoSpan.style.cssText = `
            margin: 0 15px;
            white-space: nowrap;
            font-size: 13px;
            color: #00ff00;
            display: inline-block;
            vertical-align: middle;
            font-weight: bold;
            text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
            pointer-events: none;
            z-index: 100;
            line-height: 1.2;
        `;
        return infoSpan;
    }

    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 注入UI元素
    const debouncedInjectUI = debounce(function() {
        if (uiInjected) return;

        const host = window.location.host;
        let target = null;

        if (host.includes('youtube')) {
            target = document.querySelector('.ytp-right-controls');
        } else {
            // 尝试多个可能的选择器
            const selectors = [
                '.bpx-player-control-bottom-right',
                '.squirtle-controller-right',
                '.bilibili-player-video-control-bottom-right'
            ];

            for (const selector of selectors) {
                target = document.querySelector(selector);
                if (target) break;
            }
        }

        if (target) {
            const element = createUIElement();
            target.prepend(element);
            uiInjected = true;
        }
    }, 500);

    function injectUI() {
        debouncedInjectUI();
    }

    // 检查缓存是否有效
    function isCacheValid(hostname) {
        if (!ipCache.has(hostname)) return false;

        const cached = ipCache.get(hostname);
        return (Date.now() - cached.timestamp) < CONFIG.CACHE_DURATION;
    }

    // 从缓存获取位置信息
    function getLocationFromCache(hostname) {
        if (isCacheValid(hostname)) {
            return ipCache.get(hostname).location;
        }
        return null;
    }

    // 设置缓存
    function setCache(hostname, location) {
        ipCache.set(hostname, {
            location: location,
            timestamp: Date.now()
        });
    }

    // 清理过期缓存
    function cleanupCache() {
        const now = Date.now();
        for (const [hostname, cached] of ipCache.entries()) {
            if ((now - cached.timestamp) >= CONFIG.CACHE_DURATION) {
                ipCache.delete(hostname);
            }
        }
    }

    // 获取精确位置信息
    function fetchPreciseLocation(hostname = '') {
        // 如果是主机名且已在缓存中，直接返回
        if (hostname) {
            const cachedLocation = getLocationFromCache(hostname);
            if (cachedLocation) {
                locationInfo = cachedLocation;
                return Promise.resolve(cachedLocation);
            }
        }

        // 使用不同的API服务，增加可靠性
        let apiUrl = '';
        if (hostname) {
            // 优先使用 ip-api.com (使用https以避免混合内容问题)
            apiUrl = `https://ip-api.com/json/${hostname}?lang=${isCN || isTW ? 'zh-CN' : 'en'}`;
        } else {
            // 对于本地IP，使用 ipapi.co
            apiUrl = `https://ipapi.co/json/`;
        }

        // 发起网络请求
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: apiUrl,
                timeout: CONFIG.TIMEOUT,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);

                        if (data.status === 'success' || (!data.status || data.status === 'ok')) {
                            const country = data.country_code || data.countryCode || data.country || "";
                            const city = data.city || "";

                            // 构建位置字符串
                            let result = '';
                            if (country && city) {
                                result = `[${country} ${city}]`;
                            } else if (country) {
                                result = `[${country}]`;
                            } else if (city) {
                                result = `[${city}]`;
                            } else {
                                result = hostname ? `[${lang.fallback}]` : `[${lang.fallback}]`;
                            }

                            // 清理格式
                            result = result.replace(/\s\]/, ']').trim();

                            if (result !== '[ ]' && result !== '[]') {
                                locationInfo = result;
                                if (hostname) {
                                    setCache(hostname, result);
                                }
                            } else {
                                locationInfo = hostname ? `[${lang.fallback}]` : `[${lang.fallback}]`;
                            }

                            resolve(result);
                        } else {
                            throw new Error(`API Error: ${data.message || 'Unknown error'}`);
                        }
                    } catch(e) {
                        console.error('Location fetch error:', e);
                        reject(e);
                    }
                },
                onerror: (error) => {
                    console.error('Network error when fetching location:', error);

                    // 如果是查询特定主机名失败，尝试获取本地IP作为备用
                    if (hostname) {
                        fetchPreciseLocation('').then(resolve).catch(reject);
                    } else {
                        locationInfo = `[${lang.fallback}]`;
                        reject(error);
                    }
                },
                ontimeout: () => {
                    console.warn(`Timeout when fetching location for ${hostname}`);

                    if (hostname) {
                        fetchPreciseLocation('').then(resolve).catch(reject);
                    } else {
                        locationInfo = `[${lang.fallback}]`;
                        reject(new Error('Timeout'));
                    }
                }
            });
        }).catch(error => {
            // 错误处理，确保即使出错也会更新UI
            if (hostname) {
                locationInfo = `[${lang.fallback}]`;
            }
            console.error('Error in fetchPreciseLocation:', error);
        });
    }

    // 初始获取一次当前位置
    fetchPreciseLocation('');

    // 性能观察器，用于检测视频流资源
    const observer = new PerformanceObserver(debounce((list) => {
        list.getEntries().forEach(entry => {
            if (entry.name.includes('googlevideo.com') || entry.name.includes('bilivideo.com')) {
                try {
                    const url = new URL(entry.name);
                    fetchPreciseLocation(url.hostname);
                } catch(e) {
                    if (CONFIG.DEBUG) console.error('Error processing resource entry:', e);
                }
            }
        });
    }, 1000)); // 防抖1秒，避免频繁调用

    try {
        observer.observe({ entryTypes: ['resource'] });
    } catch(e) {
        if (CONFIG.DEBUG) console.error('PerformanceObserver setup failed:', e);
    }

    // 增强原生统计面板
    const debouncedEnhanceStats = debounce(function() {
        const host = window.location.host;
        const selectors = host.includes('youtube') ?
            '.ytp-sfn-content tr, .ytp-sfn-content > div' :
            '.bpx-player-info-panel .info-line, .bilibili-player-video-info-panel-line';

        const elements = document.querySelectorAll(selectors);
        elements.forEach(line => {
            const text = line.innerText;
            if ((text.includes('Speed') || text.includes('速度')) && text.includes('Kbps')) {
                const dataNode = line.querySelector('span:last-child, .info-data, .content');
                if (dataNode && !dataNode.querySelector('.mbps-addon')) {
                    const kbpsText = dataNode.innerText;
                    const kbpsMatch = kbpsText.match(/[\d.]+/);

                    if (kbpsMatch) {
                        const kbps = parseFloat(kbpsMatch[0]);
                        if (!isNaN(kbps)) {
                            const mbpsSpan = document.createElement('span');
                            mbpsSpan.className = 'mbps-addon';
                            mbpsSpan.style.cssText = `
                                color: #00ff00;
                                font-weight: bold;
                                margin-left: 5px;
                            `;
                            mbpsSpan.textContent = `(${(kbps/8000).toFixed(2)} MB/s)`;
                            dataNode.appendChild(mbpsSpan);
                        }
                    }
                }
            }
        });
    }, 1000); // 增加防抖时间到1秒，减少闪烁

    // 主更新循环
    setInterval(() => {
        injectUI();

        const video = document.querySelector('video');
        if (video && video.buffered && video.buffered.length > 0) {
            const now = Date.now();
            const duration = (now - lastTime) / 1000;
            const currentEnd = video.buffered.end(video.buffered.length - 1);
            const growth = currentEnd - lastBuffered;

            if (duration > 0 && growth >= 0) {
                // 使用更准确的计算方法
                const speed = (growth * 0.45) / duration;
                speedWindow.push(speed);

                // 维护固定大小的窗口
                if (speedWindow.length > CONFIG.SPEED_WINDOW_SIZE) {
                    speedWindow.shift();
                }
            }

            // 计算平均速度
            const avgSpeed = speedWindow.reduce((sum, val) => sum + val, 0) / Math.max(speedWindow.length, 1);
            smoothSpeedText = avgSpeed.toFixed(2) + " MB/s";

            lastBuffered = currentEnd;
            lastTime = now;
        }

        // 更新UI显示
        if (infoSpan) {
            infoSpan.textContent = `${locationInfo} | ${smoothSpeedText}`;
        }
    }, CONFIG.UPDATE_INTERVAL);

    // 统计面板增强循环
    setInterval(debouncedEnhanceStats, CONFIG.STATS_UPDATE_INTERVAL);

    // 定期清理缓存
    setInterval(cleanupCache, CONFIG.CACHE_DURATION);

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        if (observer) {
            observer.disconnect();
        }
    });

})();
