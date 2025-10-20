function updateButton(buttonId, buttonText) {
    // Update the button text and disable it
    let startButton = document.getElementById(buttonId);
    startButton.innerText = buttonText;
    startButton.style.cursor = "default";
    startButton.setAttribute("disabled", true);
}

function resetButton(buttonId, buttonText) {
    // Reset the button text and enable it
    let startButton = document.getElementById(buttonId);
    startButton.innerText = buttonText;
    startButton.style.cursor = "pointer";
    startButton.removeAttribute("disabled");
}

function setButtonState(buttonId, buttonText, mode = 'disable') {
    const button = document.getElementById(buttonId);

    if (!button) {
        console.warn(`Button with ID '${buttonId}' not found.`);
        return;
    }

    if (mode === 'load') {
        button.innerText = '⏳ ' + (buttonText || 'Loading...');
        button.style.cursor = 'wait';
        button.setAttribute('disabled', true);
        button.style.opacity = '0.6';
    } else if (mode === 'disable') {
        button.innerText = buttonText;
        button.style.cursor = 'default';
        button.setAttribute('disabled', true);
        button.style.opacity = '1';
    } else if (mode === 'enable') {
        button.innerText = buttonText;
        button.removeAttribute('disabled');
        button.style.cursor = 'pointer';
        button.style.opacity = '1';
    } else {
        console.warn(`Invalid mode: ${mode}`);
    }
}

function format(formatString, replacements) {
  let result = formatString;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

async function getDataFromUrl(url) {
    const response = await fetch(url, {
        referrer: "https://platform.worldquantbrain.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
        body: null,
        method: "GET",
        mode: "cors",
        credentials: "include"
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json(); // Parse JSON data
    return data
}

async function getDataFromUrlWithOffsetParallel(formatUrl, limit, buttonName){
    const CONCURRENCY = 10; // 同时进行的请求数

    const initialUrl = format(formatUrl, { limit: limit, offset: 0 });
    const initialData = await getDataFromUrl(initialUrl);
    const totalCount = initialData.count;
    let data = initialData.results;
    let fetchedCount = data.length;
    setButtonState(buttonName, `正在抓取 ${fetchedCount} / ${totalCount}`, 'load');

    // 计算剩余请求
    const remainingPages = Math.ceil(totalCount / limit) - 1;
    const offsets = Array.from({ length: remainingPages }, (_, i) => (i + 1) * limit);

    const urls = offsets.map(offset => format(formatUrl, { limit: limit, offset: offset }));

    // 分批请求函数
    const fetchBatch = async (batchUrls) => {
        const batchRequests = batchUrls.map(url =>
            getDataFromUrl(url).then(page => {
                fetchedCount += page.results.length;
                if (buttonName) {
                    setButtonState(buttonName, `正在抓取 ${fetchedCount} / ${totalCount}`, 'load');
                }
                // Removed debugging log
                return page;
            })
        );
        return await Promise.all(batchRequests);
    };

    // 执行分批请求
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batchUrls = urls.slice(i, i + CONCURRENCY);
        const batchData = await fetchBatch(batchUrls);
        batchData.forEach(page => data = data.concat(page.results));
    }

    console.log(`Fetched ${data.length} results, expected ${totalCount}`);
    return data;
}


function waitForElement(selector, nonselector) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            const nonElement = document.querySelector(nonselector);
            if (element && !nonElement) {
                clearInterval(interval);
                resolve(element);
            }
        }, 100); // 每100毫秒检查一次

        // 设置一个超时时间防止无限等待
        const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new Error('元素查找超时或非期望元素存在'));
        }, 30000); // 5秒后超时
    });
}




async function getAuth() {
    let n = 0; // Initialize n for retry count
    return new Promise((r, j) => {
        chrome.storage.local.get('WQPSummary', async ({ WQPSummary: a }) => {
            let d = a;
            try {
                if (!a) {
                    d = await getDataFromUrl("https://api.worldquantbrain.com/users/self/consultant/summary");
                    chrome.storage.local.set({ WQPSummary: d }, () => { });
                }
            } catch (e) {
                if (n < 3) {
                    n++; // Increment n on retry
                    return getAuth().then(r).catch(j); // Recursive call without n as param
                }
                return j(e);
            }
            r(["CN", "HK"].includes(d?.leaderboard?.country));
        });
    });
}

// 定义一个变量来存储已提交的 Alpha 列表和上次更新时间
let submittedAlphasCache = {
    data: [],
    lastUpdated: 0
};

