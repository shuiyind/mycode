// ==UserScript==
// @name         M-Team 繁简转换 (OpenCC 优化版)
// @namespace    https://github.com/shuiyind/mycode
// @version      1.6
// @description  高性能零延迟 M-Team 繁简转换，基于 OpenCC-JS 增量渲染
// @author       shuiyind
// @match        https://*.m-team.cc/*
// @match        https://*.m-team.io/*
// @updateURL    https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js
// @downloadURL  https://raw.githubusercontent.com/shuiyind/mycode/main/m-team-t2s/m-team-t2s.user.js
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/t2cn.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 预定义排除标签
    const EXCLUDE_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'INPUT']);
    let converter = null;

    // 初始化转换器
    const initConverter = () => {
        if (typeof OpenCC !== 'undefined' && !converter) {
            converter = OpenCC.Converter({ from: 'hk', to: 'cn' });
        }
        return converter;
    };

    // 核心转换逻辑：处理单个节点及其子节点
    function processNode(node) {
        if (!initConverter()) return;

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                if (EXCLUDE_TAGS.has(n.parentElement?.tagName)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let n;
        while (n = walker.nextNode()) {
            const val = n.nodeValue;
            if (val && /[\u4e00-\u9fa5]/.test(val)) {
                const res = converter(val);
                if (res !== val) n.nodeValue = res;
            }
        }
    }

    // 监听 DOM 变化：实现增量转换，消除延迟
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processNode(node);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    if (EXCLUDE_TAGS.has(node.parentElement?.tagName)) return;
                    const res = converter(node.nodeValue);
                    if (res !== node.nodeValue) node.nodeValue = res;
                }
            });
        }
    });

    // 启动监听
    const start = () => {
        if (document.body) {
            processNode(document.body);
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            // body 尚未加载，等待加载后立即执行
            const bodyObserver = new MutationObserver(() => {
                if (document.body) {
                    bodyObserver.disconnect();
                    processNode(document.body);
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            });
            bodyObserver.observe(document.documentElement, { childList: true });
        }
    };

    // 转换标题
    const convertTitle = () => {
        if (initConverter() && /[\u4e00-\u9fa5]/.test(document.title)) {
            const newTitle = converter(document.title);
            if (newTitle !== document.title) document.title = newTitle;
        }
    };

    // 页面加载即刻启动
    start();
    // 监听标题变化
    const tObs = new MutationObserver(convertTitle);
    tObs.observe(document.querySelector('title') || document.documentElement, { childList: true, characterData: true, subtree: true });
})();
