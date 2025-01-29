// background.js: 后台脚本，用于监听浏览器事件，如标签页更新、插件安装等，以及与content scripts和popup交互
console.log('Background script is running.');

const dataSetListUrl = chrome.runtime.getURL(`data/dataSetList.json`);
let dataSetList = null; // 定义全局变量

// 初始化设置
chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        // 如果没有找到 WQPSettings，则设置默认值
        if (!WQPSettings) {
            const defaultSettings = {
                apiAddress: "https://wg-backend.vercel.app",
                hiddenFeatureEnabled: false,
                dataAnalysisEnabled: true,
                geniusAlphaCount: 40,
                geniusCombineTag: true,
            };

            // 将默认设置保存到 Chrome 存储中
            chrome.storage.local.set({ WQPSettings: defaultSettings }, () => {
                console.log('Default settings have been applied.');
            });
        } else {
            console.log('Current settings:', WQPSettings);
        }
    });
    // 获取数据集列表
    dataSetList = await getDataSetList();
});


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url == "https://platform.worldquantbrain.com/alphas/distribution") {
        injectionDistributionScript(tabId);
    } else if (changeInfo.status === 'complete' && tab.url.startsWith("https://platform.worldquantbrain.com/genius")) {
        injectionGeniusScript(tabId);
    } else if (changeInfo.status === 'complete' && tab.url.startsWith("https://platform.worldquantbrain.com/data/data-sets")) {
        injectionDataFlagScript(tabId, tab);
    }
});


// chrome.action.onClicked.addListener(() => {
//     const extensionUrl = chrome.runtime.getURL("html/WQScope.html");
//     chrome.tabs.create({ url: extensionUrl });
// });


async function getDataSetList() {
    const response = await fetch(dataSetListUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${dataSetListUrl}`);
    }
    const data = await response.json(); // Parse JSON data
    return data
}


function injectionDistributionScript(tabId) {
    try {
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['src/css/distribution.css'],
        });
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['src/scripts/lib/chart.js', "src/scripts/utils.js",  'src/scripts/distribution.js'],
        });
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}

async function injectionDataFlagScript(tabId, tab) {
    if (dataSetList === null) {
        dataSetList = await getDataSetList();
    }
    try {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["src/scripts/utils.js", 'src/scripts/dataFlag.js'],
        }, () => {
            chrome.scripting.executeScript({
                target: { tabId },
                args: [dataSetList, tab.url],
                func: (...args) => dataFlagFunc(...args),
            });
        });

    }
    catch (error) {
        console.error('Script injection failed: ', error);
    }
}


function injectionGeniusScript(tabId) {
    try {
        // 注入 CSS 文件
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ["src/css/genius.css", "src/css/idcard.css"],
        });

        // 检查是否已经注入了js脚本
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                return typeof OptUrl !== 'undefined';
            },
        }, (results) => {
            if (!results || !results[0].result) {
                // 如果 OptUrl 未定义，则注入脚本
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["src/scripts/utils.js", "src/scripts/uiCard.js", "src/scripts/genius.js"],
                });
            }
            else {
                // 如果 OptUrl 已定义，则直接注入数据
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    args: [],
                    func: (...args) => watchForElementAndInsertButton(...args),
                });
            }
        });
        console.log(tab.url);
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}