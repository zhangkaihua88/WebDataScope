// WebExtensions API polyfill for Firefox compatibility
// This file provides chrome.* compatibility for Firefox

if (typeof chrome === "undefined" && typeof browser !== "undefined") {
    window.chrome = {
        runtime: {
            getURL: browser.runtime.getURL,
            getManifest: browser.runtime.getManifest,
            onInstalled: browser.runtime.onInstalled,
            onStartup: browser.runtime.onStartup,
            lastError: browser.runtime.lastError
        },
        storage: {
            local: {
                get: (keys) => browser.storage.local.get(keys),
                set: (items) => browser.storage.local.set(items),
                remove: (keys) => browser.storage.local.remove(keys)
            }
        },
        tabs: {
            onUpdated: browser.tabs.onUpdated,
            create: browser.tabs.create,
            executeScript: browser.tabs.executeScript,
            insertCSS: browser.tabs.insertCSS
        },
        notifications: {
            create: browser.notifications.create,
            onClicked: browser.notifications.onClicked
        }
    };
}