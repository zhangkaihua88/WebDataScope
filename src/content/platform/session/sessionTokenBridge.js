(function () {
    'use strict';

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.type !== 'WQP_SESSION_TOKEN_CAPTURED') return;
        const token = String(event.data.token || '').trim();
        if (!token) return;
        try {
            chrome.runtime.sendMessage({
                type: 'WQP_SESSION_TOKEN_CAPTURED',
                token,
            }, () => {
                // Ignore disconnected extension contexts while pages are navigating.
                void chrome.runtime.lastError;
            });
        } catch (_) {
            // Navigation can invalidate the extension context.
        }
    });
})();
