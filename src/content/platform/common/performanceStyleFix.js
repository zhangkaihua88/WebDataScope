/**
 * Performance Page Style Fix
 * 移除 .card-list__cell 元素的 white-space: nowrap 样式
 */

(function() {
    'use strict';

    // 创建并注入自定义样式
    function injectCustomStyles() {
        const styleId = 'wqs-performance-style-fix';
        
        // 检查是否已经注入过
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .card-list__cell {
                white-space: normal !important;
            }
        `;
        
        document.head.appendChild(style);
        console.log('[WQScope] Performance page style fix applied');
    }

    // 等待 DOM 完全加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCustomStyles);
    } else {
        injectCustomStyles();
    }

    // 监听动态加载的内容（使用 MutationObserver）
    const observer = new MutationObserver(function(mutations) {
        // 确保样式仍然存在
        if (!document.getElementById('wqs-performance-style-fix')) {
            injectCustomStyles();
        }
    });

    // 开始观察
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
