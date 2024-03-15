chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url == "https://platform.worldquantbrain.com/alphas/distribution") {
        try {
            chrome.scripting.insertCSS({
                target: {tabId: tabId},
                files: ['css/distribution.css'],
            });
            chrome.scripting.executeScript({
                target: {tabId: tabId},
                files: ['scripts/chart.js','scripts/distribution.js'],
                world: 'MAIN'
            });
            console.log(tab.url);
        } catch (error) {
            console.error('Script injection failed: ', error);
        }
    }
});

