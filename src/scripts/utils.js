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
