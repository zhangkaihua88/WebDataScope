export function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.ok) {
                reject(new Error(response?.error || `Request failed: ${type}`));
                return;
            }
            resolve(response.data);
        });
    });
}

export function createCommunityPort(onEvent) {
    const port = chrome.runtime.connect({ name: 'WQP_COMMUNITY_PORT' });
    port.onMessage.addListener((message) => {
        if (typeof onEvent === 'function') onEvent(message);
    });
    port.onDisconnect.addListener(() => {
        if (typeof onEvent === 'function') {
            onEvent({
                type: 'disconnect',
                error: chrome.runtime.lastError?.message || '',
            });
        }
    });
    return {
        run(action, payload = {}) {
            port.postMessage({ type: 'RUN', action, payload });
        },
        disconnect() {
            port.disconnect();
        },
    };
}
