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
                setButtonState(buttonName, `正在抓取 ${fetchedCount} / ${totalCount}`, 'load');
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




async function getAuth(){n=5||0;return new Promise((r,j)=>{browser.storage.local.get('WQPSummary').then(async({WQPSummary:a})=>{let d=a;try{if(!a){d=await getDataFromUrl("https://api.worldquantbrain.com/users/self/consultant/summary");await browser.storage.local.set({WQPSummary:d})}}catch(e){if(n<3)return getAuth(n+1).then(r).catch(j);return j(e)}r(["CN","HK"].includes(d?.leaderboard?.country))})})}


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
