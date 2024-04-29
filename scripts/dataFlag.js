// function waitForElement(selector, nonselector, timeout = 30000) {
//     return new Promise((resolve, reject) => {
//         const observer = new MutationObserver((mutations, me) => {
//             if (document.querySelector(selector) && !document.querySelector(nonselector)) {
//                 resolve(document.querySelector(selector));
//                 me.disconnect(); // stop observing
//                 return;
//             }
//         });

//         observer.observe(document.body, {
//             childList: true,
//             subtree: true
//         });

//         setTimeout(() => {
//             reject(new Error("Timeout waiting for element"));
//             observer.disconnect();
//         }, timeout);
//     });
// }
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

function dataFlagFunc(dataSetList, url){
    console.log(dataSetList)
    console.log(url)
    // console.log(document.querySelector(".data-table__container"))
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(() => {
        console.log(`${url}完成加载`)
        // console.log("beg");
        let delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
        let region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
        let universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML

        var elements = document.querySelectorAll(".rt-tr-group");

        // 循环遍历这些元素
        elements.forEach(function (element) {
            // 在这里执行你想要的操作，比如打印元素内容
            let a_element = element.querySelector(".link.link--wrap")
            let parts = a_element.href.split("/");

            let lastPart = parts[parts.length - 1];
            let name = `${lastPart}_${region}_${universe}_Delay${delay}`;
            // console.log(dataSetList);
            // console.log(name);
            if (dataSetList.includes(name)){
                a_element.innerHTML = `<span style="color: red;">★★★</span>${a_element.innerHTML}`
            }
            
        });

        // waitForNonElement(".data-table__stale-loader-container").then(() => {
        // })
    })
}
