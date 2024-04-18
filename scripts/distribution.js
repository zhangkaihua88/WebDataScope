var dataSets = {
    "fundamental": "Fundamental data",
    "analyst": "Analyst data",

    "news": "News data",
    "socialmedia": "Social media data",
    "sentiment": "Sentiment data",

    "pv": "Price volume data",
    "option": "Option data",
    "earnings": "Earnings",

    "insiders": "Insiders",
    "institutions": "Instiutional Ownership Data",

    "shortinterest": "Short interest data",
    "macro": "Macro data",
    "other": "Other",

    "risk": "Risk data",
    "model": "Model data",
};
var regions = ['USA', 'ASI', 'CHN', 'EUR', 'GLB', 'HKG', 'KOR', 'TWN', 'AMR'];
var url = "https://api.worldquantbrain.com/users/self/activities/diversity?grouping=region,delay,dataCategory"

var non_data = [
    {'x': 'TWN', 'y': 'Insiders'},
    {'x': 'CHN', 'y': 'Insiders'},
    {'x': 'GLB', 'y': 'Insiders'},
    {'x': 'TWN', 'y': 'Instiutional Ownership Data'},
    {'x': 'CHN', 'y': 'Instiutional Ownership Data'},
    {'x': 'HKG', 'y': 'Instiutional Ownership Data'},
    {'x': 'ASI', 'y': 'Instiutional Ownership Data'},
    {'x': 'GLB', 'y': 'Instiutional Ownership Data'},
    {'x': 'KOR', 'y': 'Instiutional Ownership Data'},
    {'x': 'CHN', 'y': 'Macro data'},
    {'x': 'TWN', 'y': 'Option data'},
    {'x': 'CHN', 'y': 'Option data'},
    {'x': 'HKG', 'y': 'Option data'},
    {'x': 'ASI', 'y': 'Option data'},
    {'x': 'KOR', 'y': 'Option data'},
    {'x': 'CHN', 'y': 'Risk data'},
    {'x': 'AMR', 'y': 'Sentiment data'},
    {'x': 'TWN', 'y': 'Sentiment data'},
    {'x': 'CHN', 'y': 'Sentiment data'},
    {'x': 'HKG', 'y': 'Sentiment data'},
    {'x': 'ASI', 'y': 'Sentiment data'},
    {'x': 'GLB', 'y': 'Sentiment data'},
    {'x': 'KOR', 'y': 'Sentiment data'},
    {'x': 'TWN', 'y': 'Social media data'},
    {'x': 'KOR', 'y': 'Social media data'}
]

var non_data_delay0 = [
    { 'x': 'GLB', 'y': 'Fundamental data' },
    { 'x': 'ASI', 'y': 'Fundamental data' },
    { 'x': 'KOR', 'y': 'Fundamental data' },
    { 'x': 'TWN', 'y': 'Fundamental data' },
    { 'x': 'HKG', 'y': 'Fundamental data' },
    { 'x': 'GLB', 'y': 'Analyst data' },
    { 'x': 'ASI', 'y': 'Analyst data' },
    { 'x': 'KOR', 'y': 'Analyst data' },
    { 'x': 'TWN', 'y': 'Analyst data' },
    { 'x': 'HKG', 'y': 'Analyst data' },
    { 'x': 'GLB', 'y': 'News data' },
    { 'x': 'ASI', 'y': 'News data' },
    { 'x': 'KOR', 'y': 'News data' },
    { 'x': 'TWN', 'y': 'News data' },
    { 'x': 'HKG', 'y': 'News data' },
    { 'x': 'GLB', 'y': 'Social media data' },
    { 'x': 'ASI', 'y': 'Social media data' },
    { 'x': 'HKG', 'y': 'Social media data' },
    { 'x': 'GLB', 'y': 'Price volume data' },
    { 'x': 'ASI', 'y': 'Price volume data' },
    { 'x': 'KOR', 'y': 'Price volume data' },
    { 'x': 'TWN', 'y': 'Price volume data' },
    { 'x': 'HKG', 'y': 'Price volume data' },
    { 'x': 'GLB', 'y': 'Option data' },
    { 'x': 'GLB', 'y': 'Earnings' },
    { 'x': 'ASI', 'y': 'Earnings' },
    { 'x': 'KOR', 'y': 'Earnings' },
    { 'x': 'TWN', 'y': 'Earnings' },
    { 'x': 'HKG', 'y': 'Earnings' },
    { 'x': 'ASI', 'y': 'Insiders' },
    { 'x': 'KOR', 'y': 'Insiders' },
    { 'x': 'HKG', 'y': 'Insiders' },
    { 'x': 'GLB', 'y': 'Short interest data' },
    { 'x': 'ASI', 'y': 'Short interest data' },
    { 'x': 'KOR', 'y': 'Short interest data' },
    { 'x': 'TWN', 'y': 'Short interest data' },
    { 'x': 'HKG', 'y': 'Short interest data' },
    { 'x': 'GLB', 'y': 'Macro data' },
    { 'x': 'ASI', 'y': 'Macro data' },
    { 'x': 'KOR', 'y': 'Macro data' },
    { 'x': 'TWN', 'y': 'Macro data' },
    { 'x': 'HKG', 'y': 'Macro data' },
    { 'x': 'GLB', 'y': 'Other' },
    { 'x': 'ASI', 'y': 'Other' },
    { 'x': 'KOR', 'y': 'Other' },
    { 'x': 'TWN', 'y': 'Other' },
    { 'x': 'HKG', 'y': 'Other' },
    { 'x': 'GLB', 'y': 'Risk data' },
    { 'x': 'ASI', 'y': 'Risk data' },
    { 'x': 'KOR', 'y': 'Risk data' },
    { 'x': 'TWN', 'y': 'Risk data' },
    { 'x': 'HKG', 'y': 'Risk data' },
    { 'x': 'GLB', 'y': 'Model data' },
    { 'x': 'ASI', 'y': 'Model data' },
    { 'x': 'KOR', 'y': 'Model data' },
    { 'x': 'TWN', 'y': 'Model data' },
    { 'x': 'HKG', 'y': 'Model data' }
]

