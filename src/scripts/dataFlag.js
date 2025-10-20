// dataFlag.js: 对已经分析过的数据集进行标记
console.log('dataFlag.js loaded');

const flagMapOtherUniverse = {};

function dataFlagFunc(dataSetList, url) {
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(() => {
        console.log(`${url}完成加载`)
        const delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const elements = document.querySelectorAll(".rt-tr-group");

        // 循环遍历这些元素
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                if (!a_element) { // Add null check
                    return; // Skip this element if the link is not found
                }
                if (a_element.href.includes("data-fields")){
                    return;
                }
                let parts = a_element.href.split("/");

                let lastPart = parts[parts.length - 1];
                let fileName = `${lastPart}_${region}_${universe}_Delay${delay}`;
                console.log("dataFlag name", fileName);
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?★★★<\/span>/g, '');
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?☆☆☆<\/span>/g, '');


                if (!dataSetList.includes(fileName)) {
                    const startPrefix = `${lastPart}_${region}_`;
                    const endPrefix = `_Delay${delay}`;
                    const partialMatchRegion = dataSetList.find(item => item.startsWith(startPrefix) && item.endsWith(endPrefix));
                    if (partialMatchRegion) {
                        flagMapOtherUniverse[fileName] = true;
                    } else {
                        flagMapOtherUniverse[fileName] = false;
                    }
                }
                console.log("dataFlag name", fileName, flagMapOtherUniverse);
                if (dataSetList.includes(fileName)) {
                    a_element.innerHTML = `<span style="color: red;">★★★</span>${a_element.innerHTML}`
                } else if (flagMapOtherUniverse[fileName]) {
                    a_element.innerHTML = `<span style="color: red;">☆☆☆</span>${a_element.innerHTML}`
                }
            } catch (error) {
                console.error('捕获到错误:', error);
            }
        });
    })
}
