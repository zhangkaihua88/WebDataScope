const BILIBILI_SPACE_URL = "https://space.bilibili.com/"


function isCorrectUrlFormat(url) {
    // 定义匹配的正则表达式
    var regex = /^https:\/\/platform\.worldquantbrain\.com\/data\/data-sets\/[^\/]+\/data-fields\/[^\/]+$/;
    // 使用正则表达式进行匹配
    return regex.test(url);
}
function hasAncestorWithClass(node, className) {
    // 从当前节点开始向上遍历父节点
    while (node !== null && node.parentNode) {
        node = node.parentNode;
        // 检查父节点是否具有指定的类名
        if (node.classList.contains(className)) {
            return node;
        }
    }
    return false;
}





document.addEventListener("mouseover", showProfile);
document.addEventListener("mousemove", (ev) => userProfileCard.updateCursor(ev.pageX, ev.pageY));


function getUserId(target) {
    // let pattern = /\/data-sets\/([^\/]+)\/data-fields\/([^\/]+)/;
    const regex = /\/data-sets\/([^?#]+)(\?.*)?/;
    
    var currentUrl = window.location.href;
    let match = currentUrl.match(regex);
    // console.log("currentUrl",currentUrl);
    // console.log("targetUrl",target);
    let data = {};
    data['dataSet'] =match[1];
    // let matches = target.match(pattern);
    // let currentUrl = window.location.href;
    // let currentParams = new URLSearchParams(new URL(currentUrl).search);
    
    // data['dataSet'] = matches[1];
    // data['dataField'] = matches[2];
    let urlObj = new URL(target);
    let path = urlObj.pathname;
    data['dataField']=path.split('/').pop();

    data['delay'] = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
    data['region'] = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
    data['universe'] = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML
    console.log("data",data);
    return data;
}


function getUserTarget(node) {

    // let className = "rt-tr-group";
    let className = "rt-tr"

    while (node !== null && node.parentNode) {
        node = node.parentNode;
        // 检查父节点是否具有指定的类名
        if (node.classList.contains(className)) {
            elements = node.querySelectorAll('.link--wrap')

            return [node, elements[0].href];
        }
    }
}


// 假设这是你的缓存对象
let cache = {};
let mymap={};
function parseFileName(fileName) {
    // 匹配两种格式的正则表达式
    const parts = fileName.split('_');

    // 如果匹配到了四个部分，则认为是第一种格式
    // console.log("parseFileName parts",parts);
    if (parts.length === 4) {
        return parts;
    }
    // 否则，假设是第二种格式，region为固定的"ILLIQUID_MINVOL1M"
    else {
        return [ parts[0], parts[1], "ILLIQUID_MINVOL1M",parts[4] ];
    }
}
// 用来请求项的详细信息的函数
async function fetchDataDetails(fileName) {
    if(mymap[fileName])
    {
        console.log(fileName,"not exist, but",mymap[fileName],"exist");
        fileName=mymap[fileName];
    }
    // 检查缓存
    if (cache[fileName]) {
        return cache[fileName]; // 直接返回缓存的数据
    }
    
    if (!cache['dataSetList']) {
        // 加载 dataSetList
        const url0 = chrome.runtime.getURL(`data/dataSetList.json`);
        try {
            const response = await fetch(url0);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json(); // 解析JSON响应
            cache['dataSetList'] = data;
        } catch (error) {
            console.error('Error loading or parsing JSON file:', error);
            // 返回 undefined 或者抛出错误取决于你的需求
            return; // 或者 throw error
        }
    }

    let url = chrome.runtime.getURL(`data/${fileName}.bin`);
    // console.log("file url", url);

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const inflatedData = pako.inflate(arrayBuffer);
        const decodedData = msgpack.decode(new Uint8Array(inflatedData));
        cache[fileName] = decodedData;
        return decodedData;
    } catch (error) {
        console.log("can't find", fileName);
        // const parts = fileName.split('_');
        const [dataset, region, universe, delay] = parseFileName(fileName);
        const list = cache['dataSetList'];
        console.log("dataset, region, universe, delay",dataset, region, universe, delay);
        // 匹配[dataset]_[region]_*_[delay]
        const partialMatchRegion = list.find(item => 
            item.startsWith(`${dataset}_${region}_`) && item.endsWith(`_${delay}`));

        if (partialMatchRegion) {
            mymap[fileName]=partialMatchRegion;
            console.log("mymap[fileName]",mymap[fileName]);
            fileName = partialMatchRegion;
            if (cache[fileName]) {
                console.log("partialMatchRegion data", cache[fileName]);
                return cache[fileName];
            }

            const matchUrl = chrome.runtime.getURL(`data/${fileName}.bin`);
            try {
                const response = await fetch(matchUrl);
                const arrayBuffer = await response.arrayBuffer();
                const inflatedData = pako.inflate(arrayBuffer);
                const decodedData = msgpack.decode(new Uint8Array(inflatedData));
                cache[fileName] = decodedData;
                return decodedData;
            } catch (innerError) {
                console.error('Failed to fetch secondary data:', innerError);
            }
        }

        // 匹配[dataset]_*_*_[delay]
        const partialMatchAny = list.find(item => 
            item.startsWith(`${dataset}_`) && item.endsWith(`_${delay}`));

        if (partialMatchAny) {
            // return partialMatchAny; // 如果只需要返回文件名而不是数据对象
            return ;
        }

        // 如果没有匹配项，则返回 undefined 或者根据需要抛出错误
        return; // 或者 throw new Error('No matching data found');
    }
}


function updateUserInfo(dataId, callback) {
    let pattern = /^(.*_.*_.*_Delay\d)_(.*)/;
    if(dataId.includes("ILLIQUID_MINVOL1M"))
        pattern = /^(.*_.*_ILLIQUID_MINVOL1M_Delay\d)_(.*)/;
    console.log("dataId",dataId);
    const match = dataId.match(pattern);
    // console.log('match',match)
    if (match) {
        fileName = match[1];
        dataField = match[2];
    } else {
        console.log(dataId,'No match found');
    }
    console.log("dataField",dataField);

    fetchDataDetails(fileName).then(data => {
        console.log("updateUserInfo data",data);
        let itemData = data[dataField];
        console.log("itemData",itemData);
        try {
            tmp = itemData['yearly_distribution'];
            tmp = tmp.replace(/\(/g, '{').replace(/\)/g, '}');
            tmp = tmp.replace(/({\d+(\.\d+)?, \d+(\.\d+)?})/g, '"$1"');
            itemData['yearly_distribution'] = JSON.parse(tmp)
        } catch (error) {
        } finally {
            callback(itemData);
        }

    })
}








function showProfile(event) {
    let result = getUserTarget(event.target);
    let target = result[0];
    let url = result[1]



    if (url) {
        let data = getUserId(url);
        console.log("showProfile data",data);
        let dataId = data.dataSet + "_" + data.region + "_" + data.universe + "_Delay" + data.delay + "_" + data.dataField;




        if (userProfileCard.enable(dataId)) {
            userProfileCard.updateDataId(dataId, data);

            userProfileCard.updateCursor(event.clientX, event.clientY);
            userProfileCard.updateTarget(target);

            // userProfileCard.updateData(data);
            updateUserInfo(dataId, (itemData) => userProfileCard.updateData(itemData));
        }

    }

}