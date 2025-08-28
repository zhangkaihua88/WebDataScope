// background.js: 后台脚本，用于监听浏览器事件，如标签页更新、插件安装等，以及与content scripts和popup交互
console.log('Background script is running.');

const dataSetListUrl = browser.runtime.getURL(`data/dataSetList.json`);
let dataSetList = null; // 定义全局变量
const REPO_OWNER = "zhangkaihua88";
const REPO_NAME = "WebDataScope";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时检查一次



// 初始化设置
browser.runtime.onInstalled.addListener(async () => {
    try {
        const { WQPSettings } = await browser.storage.local.get('WQPSettings');
        // 如果没有找到 WQPSettings，则设置默认值
        if (!WQPSettings) {
            const defaultSettings = {
                apiAddress: "https://wq-backend.vercel.app",
                hiddenFeatureEnabled: false,
                dataAnalysisEnabled: true,
                geniusAlphaCount: 40,
                geniusCombineTag: true,
            };

            // 将默认设置保存到存储中
            await browser.storage.local.set({ WQPSettings: defaultSettings });
            console.log('Default settings have been applied.');
        } else {
            console.log('Current settings:', WQPSettings);
        }
        
        // 获取数据集列表
        dataSetList = await getDataSetList();
        checkUpdate();
    } catch (error) {
        console.error('Initialization failed:', error);
    }
});

// 设置定时器，每天检查一次更新
browser.runtime.onStartup.addListener(() => {
    checkUpdate();
});



// 监听标签页更新事件
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url == "https://platform.worldquantbrain.com/alphas/distribution") {
        injectionDistributionScript(tabId);
    } else if (changeInfo.status === 'complete' && tab.url.startsWith("https://platform.worldquantbrain.com/genius")) {
        injectionGeniusScript(tabId);
    } else if (changeInfo.status === 'complete' && (
        tab.url.includes("data/data-sets") ||
        tab.url.includes("data/search/data-fields") ||
        tab.url.includes("data/data-fields")
    )) {
        injectionDataFlagScript(tabId, tab);
    }
});




// ############################## 以下为辅助函数 #################################


// 版本比较函数
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 !== num2) return num1 - num2;
    }
    return 0;
}

// 获取最新版本
async function checkUpdate() {
    try {
        const today = new Date().toISOString().split('T')[0]; // 获取当前日期 (YYYY-MM-DD)

        // 读取存储的上次提醒日期
        const { lastNotifyDate } = await browser.storage.local.get('lastNotifyDate');
        console.log('上次提醒日期:', lastNotifyDate);
        if (lastNotifyDate === today) {
            console.log('今天已经提醒过，无需重复提醒');
            return;
        }
        console.log('今天尚未提醒过，开始检查更新');

        // 获取 GitHub 上的最新版本
        const response = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
        );
        const data = await response.json();
        const latestVersion = data.tag_name.replace(/^v/, ''); // 去除可能的v前缀
        const currentVersion = browser.runtime.getManifest().version;
        console.log('最新版本:', latestVersion, '当前版本:', currentVersion);

        // 版本对比
        if (compareVersions(latestVersion, currentVersion) > 0) {
            showNotification(latestVersion, `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/tags/${latestVersion}.zip`);

            // 记录今天已经提醒过
            await browser.storage.local.set({ lastNotifyDate: today });
        }

    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 显示通知
function showNotification(version, url) {
    browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('img/logo-128.png'), // 使用插件内的图片
        title: '发现新版本(WorldQuant Scope插件)',
        message: `点击下载 ${version}`,
    }).then(() => {
        browser.notifications.onClicked.addListener(() => {
            browser.tabs.create({ url });
        });
    });
}



// 获取数据集列表
async function getDataSetList() {
    const response = await fetch(dataSetListUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${dataSetListUrl}`);
    }
    const data = await response.json(); // Parse JSON data
    return data
}

// 注入分布图脚本
async function injectionDistributionScript(tabId) {
    try {
        await browser.tabs.insertCSS(tabId, {
            file: 'src/css/distribution.css',
        });
        await browser.tabs.executeScript(tabId, {
            file: 'src/scripts/lib/chart.js'
        });
        await browser.tabs.executeScript(tabId, {
            file: 'src/scripts/utils.js'
        });
        await browser.tabs.executeScript(tabId, {
            file: 'src/scripts/distribution.js'
        });
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}
// 注入数据标记脚本
async function injectionDataFlagScript(tabId, tab) {
    if (dataSetList === null) {
        dataSetList = await getDataSetList();
    }
    try {
        await browser.tabs.executeScript(tabId, {
            file: "src/scripts/utils.js"
        });
        await browser.tabs.executeScript(tabId, {
            file: 'src/scripts/dataFlag.js'
        });
        await browser.tabs.executeScript(tabId, {
            code: `dataFlagFunc(${JSON.stringify(dataSetList)}, ${JSON.stringify(tab.url)})`
        });
    }
    catch (error) {
        console.error('Script injection failed: ', error);
    }
}

// 注入 Genius 脚本
async function injectionGeniusScript(tabId) {
    try {
        // 注入 CSS 文件
        const cssFiles = [
            "src/css/genius.css",
            "src/css/idcard.css",
            "src/css/dataTables.dataTables.css",
            "src/css/columnControl.dataTables.min.css",
            "src/css/responsive.dataTables.min.css",
            "src/css/buttons.dataTables.min.css",
        ];
        
        // 顺序注入CSS文件
        for (const cssFile of cssFiles) {
            try {
                await browser.tabs.insertCSS(tabId, { file: cssFile });
            } catch (error) {
                console.error("CSS注入失败", cssFile, error);
            }
        }

        // 检查是否已经注入了js脚本
        try {
            const results = await browser.tabs.executeScript(tabId, {
                code: "typeof OptUrl !== 'undefined';"
            });
            
            if (!results || !results[0]) {
                // 如果 OptUrl 未定义，则注入脚本
                const jsFiles = [
                    "src/scripts/lib/jquery-3.7.0.min.js",
                    "src/scripts/lib/jquery.dataTables.min.js",
                    "src/scripts/lib/dataTables.columnControl.min.js",
                    "src/scripts/lib/columnControl.dataTables.min.js",
                    "src/scripts/lib/dataTables.responsive.min.js",
                    "src/scripts/lib/responsive.dataTables.min.js",
                    "src/scripts/lib/dataTables.buttons.min.js",
                    "src/scripts/lib/buttons.colVis.min.js",
                    "src/scripts/lib/buttons.html5.min.js",
                    "src/scripts/utils.js",
                    "src/scripts/uiCard.js",
                    "src/scripts/genius.js"
                ];
                
                // 顺序注入JavaScript文件
                for (const jsFile of jsFiles) {
                    try {
                        await browser.tabs.executeScript(tabId, { file: jsFile });
                    } catch (error) {
                        console.error('Script injection failed for:', jsFile, error);
                    }
                }
            } else {
                // 如果 OptUrl 已定义，则直接注入数据
                await browser.tabs.executeScript(tabId, {
                    code: "if (typeof watchForElementAndInsertButton === 'function') { watchForElementAndInsertButton(); }"
                });
            }
        } catch (error) {
            console.error('Script check failed: ', error);
        }
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}