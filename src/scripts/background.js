// background.js: 后台脚本，用于监听浏览器事件，如标签页更新、插件安装等，以及与content scripts和popup交互
console.log('Background script is running.');
// 以副作用方式加载 pako（UMD 构建会挂到 globalThis.pako），适配 MV3 Service Worker
import './lib/pako.min.js';
import './lib/msgpack.min.js';

const dataSetListUrl = chrome.runtime.getURL(`data/dataSetList.json`);
const dataIsOsUrl = chrome.runtime.getURL(`data/oth/osis_data.bin`);
const REPO_OWNER = "zhangkaihua88";
const REPO_NAME = "WebDataScope";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时检查一次

// 内存中仅会话级别缓存，不做长期持久化
let recentApiRequests = [];
const MAX_RECENT = 200;
// 在此处直接维护需要排除的前缀列表
const EXCLUDED_PREFIXES = [
    'https://api.worldquantbrain.com/errors/api/2/envelope/'
];

// Helper functions for data loading and storage
async function loadDataSetList() {
    let data = await chrome.storage.local.get('dataSetList');
    if (data.dataSetList) {
        console.log('dataSetList loaded from chrome.storage.local');
        return data.dataSetList;
    }

    console.log('Fetching dataSetList from URL...');
    const response = await fetch(dataSetListUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} for ${dataSetListUrl}`);
    }
    const fetchedData = await response.json();
    await chrome.storage.local.set({ dataSetList: fetchedData });
    console.log('dataSetList fetched and saved to chrome.storage.local');
    return fetchedData;
}

async function loadDataIsOs() {
    let data = await chrome.storage.local.get('dataIsOs');
    if (data.dataIsOs) {
        console.log('dataIsOs loaded from chrome.storage.local');
        return data.dataIsOs;
    }

    console.log('Fetching dataIsOs from URL...');
    const response = await fetch(dataIsOsUrl);
    const arrayBuffer = await response.arrayBuffer();
    const inflatedData = globalThis.pako.inflate(new Uint8Array(arrayBuffer));
    const decodedData = globalThis.msgpack.decode(new Uint8Array(inflatedData));
    await chrome.storage.local.set({ dataIsOs: decodedData });
    console.log('dataIsOs fetched, decoded, and saved to chrome.storage.local');
    return decodedData;
}

// 初始化设置
chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        if (!WQPSettings) {
            const defaultSettings = {
                apiAddress: "https://wq-backend.vercel.app",
                hiddenFeatureEnabled: false,
                dataAnalysisEnabled: true,
                geniusAlphaCount: 40,
                geniusCombineTag: true,
                apiMonitorEnabled: true,
            };
            chrome.storage.local.set({ WQPSettings: defaultSettings }, () => {
                console.log('Default settings have been applied.');
            });
        } else {
            console.log('Current settings:', WQPSettings);
        }
    });
    // Ensure dataSetList is loaded and persisted on install
    await loadDataSetList(); 
    await loadDataIsOs(); // Also load and persist dataIsOs on install
    checkUpdate();
});

// 设置定时器，每天检查一次更新
chrome.runtime.onStartup.addListener(() => {
    checkUpdate();
});



// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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


// 监听 api.worldquantbrain.com 的网络请求并广播到页面用于展示
try {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            const url = details.url || '';
            if (!url.includes('api.worldquantbrain.com')) return;
            if (isExcluded(url)) return;
            let body = '';
            if ((details.method || '').toUpperCase() === 'POST' && details.requestBody) {
                body = extractRequestBody(details.requestBody);
            }
            const rec = {
                id: details.requestId,
                time: Date.now(),
                type: 'before',
                method: details.method,
                url,
                body,
                tabId: details.tabId,
            };
            recentApiRequests.push(rec);
            if (recentApiRequests.length > MAX_RECENT) recentApiRequests.shift();
            broadcastRequest(rec);
        },
        { urls: ["https://api.worldquantbrain.com/*"] },
        ["requestBody"]
    );

    chrome.webRequest.onCompleted.addListener(
        (details) => {
            const url = details.url || '';
            if (!url.includes('api.worldquantbrain.com')) return;
            if (isExcluded(url)) return;
            const rec = {
                id: details.requestId,
                time: Date.now(),
                type: 'completed',
                method: details.method,
                url,
                statusCode: details.statusCode,
                tabId: details.tabId,
            };
            recentApiRequests.push(rec);
            if (recentApiRequests.length > MAX_RECENT) recentApiRequests.shift();
            broadcastRequest(rec);
        },
        { urls: ["https://api.worldquantbrain.com/*"] }
    );
} catch (e) {
    console.warn('webRequest listeners failed to register', e);
}

// 内容脚本可主动请求最近 N 条记录
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'REQ_MONITOR_GET_RECENT') {
        // 仅返回最近 100 条，且过滤 tabId 匹配或为 -1 的(无法关联标签的)记录
        const tabId = sender?.tab?.id;
        const list = recentApiRequests
            .filter(r => r.tabId === tabId || r.tabId === -1)
            .slice(-100);
        sendResponse({ ok: true, data: list });
        return true;
    } else if (msg && msg.type === 'REQ_MONITOR_GET_EXCLUDED') {
        sendResponse({ ok: true, data: EXCLUDED_PREFIXES });
        return true;
    } else if (msg && msg.type === 'AGGREGATE_SHARPE_RATIOS') {
        aggregateAllSharpeRatios().then(data => {
            console.log("Aggregated Sharpe Ratios:", data);
            sendResponse({ ok: true, data: data });
        }).catch(error => {
            console.error("Aggregation failed:", error);
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    }
});

async function aggregateAllSharpeRatios() {
    const tabs = await chrome.tabs.query({ url: "*://platform.worldquantbrain.com/*" });
    if (tabs.length === 0) {
        throw new Error("请打开一个 WorldQuant BRAIN 页面后再试。");
    }
    const proxyTabId = tabs[0].id;

    const regions = ['USA', 'EUR', 'ASI', 'AMR', 'GLB', 'CHN', 'TWN', 'KOR', 'JPN'];
    const structure = {};
    
    for (const region of regions) {
        const [injectionResult] = await chrome.scripting.executeScript({
            target: { tabId: proxyTabId },
            func: async (apiUrl) => {
                let results = [];
                let nextUrl = apiUrl;
                while (nextUrl) {
                    const response = await fetch(nextUrl, { credentials: 'include' });
                    if (!response.ok) {
                        throw new Error(`API request failed with status ${response.status}`);
                    }
                    const data = await response.json();
                    results = results.concat(data.results || []);
                    nextUrl = data.next;
                }
                return results;
            },
            args: [`https://api.worldquantbrain.com/data-sets?region=${region}`],
        });
        
        const datasets = injectionResult?.result || [];
        for (const ds of datasets) {
            if (!structure[ds.region]) structure[ds.region] = {};
            if (!structure[ds.region][ds.delay]) {
                structure[ds.region][ds.delay] = new Set();
            }
            structure[ds.region][ds.delay].add(ds.id);
        }
    }

    const dataIsOs = await loadDataIsOs(); // Use the new function to load dataIsOs

    const allData = {};
    for (const region in structure) {
        for (const delay in structure[region]) {
            const regionDelayKey = `${region}_${delay}`;
            const regionDelayData = dataIsOs[regionDelayKey]?.dataset;
            const datasetsForCombo = Array.from(structure[region][delay]);

            if (!allData[region]) allData[region] = {};
            if (!allData[region][delay]) allData[region][delay] = [];
            
            datasetsForCombo.forEach(datasetId => {
                const dataset = regionDelayData?.[datasetId];
                allData[region][delay].push({
                    datasetId: datasetId,
                    "OS/IS Sharpe": dataset?.sharpe_ratio != null ? dataset.sharpe_ratio.toFixed(4) : 'UNKNOWN',
                    "Count": dataset?.count != null ? dataset.count : '--'
                });
            });
        }
    }
    return allData;
}


