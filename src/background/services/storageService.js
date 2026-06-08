export function getLocalValue(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (items) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve(items?.[key]);
        });
    });
}

export function setLocalValue(key, value) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
}

export function removeLocalValue(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(key, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
}
