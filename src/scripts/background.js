// background.js: 后台脚本，用于监听浏览器事件，如标签页更新、插件安装等，以及与content scripts和popup交互
console.log('Background script is running.');
// 以副作用方式加载 pako（UMD 构建会挂到 globalThis.pako），适配 MV3 Service Worker
import './lib/pako.min.js';
import './lib/msgpack.min.js';

const dataSetListUrl = chrome.runtime.getURL(`data/dataSetList.json`);
const dataInfoUrl = chrome.runtime.getURL(`data/oth/info_data.bin`);
let dataSetList = null; // 定义全局变量
const REPO_OWNER = "zhangkaihua88";
const REPO_NAME = "WebDataScope";
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24小时检查一次

// IndexedDB 配置 - 用于存储用户导入的数据文件
const DB_NAME = 'WQP_User_Data';
const STORE_NAME = 'dataFiles';
const DB_VERSION = 1;

// 热路径缓存：避免同一页重复从 IndexedDB 读取 info_data
let infoDataCache = null;
let infoDataInflightPromise = null;

function resetInfoDataCache() {
    infoDataCache = null;
    infoDataInflightPromise = null;
}

async function getInfoDataCached() {
    if (infoDataCache) {
        return infoDataCache;
    }

    if (infoDataInflightPromise) {
        return infoDataInflightPromise;
    }

    infoDataInflightPromise = (async () => {
        const result = await getDataFilesFromDB(['data/oth/info_data']);
        const dataInfo = result?.data?.['data/oth/info_data'] || null;
        infoDataCache = dataInfo;
        return dataInfo;
    })();

    try {
        return await infoDataInflightPromise;
    } finally {
        infoDataInflightPromise = null;
    }
}

