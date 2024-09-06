
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
let flagmap={};
function dataFlagFunc(dataSetList, url) {
    // console.log('dataSetList',dataSetList)
    // console.log(url)
    // console.log(document.querySelector(".data-table__container"))
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(() => {
        console.log(`${url}完成加载`)
        let delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
        let region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
        let universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML

        var elements = document.querySelectorAll(".rt-tr-group");

        // 循环遍历这些元素
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                let parts = a_element.href.split("/");

                let lastPart = parts[parts.length - 1];
                let name = `${lastPart}_${region}_${universe}_Delay${delay}`;
                console.log("dataFlag name",name);
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?★★★<\/span>/g, '');
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?☆☆☆<\/span>/g, '');
                if (dataSetList.includes(name)) {
                    a_element.innerHTML = `<span style="color: red;">★★★</span>${a_element.innerHTML}`
                }
                else
                {
                    
                    console.log('dataList not contain',name);
                    if(flagmap[name])
                    {
                        console.log("flagmap[name]=",flagmap[name]);
                        if(flagmap[name]==1)
                        {
                            a_element.innerHTML = `<span style="color: red;">☆☆☆</span>${a_element.innerHTML}`
                        }
                        // if(flagmap[name]==-1)
                        //     a_element.innerHTML = a_element.innerHTML.replace(/<span.*?☆☆☆<\/span>/g, '');
                    }
                    else{
                        // const parts = name.split('_');
                        const dataset=lastPart;
                        console.log("[dataset, region, universe, delay]=",[dataset, region, universe, delay]);
                        const list = dataSetList;
                
                        // 匹配[dataset]_[region]_*_[delay]
                        const partialMatchRegion = list.find(item => 
                            item.startsWith(`${dataset}_${region}_`) && item.endsWith(`_Delay${delay}`));
                        if(partialMatchRegion)
                        {
                            flagmap[name]=1;
                            // mymap[name]=partialMatchRegion;
                            a_element.innerHTML = `<span style="color: red;">☆☆☆</span>${a_element.innerHTML}`
                        }
                        else
                        {
                            flagmap[name]=-1;
    
                        }
                    }
            
                }
                        } catch (error) {
                            // 处理错误
                            console.error('捕获到错误:', error);
                        }
                        // 在这里执行你想要的操作，比如打印元素内容


        });

        // waitForNonElement(".data-table__stale-loader-container").then(() => {
        // })
    })
}
