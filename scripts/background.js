let dataSetListUrl = chrome.runtime.getURL(`data/dataSetList.json`);
fetch(dataSetListUrl)
    .then(response => response.json()) // 解析JSON响应
    .then(dataSetList => {

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url.startsWith("https://platform.worldquantbrain.com/data/data-sets")) {

                try {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['scripts/dataFlag.js'],
                        // world: 'MAIN'
                    }, () => {
                        chrome.scripting.executeScript({
                            target: { tabId },
                            args: [dataSetList],
                            func: (...args) => dataFlagFunc(...args),
                        });
                    });
                    console.log(tab.url);
                }
                catch (error) {
                    console.error('Script injection failed: ', error);
                }
            }
        });
    })
    .catch(error => {
        console.error('Error fetching data:', error);
    });





chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url == "https://platform.worldquantbrain.com/alphas/distribution") {
        try {
            chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['css/distribution.css'],
            });
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['scripts/chart.js', 'scripts/distribution.js'],
                world: 'MAIN'
            });
            console.log(tab.url);
        } catch (error) {
            console.error('Script injection failed: ', error);
        }
    }
});