function broadcastRequest(rec) {
    // 仅向 platform.worldquantbrain.com 的标签分发
    chrome.tabs.query({ url: '*://platform.worldquantbrain.com/*' }, (tabs) => {
        for (const t of tabs) {
            chrome.tabs.sendMessage(t.id, { type: 'REQ_MONITOR_NEW', data: rec });
        }
    });
}


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
        chrome.storage.local.get('lastNotifyDate', async ({ lastNotifyDate }) => {
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
            const currentVersion = chrome.runtime.getManifest().version;
            console.log('最新版本:', latestVersion, '当前版本:', currentVersion);

            // 版本对比
            if (compareVersions(latestVersion, currentVersion) > 0) {
                showNotification(latestVersion, `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/tags/${latestVersion}.zip`);

                // 记录今天已经提醒过
                chrome.storage.local.set({ lastNotifyDate: today });
            }
        });

    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 显示通知
function showNotification(version, url) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('img/logo-128.png'), // 使用插件内的图片
        title: '发现新版本(WorldQuant Scope插件)',
        message: `点击下载 ${version}`,
    }, () => {
        chrome.notifications.onClicked.addListener(() => {
            chrome.tabs.create({ url });
        });
    });
}



// 注入分布图脚本
function injectionDistributionScript(tabId) {
    try {
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['src/css/distribution.css'],
        });
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['src/scripts/lib/chart.js', "src/scripts/utils.js", 'src/scripts/distribution.js'],
        });
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}
// 注入数据标记脚本
async function injectionDataFlagScript(tabId, tab) {
    const dataSetList = await loadDataSetList(); // Use the new function to load dataSetList
    const dataIsOs = await loadDataIsOs();       // Use the new function to load dataIsOs

    console.log('Decoded IS/OS data:', dataIsOs);
    try {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["src/scripts/utils.js", 'src/scripts/dataFlag.js'],
        }, () => {
            chrome.scripting.executeScript({
                target: { tabId },
                args: [dataSetList, dataIsOs, tab.url],
                func: (...args) => dataFlagFunc(...args),
            });
        });

    }
    catch (error) {
        console.error('Script injection failed: ', error);
    }
}