// 增量更新和本地缓存已提交 Alpha 的函数
// 增量更新和本地缓存已提交 Alpha 的函数
async function fetchSubmittedAlphas(buttonId) {
    const CACHE_DURATION = 1 * 60 * 60 * 1000; // 缓存有效期1小时

    // 从本地存储获取缓存
    const storedCache = await new Promise(resolve => {
        chrome.storage.local.get('submittedAlphasCache', (result) => {
            resolve(result.submittedAlphasCache);
        });
    });

    if (storedCache && (Date.now() - storedCache.lastUpdated < CACHE_DURATION)) {
        submittedAlphasCache = storedCache;
        console.log('从缓存加载已提交的Alpha列表:', submittedAlphasCache.data.length);
        return submittedAlphasCache.data;
    }

    console.log('缓存失效或不存在，开始获取新的已提交Alpha列表...');
    setButtonState(buttonId, `正在加载已提交的Alpha...`, 'load');

    // 获取当前赛季的起始日期，与 genius.js 中的 fetchAllAlphas 逻辑类似
    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const quarter = Math.floor((currentDate.getMonth() + 3) / 3);
    const quarters = [
        { start: `${year}-01-01T05:00:00.000Z`, end: `${year}-04-01T04:00:00.000Z` },  // 第一季度
        { start: `${year}-04-01T04:00:00.000Z`, end: `${year}-07-01T04:00:00.000Z` },  // 第二季度
        { start: `${year}-07-01T04:00:00.000Z`, end: `${year}-10-01T04:00:00.000Z` },  // 第三季度
        { start: `${year}-10-01T04:00:00.000Z`, end: `${year + 1}-01-01T05:00:00.000Z` }   // 第四季度 (注意年份加1)
    ];
    const { start, end } = quarters[quarter - 1];
    const dateRange = `dateSubmitted%3E${start}&dateSubmitted%3C${end}`;


    const limit = 50; // Data limit per page
    // 使用与 genius.js 中 fetchAllAlphas 类似的 URL 格式，但调整为获取已提交的 alpha
    const formatUrl = `https://api.worldquantbrain.com/users/self/alphas?limit={limit}&offset={offset}&status!=UNSUBMITTED%1FIS-FAIL&${dateRange}&order=-dateCreated&hidden=false`;
    
    let allAlphas = [];
    try {
        allAlphas = await getDataFromUrlWithOffsetParallel(formatUrl, limit, buttonId);
    } catch (error) {
        console.error('获取已提交Alpha失败:', error);
        setButtonState(buttonId, `加载失败`, 'enable');
        throw error; // 抛出错误以便调用方处理
    }

    // 更新缓存
    submittedAlphasCache = {
        data: allAlphas,
        lastUpdated: Date.now()
    };
    chrome.storage.local.set({ submittedAlphasCache: submittedAlphasCache });
    console.log('已提交的Alpha列表更新完成，总数:', allAlphas.length);
    setButtonState(buttonId, `加载完成 (${allAlphas.length}个)`, 'enable');
    return allAlphas;
}


function removeComments(code) {
    const lines = code.split('\n');
    const cleanedLines = lines.map(line => line.split('#')[0].trim());
    return cleanedLines.join('\n');
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&');
}

function findSingleOps(text) {
    // 删除掉以+-号开头的数字
    text = text.replace(/([+-])\d+/g, 'none');
    const singleOps = ['+', '-', '*', '/', '^', '<=', '>=', '<', '>', '==', '!=', '?', '&&', '||'];
    let count = [];
    singleOps.sort((a, b) => b.length - a.length);  // Sort by operator length in descending order
    singleOps.forEach(op => {
        let regex = new RegExp(`${escapeRegExp(op)}`, 'g');
        let matches = [...text.matchAll(regex)];
        count = count.concat(Array(matches.length).fill(op));  // Add matched operator to the count
        text = text.replace(regex, ' ');  // Replace matched operators with spaces
    });
    return count;
}

const splitFunc = (item) => {
    return item.replace(' ', '').split(/[(),:+\-*/^<>=!?;\n#&|]+/).filter(part => part).map(item => item.replace(' ', ''));
};

function findOps(regular, operators) {
    regular = removeComments(regular);
    // console.log(splitFunc(regular));
    const ops = [
        ...splitFunc(regular).filter(item => operators.map(item => item.name).includes(item)),
        ...findSingleOps(regular)
    ];
    return ops;
}



function rankDense(arr, ascending = true) {
    // 1. 拷贝并排序唯一值
    const sortedUnique = Array.from(new Set(arr)).sort((a, b) => ascending ? a - b : b - a);

    // 2. 创建值到 rank 的映射
    const rankMap = new Map();
    sortedUnique.forEach((val, index) => {
        rankMap.set(val, index + 1); // dense rank 从 1 开始
    });

    // 3. 映射原数组为 rank 数组
    return arr.map(val => rankMap.get(val));
}

function formatSavedTimestamp(dateString) {
    const date = new Date(dateString);

    // 美东时间 (Eastern Time, America/New_York)
    const easternTime = date.toLocaleString("zh-CN", {
        timeZone: "America/New_York",
        hour12: false
    });

    // 北京时间 (Asia/Shanghai)
    const beijingTime = date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false
    });

    return [easternTime, beijingTime];
}

let submittedFieldsCache = { data: [], lastUpdated: 0 }; // Used by getSubmittedFields
let submittedFieldsPromise = null; // Used by getSubmittedFields

async function getSubmittedFields(forceRefresh = false) {
    if (submittedFieldsPromise && !forceRefresh) {
        return submittedFieldsPromise;
    }

    submittedFieldsPromise = new Promise(async (resolve, reject) => {
        try {
            // fetchSubmittedAlphas is already in utils.js
            const alphas = await fetchSubmittedAlphas('submitAlphaListLoading'); 
            submittedFieldsCache.data = alphas;
            submittedFieldsCache.lastUpdated = Date.now();
            resolve(alphas);
        } catch (error) {
            console.error('获取已提交 Alpha 列表失败:', error);
            submittedFieldsCache.data = []; // Clear cache on error
            submittedFieldsCache.lastUpdated = 0;
            reject(error);
        }
    });
    return submittedFieldsPromise;
}