// IndexedDB Helper for Service Worker
function openUserDB() {
    return new Promise((resolve, reject) => {
        const request = self.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// 保存数据文件到IndexedDB（每个文件单独存储为一个key）
async function saveDataFilesToDB(dataFiles, version) {
    const db = await openUserDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // 清空旧数据
    store.clear();

    // 存储版本
    store.put(version, 'version');

    // 存储每个文件为独立的key
    for (const [key, value] of Object.entries(dataFiles)) {
        store.put(value, key);
    }

    console.log(`Saved ${Object.keys(dataFiles).length} files to IndexedDB`);

    // 数据更新后清理缓存，避免读到旧的 info_data
    resetInfoDataCache();

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

// 从IndexedDB获取指定的数据文件（不读取全部，只读取需要的key）
async function getDataFilesFromDB(keys = null) {
    const db = await openUserDB();
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);

    // 获取版本
    const versionReq = store.get('version');

    return new Promise((resolve, reject) => {
        versionReq.onsuccess = async () => {
            // 如果没有指定keys，获取所有数据文件的key
            if (!keys) {
                const keysReq = store.getAllKeys();
                keysReq.onsuccess = async () => {
                    const allKeys = keysReq.result.filter(k => k !== 'version' && k !== 'data');
                    const data = {};
                    for (const key of allKeys) {
                        const req = store.get(key);
                        await new Promise((res) => {
                            req.onsuccess = () => {
                                data[key] = req.result;
                                res();
                            };
                            req.onerror = () => res();
                        });
                    }
                    resolve({ data, version: versionReq.result });
                };
                keysReq.onerror = () => reject(keysReq.error);
            } else {
                // 只读取指定的keys
                const data = {};
                for (const key of keys) {
                    const req = store.get(key);
                    await new Promise((res) => {
                        req.onsuccess = () => {
                            data[key] = req.result;
                            res();
                        };
                        req.onerror = () => res();
                    });
                }
                resolve({ data, version: versionReq.result });
            }
        };
        versionReq.onerror = () => reject(versionReq.error);
    });
}

// 分块数据接收缓冲区
const dataChunkBuffer = new Map(); // key: version, value: { chunks: [], total: number, received: Set }

// 处理分块数据
async function handleDataChunk(msg) {
    const { chunk, chunkIndex, totalChunks, version, isLast } = msg;

    if (!dataChunkBuffer.has(version)) {
        dataChunkBuffer.set(version, {
            chunks: new Array(totalChunks),
            total: totalChunks,
            received: new Set()
        });
    }

    const buffer = dataChunkBuffer.get(version);
    buffer.chunks[chunkIndex] = chunk;
    buffer.received.add(chunkIndex);

    // 检查是否接收完毕
    if (buffer.received.size === totalChunks) {
        // 计算总大小并合并所有块
        const totalLength = buffer.chunks.reduce((sum, c) => sum + c.length, 0);
        const allBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (let i = 0; i < totalChunks; i++) {
            const chunkBytes = new Uint8Array(buffer.chunks[i]);
            allBytes.set(chunkBytes, offset);
            offset += chunkBytes.length;
        }

        // 解码 JSON
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(allBytes);
        const dataFiles = JSON.parse(jsonStr);

        // 存储到 IndexedDB
        await saveDataFilesToDB(dataFiles, version);

        // 清理缓冲区
        dataChunkBuffer.delete(version);

        console.log('All chunks received and saved to IndexedDB, total bytes:', totalLength);
        return true;
    }

    console.log(`Chunk ${chunkIndex + 1}/${totalChunks} received`);
    return false;
}

// 获取数据块数量
async function getDataChunkCount() {
    const db = await openUserDB();
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const versionReq = store.get('version');
    const dataReq = store.get('data');

    return new Promise((resolve) => {
        versionReq.onsuccess = () => {
            const version = versionReq.result;
            if (!version || !dataChunkBuffer.has(version)) {
                // 数据已存储到IndexedDB，需要重新构建缓冲区
                const data = dataReq.result;
                if (data) {
                    // 将数据转为JSON字符串再分块
                    const jsonStr = JSON.stringify(data);
                    const encoder = new TextEncoder();
                    const dataBytes = encoder.encode(jsonStr);
                    const chunkSize = 1024 * 1024; // 1MB
                    const totalChunks = Math.ceil(dataBytes.length / chunkSize);

                    // 预填充缓冲区
                    const chunks = [];
                    for (let i = 0; i < totalChunks; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, dataBytes.length);
                        chunks.push(Array.from(dataBytes.slice(start, end)));
                    }
                    dataChunkBuffer.set(version, {
                        chunks: chunks,
                        total: totalChunks,
                        received: new Set(Array.from({ length: totalChunks }, (_, i) => i))
                    });
                    console.log('Rebuilt buffer from IndexedDB, chunks:', totalChunks);
                }
                resolve(version ? 1 : 0);
            } else {
                resolve(1);
            }
        };
        versionReq.onerror = () => resolve(0);
    });
}

// 分块获取数据
async function getDataChunk(version, chunkIndex) {
    const buffer = dataChunkBuffer.get(version);
    if (buffer && buffer.chunks[chunkIndex]) {
        return {
            chunk: buffer.chunks[chunkIndex],
            totalChunks: buffer.total,
            chunkIndex: chunkIndex
        };
    }
    return null;
}


// 内存中仅会话级别缓存，不做长期持久化
let recentApiRequests = [];
const MAX_RECENT = 200;
// 在此处直接维护需要排除的前缀列表
const EXCLUDED_PREFIXES = [
    'https://api.worldquantbrain.com/errors/api/2/envelope/'

];


// 初始化设置
chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        // 如果没有找到 WQPSettings，则设置默认值
        if (!WQPSettings) {
            const defaultSettings = {
                apiAddress: "https://wq-backend.vercel.app",
                hiddenFeatureEnabled: false,
                dataAnalysisEnabled: true,
                geniusAlphaCount: 40,
                geniusCombineTag: true,
                apiMonitorEnabled: true,
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
    checkUpdate();
});

// 设置定时器，每天检查一次更新
chrome.runtime.onStartup.addListener(() => {
    checkUpdate();
});



// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const url = tab.url

        const distributionFlag = url == "https://platform.worldquantbrain.com/alphas/distribution"
        const geniusFlag = url.startsWith("https://platform.worldquantbrain.com/genius")
        const dataFlag = (
            url.includes("data/data-sets") ||
            url.includes("data/search/data-fields") ||
            url.includes("data/data-fields")
        )
        const simulateFlag = url.startsWith("https://platform.worldquantbrain.com/simulate")

        if (distributionFlag) {
            injectionDistributionScript(tabId);
        } else if (geniusFlag) {
            injectionGeniusScript(tabId);
        } else if (dataFlag) {
            injectionDataFlagScript(tabId, tab);
        } else if (simulateFlag) {
            injectionSimulateScript(tabId);
        }
    }
});