// 注入 Genius 脚本
function injectionGeniusScript(tabId) {
    try {
        // 注入 CSS 文件
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: [
                "src/css/genius.css",
                "src/css/idcard.css",
                "src/css/dataTables.dataTables.css",
                "src/css/columnControl.dataTables.min.css",
                "src/css/responsive.dataTables.min.css",
                "src/css/buttons.dataTables.min.css",
            ],
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("CSS注入失败", chrome.runtime.lastError.message);
            } else {
                console.log("CSS注入成功");
            }
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
                    files: [
                        "src/scripts/requestMonitorUI.js",
                        "src/scripts/lib/jquery-3.7.0.min.js",
                        "src/scripts/lib/jquery.dataTables.min.js",
                        "src/scripts/lib/dataTables.columnControl.min.js",
                        "src/scripts/lib/columnControl.dataTables.min.js",
                        "src/scripts/lib/dataTables.responsive.min.js",
                        "src/scripts/lib/responsive.dataTables.min.js",
                        "src/scripts/lib/dataTables.buttons.min.js",
                        "src/scripts/lib/buttons.colVis.min.js",
                        "src/scripts/lib/buttons.html5.min.js",
                        "src/scripts/lib/highcharts.js",
                        "src/scripts/utils.js",
                        "src/scripts/uiCard.js",
                        "src/scripts/genius.js"],
                });
            }
            else {
                // 如果 OptUrl 已定义，则直接注入数据
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    args: [],
                    func: (...args) => watchForElementAndInsertButton(...args),
                });
                // 同时确保请求监视器 UI 注入
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["src/scripts/requestMonitorUI.js"],
                });
            }
        });
        console.log(tabId.url);
    } catch (error) {
        console.error('Script injection failed: ', error);
    }
}

function isExcluded(url) {
    if (!url) return false;
    if (!Array.isArray(EXCLUDED_PREFIXES) || EXCLUDED_PREFIXES.length === 0) return false;
    return EXCLUDED_PREFIXES.some(p => typeof p === 'string' && url.startsWith(p));
}

const MAX_BODY_LEN = 2000;
function extractRequestBody(requestBody) {
    try {
        if (!requestBody) return '';
        if (requestBody.formData) {
            const parts = [];
            for (const k of Object.keys(requestBody.formData)) {
                const vals = requestBody.formData[k];
                if (Array.isArray(vals)) {
                    for (const v of vals) parts.push(`${k}=${String(v)}`);
                } else {
                    parts.push(`${k}=${String(vals)}`);
                }
            }
            return parts.join('&').slice(0, MAX_BODY_LEN);
        }
        if (requestBody.raw && Array.isArray(requestBody.raw) && requestBody.raw.length > 0) {
            const chunk = requestBody.raw[0];
            const bytes = chunk.bytes;
            if (bytes) {
                const u8 = new Uint8Array(bytes);
                const txt = new TextDecoder('utf-8').decode(u8);
                return txt.slice(0, MAX_BODY_LEN);
            }
        }
    } catch (e) {
        console.warn('extractRequestBody failed', e);
    }
    return '';
}
