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


// // 查找所有带有指定类名的元素
// var elements = document.querySelectorAll('.link--wrap');

// // 遍历找到的元素
// for (var i = 0; i < elements.length; i++) {
//     // 如果元素的文本内容与目标文本匹配，则输出其 href 属性值
//     if (elements[i].textContent.trim() === 'anl11_2_1g') {
//         var href = elements[i].getAttribute('href');
//         console.log('找到目标链接:', href);
//         // 如果只需要找到第一个匹配项，可以添加 break;
//         // break;
//     }
// }


document.addEventListener("mouseover", showProfile);
document.addEventListener("mousemove", (ev) => userProfileCard.updateCursor(ev.pageX, ev.pageY));


function getUserId(target) {
    let pattern = /\/data-sets\/([^\/]+)\/data-fields\/([^\/]+)/;
    let matches = target.match(pattern);
    // let currentUrl = window.location.href;
    // let currentParams = new URLSearchParams(new URL(currentUrl).search);
    let data = {};
    data['dataSet'] = matches[1];
    data['dataField'] = matches[2];
    // data['delay'] = currentParams.get('delay');
    // data['region'] = currentParams.get('region');
    // data['universe'] = currentParams.get('universe');
    data['delay'] = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
    data['region'] = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
    data['universe'] = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML
    return data;
}


function getUserTarget(node) {
    // console.log(node);
    // let className = "rt-tr-group";
    let className = "rt-tr"

    while (node !== null && node.parentNode) {
        node = node.parentNode;
        // 检查父节点是否具有指定的类名
        if (node.classList.contains(className)) {
            elements = node.querySelectorAll('.link--wrap')
            // console.log(node)
            return [node, elements[0].href];
        }
    }
}


// function updateUserInfo(dataId, callback){
//     const pattern = /^(.*_TOP\d*_Delay\d)_(.*)/;
//     const match = dataId.match(pattern);
//     if (match) {
//       fileName = match[1]; // 期望输出：news12_USA_TOP3000_Delay1
//       dataField = match[2]


//     } else {
//       console.log('No match found');
//     }

//     let myExtensionId = chrome.runtime.id;
//     fetch(`chrome-extension://${myExtensionId}/data/${fileName}.json`)
//     .then(response => response.json())
//     .then(data => {
//         itemData = data[dataField];
//         tmp = itemData['yearly_distribution']
//         tmp = tmp.replace(/\(/g, '{').replace(/\)/g, '}');
//         tmp = tmp.replace(/({\d+(\.\d+)?, \d+(\.\d+)?})/g, '"$1"');
//         itemData['yearly_distribution'] = JSON.parse(tmp)

//         callback(itemData);
//     })
//     .catch(error => console.error('Error:', error));
// }


// 假设这是你的缓存对象
let cache = {};

// 用来请求项的详细信息的函数
async function fetchDataDetails(fileName) {
    // 检查缓存
    if (cache[fileName]) {
        return cache[fileName]; // 直接返回缓存的数据
    }

    let url = chrome.runtime.getURL(`data/${fileName}.bin`);
    console.log(url)

    fetch(url)
        .then(response => response.arrayBuffer())
        .then(data => {
            data = pako.inflate(data);
            data = msgpack.decode(new Uint8Array(data));
            cache[fileName] = data;
            return data;
        })
    
        chrome.runtime.getPackageDirectoryEntry(function(root) {
            // 获取 "data" 文件夹的 DirectoryEntry 对象
            root.getDirectory('data', {}, function(dataDir) {
                // 获取文件夹中的所有文件
                var dirReader = dataDir.createReader();
                dirReader.readEntries(function(entries) {
                    // 遍历文件夹中的每个文件
                    entries.forEach(function(entry) {
                        // 确保 entry 是一个文件
                        if (entry.isFile) {
                            // 获取文件名
                            var fileName = entry.name;
                            console.log(fileName);
                        }
                    });
                });
            });
        });
        
}


function updateUserInfo(dataId, callback) {
    const pattern = /^(.*_TOP\d*_Delay\d)_(.*)/;
    const match = dataId.match(pattern);
    if (match) {
        fileName = match[1];
        dataField = match[2];
    } else {
        console.log(dataId)
        console.log('No match found');
    }


    fetchDataDetails(fileName).then(data => {
        let itemData = data[dataField];
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




// function updateUserInfo(dataId, callback){
//     const pattern = /^(.*_TOP\d*_Delay\d)_(.*)/;
//     const match = dataId.match(pattern);
//     if (match) {
//       fileName = match[1]; // 期望输出：news12_USA_TOP3000_Delay1
//       dataField = match[2]
//     } else {
//       console.log('No match found');
//     }

//     let url = chrome.runtime.getURL(`data/${fileName}.bin`);
//     console.log(url)

//     fetch(url)
//     .then(response => response.arrayBuffer())
//     .then(data => {
//         data = pako.inflate(data);
//         data = msgpack.decode(new Uint8Array(data));
//         console.log(data)

//         itemData = data[dataField];
//         tmp = itemData['yearly_distribution']
//         tmp = tmp.replace(/\(/g, '{').replace(/\)/g, '}');
//         tmp = tmp.replace(/({\d+(\.\d+)?, \d+(\.\d+)?})/g, '"$1"');
//         itemData['yearly_distribution'] = JSON.parse(tmp)

//         callback(itemData);
//     })
//     .catch(error => console.error('Error:', error));
// }



function showProfile(event) {
    let result = getUserTarget(event.target);
    let target = result[0];
    let url = result[1]



    if (url) {
        let data = getUserId(url);
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