// 用 webNavigation.onCommitted 在导航提交时（DOM 为空、JS 尚未插入）立即注入到 MAIN world
// 比 tabs.onUpdated 的 'loading' 更早，确保 MutationObserver 在 WQ 第一个 <script> 插入前就已就位
chrome.webNavigation.onCommitted.addListener((details) => {
    // 只处理顶层主框架，忽略 iframe
    if (details.frameId !== 0) return;
    if (!details.url || !details.url.includes('platform.worldquantbrain.com')) return;
    injectFetchInterceptor(details.tabId);
}, { url: [{ hostContains: 'platform.worldquantbrain.com' }] });

// 注入 Fetch 拦截器到页面的 MAIN 环境中
function injectFetchInterceptor(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: "MAIN", // 必须指定 MAIN，否则无法覆盖页面本身的 window.fetch
        func: () => {

            // 将辅助函数定义在注入的内容脚本内
            function getAlphaCheckStates(originalData) {
                // 1. 定义需要校验的RA检查项名称（自动去重，避免重复统计）
                const RA_CHECK_NAMES = Array.from(new Set([
                    "HIGH_TURNOVER", "LOW_TURNOVER",
                    "LOW_FITNESS", "LOW_RETURNS", "LOW_SHARPE", 

                    'LOW_GLB_AMER_SHARPE', 'LOW_GLB_APAC_SHARPE', 'LOW_GLB_EMEA_SHARPE', 'LOW_ASI_JPN_SHARPE',

                    "IS_LADDER_SHARPE", // ATOM豁免 
                    "LOW_2Y_SHARPE",  "LOW_SUB_UNIVERSE_SHARPE",  "LOW_ROBUST_UNIVERSE_SHARPE", 
                    "LOW_AFTER_COST_ILLIQUID_UNIVERSE_SHARPE", 'LOW_INVESTABILITY_CONSTRAINED_SHARPE',

                    "LOW_ROBUST_UNIVERSE_RETURNS", 
                    "CONCENTRATED_WEIGHT",  
                    
                ]));
                const PPA_CHECK_NAMES = Array.from(new Set([
                    'LOW_TURNOVER',
                    'HIGH_TURNOVER',
                    'LOW_SUB_UNIVERSE_SHARPE', 
                    'LOW_ROBUST_UNIVERSE_SHARPE', 
                    'LOW_ROBUST_UNIVERSE_SHARPE.WITH_RATIO',
                    "LOW_ROBUST_UNIVERSE_RETURNS",
                    'LOW_INVESTABILITY_CONSTRAINED_SHARPE'
                ]));

                // 2. 核心逻辑：遍历数据，统计不合格数量并新增字段
                // 
                // 比如sub-univers ,robust 其实能不能把那些fail的具体值做出来，比如robust 那些的值
                // 能不能加个显示负的alpha的功能，比如当sharp为负的时候，如果测试值的绝对值都能通过平台标准就显示’-0‘
                // risk neut那个就是用传统neut跑的时候 会有个risk neut的线 大概sharpe 和 fit都更高的话 就需要遍历risk neut
                // 按照具体的pyramid筛选
                originalData.results.forEach(item => {
                    // 容错处理：如果is/checks不存在，直接赋值0
                    if (!item?.is?.checks || !Array.isArray(item.is.checks)) {
                        item.is.failedNumRA = 0;
                        item.is.failedNumPPA = 0;
                        return;
                    }
                    item.is.failedNumRA = item.is.checks.filter(check => 
                        RA_CHECK_NAMES.includes(check.name) && check.result !== 'PASS' && check.result !== 'PENDING'
                    ).length;
                    
                    item.is.failedNumPPA = item.is.checks.filter(check => 
                        (PPA_CHECK_NAMES.includes(check.name) && check.result !== 'PASS' && check.result !== 'PENDING') || (check.name === "LOW_SHARPE" && check.value < 1)
                    ).length;
                    
                    item.is.WQPPYS = item.is.checks
                        .find(check => check.name === "MATCHES_PYRAMID")?.pyramids
                        ?.map(pyramid => (pyramid.name?.split('/').pop() || '').toLowerCase())
                        ?.join('/') || '';

                    
                });
                return originalData;
            }

            if (window.__wq_fetch_intercepted) return;
            window.__wq_fetch_intercepted = true;

            const originalFetch = window.fetch;
            window.fetch = async function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

                // 执行原始请求
                const response = await originalFetch.apply(this, args);

                // 拦截并修改目标接口的响应
                if (url && url.includes("https://api.worldquantbrain.com/users/self/alphas?")) {
                    try {
                        const clone = response.clone();
                        let originalData = await clone.json();

                        // 👉 自定义你的修改逻辑
                        const modifiedData = getAlphaCheckStates(originalData);
                        console.log('拦截并修改了 alphas 响应：', modifiedData);
                        
                        // 构造新 Response 返回给前端
                        return new Response(JSON.stringify(modifiedData), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    } catch (e) {
                        console.error("修改响应提取失败：", e);
                    }
                }
                return response;
            };
        }
    }).catch(err => console.error("注入 Fetch 拦截器失败：", err));
}

