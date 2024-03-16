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
var regions = ['USA', 'ASI', 'CHN', 'EUR', 'GLB', 'HKG', 'KOR', 'TWN'];
var url = "https://api.worldquantbrain.com/users/self/activities/diversity?grouping=region,delay,dataCategory"




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
        response => response.json()
    ).then(data => {
        console.log(data)
        plotData(data, 0);
        plotData(data, 1);
        return data;
    })
}).catch(error => console.error(error));



function plotData(data, delay) {
    let filteredData1 = data.alphas.filter(item => regions.includes(item.region) && dataSets.hasOwnProperty(item.dataCategory.id) && item.delay == delay);
    let scatterData1 = filteredData1.map(item => ({
        x: item.region,
        y: dataSets[item.dataCategory.id],
        value: item.alphaCount
    }));
    console.log(scatterData1);

    var ctx = document.getElementById(`alphaDistribution${delay}`).getContext('2d');

    var scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `Delay${delay}`,
                backgroundColor: 'rgba(75, 192, 192, 1)',
                data: scatterData1
            }]
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
                        var value = context.dataset.data[context.dataIndex].value/data.count*100;
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

                            console.log(context.dataset.data)
                            console.log(context.dataIndex)
                            let x = context.dataset.data[context.dataIndex].x;
                            let y = context.dataset.data[context.dataIndex].y;
                            let value = context.dataset.data[context.dataIndex].value;
                            return label + `(${x},${y}) Value: ${value}`;
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