// content.js
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

waitForElement(".card__wrapper").then(() => {
    var newElement = document.createElement('div');
    newElement.classList.add('card__content');
    newElement.classList.add('alpha_distribution');

    newElement.innerHTML = `
    <div class="canvas"><canvas id="alphaDistribution0"></canvas></div>
    <div class="canvas"><canvas id="alphaDistribution1"></canvas></div>
    `;

    // 获取目标元素
    var targetElement = document.querySelector('.card__wrapper');


    // 获取目标元素的第二个子元素
    var secondChild = targetElement.childNodes[1];

    // 在目标元素的第二个子元素之前插入新的子元素
    targetElement.insertBefore(newElement, secondChild);
    // targetElement.appendChild(newElement);
    fetch(url, {
        method: 'GET', // 或者是 'POST', 'PUT', 等。
        credentials: 'include' // 确保包含同源cookie
    }).then(
        response => {
            return response.json()

        }
    ).then(data => {
        console.log(data)
        plotData(data, 0);
        plotData(data, 1);
        return data;
    })
}).catch(error => console.error(error));



function plotData(data, delay) {
    console.log('data.alphas');
    console.log(data.alphas);
    let filteredData1 = data.alphas.filter(item => regions.includes(item.region) && dataSets.hasOwnProperty(item.dataCategory.id) && item.delay == delay);
    console.log('filteredData1');
    console.log(filteredData1);
    let scatterData1 = filteredData1.map(item => ({
        x: item.region,
        y: dataSets[item.dataCategory.id],
        value: item.alphaCount,
        pass: item.dataDiversity.check,
        total: data.alphas.filter(item_alpha => item_alpha.region == item.region && item_alpha.delay == delay).map(item_count => item_count.alphaCount).reduce((max, current) => Math.max(max, current), 0)
    }));

    var non_data_copy

    if (delay==0){
        non_data_copy = non_data.concat(non_data_delay0);
    }else{
        non_data_copy = non_data;
    }
    console.log('non_data_copy')
    console.log(non_data_copy)
    non_data_copy = non_data_copy.map(item => ({
        x: item.x,
        y: item.y,
        value: (data.count * 0.2).toFixed(0)
    }));
    var ctx = document.getElementById(`alphaDistribution${delay}`).getContext('2d');

    var scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: `Delay${delay}`,
                    backgroundColor: function (context) {
                        console.log(context.raw)
                        // 如果已指定特定点的背景颜色，则使用它，否则使用默认颜色
                        try{
                            if (context.raw.pass != "PASS") {
                                return 'rgba(226, 49, 32, 1)'
                            } else {
                                return 'rgba(75, 192, 192, 1)';
                            }
                        }catch (error) {
                            return 'rgba(75, 192, 192, 1)'
                        }
                        
                        // ;

                    },
                    data: scatterData1
                },
                {
                    label: `NAN`,
                    backgroundColor: 'rgba(225, 232, 238, 1)',
                    data: non_data_copy
                },
            ]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            scales: {
                x: {
                    type: 'category',
                    position: 'bottom',
                    labels: regions
                },
                y: {
                    type: 'category',
                    position: 'left',
                    labels: Object.values(dataSets)
                }
            },
            elements: {
                point: {
                    // 回调函数，用于设置散点的半径
                    radius: function (context) {
                        try{
                            var value = context.dataset.data[context.dataIndex].value / data.count * 100;
                        }catch (error) {
                            // 当发生异常时执行的代码
                            console.error(error);
                            console.error(context.dataset);
                            var value=0
                        }                          
                        return Math.sqrt(value) * 2; // 根据值的大小设置半径
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            let x = context.dataset.data[context.dataIndex].x;
                            let y = context.dataset.data[context.dataIndex].y;
                            let value = context.dataset.data[context.dataIndex].value;
                            let total = context.dataset.data[context.dataIndex].total;
                            return label + `(${x},${y}) Value: ${value} Ratio: ${(value / total * 100).toFixed(0)}%`;
                        }
                    }
                },
                legend: {
                    labels: {
                        font: {
                            size: 18 // 将图例的字体大小设置为 18
                        }
                    }
                }
            }
        }
    });
}

