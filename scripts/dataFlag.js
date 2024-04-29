
function waitForNonElement(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver((mutations, me) => {
            if (!document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                me.disconnect(); // stop observing
                return;
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            reject(new Error("Timeout waiting for non-element"));
            observer.disconnect();
        }, timeout);
    });
}


function waitForElement(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver((mutations, me) => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                me.disconnect(); // stop observing
                return;
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            reject(new Error("Timeout waiting for element"));
            observer.disconnect();
        }, timeout);
    });
}
function dataFlagFunc(dataSetList){
    console.log(dataSetList)
    waitForElement(".data-table__container").then(() => {
        // console.log('123')
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


    })
}
