// ==UserScript==
// @name         M-Team 繁简转换 (OpenCC 版)
// @namespace    https://github.com/shuiyind/mycode
// @version      1.5
// @description  使用 OpenCC-JS 针对 M-Team 优化的繁转简脚本
// @author       shuiyind
// @match        https://*.m-team.cc/*
// @match        https://*.m-team.io/*
// @updateURL    https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js
// @downloadURL  https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/t2cn.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. 初始化转换器 (t2cn 对应繁转简)
    const converter = OpenCC.Converter({ from: 'hk', to: 'cn' });

    // 2. 核心转换逻辑
    function doConvert(node) {
        const walker = document.createTreeWalker(node || document.body, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while (n = walker.nextNode()) {
            const parentTag = n.parentElement.tagName;
            if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'TEXTAREA') {
                const original = n.nodeValue;
                const result = converter(original);
                if (original !== result) {
                    n.nodeValue = result;
                }
            }
        }
    }

    const start = () => {
        doConvert(document.body);
        document.title = converter(document.title);
    };

    start();

    // 3. 监听动态加载（针对 M-Team 异步加载优化）
    let timer = null;
    const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(start, 300); 
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
