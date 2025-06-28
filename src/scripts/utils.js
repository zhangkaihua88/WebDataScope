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