// alphaPath: ["is", "sharpe"]， 从select performence开始搜索， activeTabsWithoutParent: ["unsubmitted", "submitted"],
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
                responseHeaders: details.responseHeaders || [],
            };
            recentApiRequests.push(rec);
            if (recentApiRequests.length > MAX_RECENT) recentApiRequests.shift();
            broadcastRequest(rec);
        },
        { urls: ["https://api.worldquantbrain.com/*"] },
        ["responseHeaders"]
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
    } else if (msg && msg.type === 'WQ_MANAGER_LOGIN_AND_OPEN') {
        // 处理WQ Manager登录并打开页面
        console.log(msg.id)
        loginAndOpenWqManager(msg.wq_id, sender.tab.id).then(() => {
            sendResponse({ ok: true });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'STORE_DATA_FILES') {
        // 处理从popup发送的数据文件
        saveDataFilesToDB(msg.data, msg.version).then(() => {
            sendResponse({ ok: true, message: 'Data saved successfully' });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'STORE_DATA_CHUNK') {
        // 处理分块数据
        handleDataChunk(msg).then((completed) => {
            sendResponse({ ok: true, completed: completed });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_DATA_FILES') {
        // 获取数据块数量（检查是否有数据）
        getDataChunkCount().then(count => {
            sendResponse({ ok: true, hasData: count > 0 });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_DATA_CHUNK') {
        // 分块获取数据
        const { version, chunkIndex } = msg;
        getDataChunk(version, chunkIndex).then(chunkData => {
            sendResponse({ ok: true, chunkData: chunkData });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_DATA_VERSION') {
        // 获取当前数据版本
        getDataFilesFromDB().then(result => {
            sendResponse({ ok: true, version: result.version });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'DEBUG_GET_DATA') {
        // 测试用：获取 IndexedDB 中的数据
        console.log('[DEBUG] Requesting data from IndexedDB...');
        getDataFilesFromDB().then(result => {
            console.log('[DEBUG] IndexedDB result:', result);
            if (result.data) {
                console.log('[DEBUG] Data keys:', Object.keys(result.data));
                console.log('[DEBUG] Data version:', result.version);
            } else {
                console.log('[DEBUG] No data found in IndexedDB');
            }
            sendResponse({ ok: true, result: Object.keys(result.data) });
        }).catch(error => {
            console.error('[DEBUG] Error:', error);
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_FLAGS') {
        // 获取数据集标记信息
        const { region, delay, universe, datasetNames } = msg;
        // 使用传入的 dataSetList，如果没传则使用全局的
        getDataFilesFromDB(['data/dataSetList.json']).then(result => {
            console.log('[DEBUG] Fetched dataSetList from DB:', datasetNames);
            const listToUse = new Set(result.data['data/dataSetList.json']);
            const delaySuffix = `_Delay${delay}`;
            // 预计算：哪些数据集在相同 region+delay 下存在“其它 universe”记录
            const hasOtherUniverseByDataset = new Set();

            for (const item of listToUse) {
                if (typeof item !== 'string' || !item.endsWith(delaySuffix)) {
                    continue;
                }

                const firstUnderscore = item.indexOf('_');
                if (firstUnderscore <= 0) {
                    continue;
                }

                const secondUnderscore = item.indexOf('_', firstUnderscore + 1);
                if (secondUnderscore <= firstUnderscore + 1) {
                    continue;
                }

                const itemRegion = item.slice(firstUnderscore + 1, secondUnderscore);
                if (itemRegion === region) {
                    continue;
                }

                const datasetKey = item.slice(0, firstUnderscore);
                hasOtherUniverseByDataset.add(datasetKey);
            }

            const flags = {};
            for (const fileName of datasetNames) {
                const neededName = `${fileName}_${region}_${universe}_Delay${delay}`;
                const parts = fileName.split('_');
                const datasetKey = parts[0];
                const hasAnalysis = listToUse.has(neededName);

                flags[fileName] = {
                    hasAnalysis,
                    hasOtherUniverse: !hasAnalysis && hasOtherUniverseByDataset.has(datasetKey)
                };
            }

            sendResponse({ ok: true, flags });
            console.log('[DEBUG] getDataFilesFromDB result:', result);
        }).catch(error => {
            console.error('[DEBUG] Error:', error);
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_OSIS_FLAGS') {
        // 获取 OS/IS 标记信息
        const { region, delay, datasetNames, pageType } = msg;
        getInfoDataCached().then((dataInfo) => {
            if (!dataInfo) {
                sendResponse({ ok: true, flags: {}, meanSharpe: NaN, endDate: null, totalCount: 0 });
                return;
            }

            const key = `${region}_${delay}`;
            const flags = {};
            console.log('[DEBUG] Data keys:', dataInfo);
            // 获取均值和统计信息
            let meanSharpe = NaN;
            try {
                const meanSharpeRaw = dataInfo[key]?.['isos']?.['mean']?.['sharpe_ratio'];
                meanSharpe = (meanSharpeRaw !== undefined && meanSharpeRaw !== null) ? parseFloat(meanSharpeRaw) : NaN;
            } catch (_) {}
            
            const endDate = dataInfo[key]?.['sub_end_time'];
            const totalCount = dataInfo[key]?.['isos']?.['total_count'];
            
            for (const lastPart of datasetNames) {
                let item_data = null;
                try {
                    item_data = dataInfo[key]?.['isos']?.[pageType]?.[lastPart];
                } catch (_) {}
                
                if (item_data) {
                    const srRaw = item_data?.sharpe_ratio;
                    const sr = (srRaw !== undefined && srRaw !== null) ? parseFloat(srRaw) : NaN;
                    const count = item_data?.count;
                    flags[lastPart] = { sr, count, hasData: true };
                } else {
                    flags[lastPart] = { sr: NaN, count: null, hasData: false };
                }
            }
            
            sendResponse({ ok: true, flags, meanSharpe, endDate, totalCount });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    } else if (msg && msg.type === 'GET_NEUT_FLAGS') {
        // 获取 Neutralization 标记信息
        const { region, delay, datasetNames, pageType } = msg;
        getInfoDataCached().then((dataInfo) => {
            if (!dataInfo) {
                sendResponse({ ok: true, flags: {} });
                return;
            }

            const key = `${region}_${delay}`;
            const flags = {};
            
            for (const lastPart of datasetNames) {
                let item_data = null;
                try {
                    item_data = dataInfo[key]?.['neutralization']?.[pageType]?.[lastPart];
                } catch (_) {}
                
                if (item_data) {
                    // 处理 neutralization 数据
                    const entries = Object.entries(item_data).map(([key, value]) => ({
                        key,
                        count: value.count
                    }));
                    const totalCount = entries.reduce((sum, item) => sum + item.count, 0);
                    const maxItem = entries.reduce((max, current) =>
                        current.count > max.count ? current : max, entries[0]);
                    const maxPercentage = ((maxItem.count / totalCount) * 100).toFixed(2);
                    
                    const entriesDict = {};
                    entries.forEach(item => {
                        const percentage = ((item.count / totalCount) * 100).toFixed(2);
                        entriesDict[item.key] = {
                            count: item.count,
                            percentage: percentage
                        };
                    });
                    
                    flags[lastPart] = {
                        hasData: true,
                        data: item_data,
                        maxItem,
                        maxPercentage,
                        entries: entriesDict,
                        totalCount
                    };
                } else {
                    flags[lastPart] = { hasData: false };
                }
            }
            
            sendResponse({ ok: true, flags });
        }).catch(error => {
            sendResponse({ ok: false, error: error.message });
        });
        return true;
    }
});

async function loginAndOpenWqManager(wqId, currentTabId) {
    // 在当前标签页打开登录页面
    currentTabId = await new Promise((resolve, reject) => {
        chrome.tabs.create({ url: 'https://wqmanager.qzz.io/login', active: true }, (tab) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(tab.id);
        });
    });


    
    

    // 等待页面加载完成后，填充wq_id并自动提交
    return new Promise((resolve, reject) => {
        const listener = (tabId, changeInfo) => {
            if (tabId === currentTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);

                // 在页面中自动填充wq_id并提交登录表单
                chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: async (wq_id) => {
                        // 查找wq_id输入框
                        const wqIdInput = document.querySelector('input[type="text"]') ||
                                         document.querySelector('input[name="wq_id"]') ||
                                         document.querySelector('input[placeholder*="WQ"]');

                        if (wqIdInput) {
                            // 填充wq_id
                            wqIdInput.value = wq_id;
                            wqIdInput.dispatchEvent(new Event('input', { bubbles: true }));
                            wqIdInput.dispatchEvent(new Event('change', { bubbles: true }));

                            // 等待一下，然后查找并点击登录按钮
                            setTimeout(() => {
                                const loginButton = document.querySelector('button[type="submit"]') ||
                                                   document.querySelector('button');
                                if (loginButton) {
                                    loginButton.click();
                                }
                            }, 100);
                        }
                    },
                    args: [wqId]
                }).then(() => {
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            }
        };

        // 导航到 Profile 页面以触发 onUpdated 事件
        chrome.tabs.update(currentTabId, {
            url: 'https://wqmanager.qzz.io/Profile'
        });

        chrome.tabs.onUpdated.addListener(listener);

        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('页面加载超时'));
        }, 10000);
    });
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
    if (dataSetList === null) {
        dataSetList = await getDataSetList();
    }

    try {
        // 必须注入 pako 和 msgpack 供 content script 使用
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [
                "src/scripts/lib/pako.min.js",
                "src/scripts/lib/msgpack.min.js",
                "src/scripts/utils.js", 
                "src/scripts/dataFlag.js"
            ],
        }, () => {
            chrome.scripting.executeScript({
                target: { tabId },
                // 仅传递必要的元数据，不传递巨大的 dataInfo 对象
                args: [dataSetList, tab.url],
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

function injectionSimulateScript(tabId) {
    try {
        chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: [
                "src/css/simulate.css",
            ],
        });
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: [
                "src/scripts/simulate.js",
            ],
        });
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
