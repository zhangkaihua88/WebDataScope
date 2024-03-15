function getUserProfileCardDataHTML() {
    return `
        <div class="idc-content h">
            <b id='title' class="idc-uname">
                数据分析报告
            </b>
        </div>
        <div class="canvas-container">
            <div class="dataInfo">
                <span id='frequency'></span><br>
                <span id='coverage'></span><br>
                <span id='coverageRatio'></span><br>
                <span id='posRatio'></span><br>
                <span id='negRatio'></span><br>
                <span id='abs01Ratio'></span><br>
                <span id='intStat'></span><br>
                <span id='skew'></span><br>
                <span id='kurt'></span><br>
            </div>
            <div class="canvasDataInfo"><canvas id="WQAnaDataHist"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist0"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist1"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist2"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist3"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist4"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist5"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist6"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist7"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist8"></canvas></div>
            <div class="canvas"><canvas id="WQAnaDataHist9"></canvas></div>
        </div>

    `
}
function getUserProfileCardHTML() {
    return `
        <div id="biliscope-id-card" style="position: absolute;">
            <div id="biliscope-id-card-data">
                ${getUserProfileCardDataHTML()}
            </div>
        </div>
    `
}

function UserProfileCard() {
    this.dataId = null;
    this.data = {};
    this.cursorX = 0;
    this.cursorY = 0;
    this.target = null;
    this.enabled = false;
    this.wordCloud = null;
    this.lastDisable = 0;
    this.el = document.createElement("div");
    this.el.style.position = "absolute";
    this.el.innerHTML = getUserProfileCardHTML(); //this.data
    this.disable();
    document.body.appendChild(this.el);

    // // 创建一个新的script元素
    // var script = document.createElement('script');
    // // 设置script的src属性指向Chart.js的CDN链接
    // script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    // // 当script加载完成后执行的回调函数
    // script.onload = function () {
    //     // Chart.js 已加载，可以在这里使用它了
    //     console.log('Chart.js has been loaded successfully!');
    // };
    // // 将script元素添加到文档的head中，开始加载过程
    // document.head.appendChild(script);

}
UserProfileCard.prototype.enable = function (dataId) {
    if (dataId != null && dataId != this.dataId) {
        this.enabled = true;
        return true;
    }
    return false;
}

UserProfileCard.prototype.disable = function () {
    this.dataId = null;
    this.enabled = false;
    if (this.el) {
        this.el.style.display = "none";
        let canvas = document.getElementById("word-cloud-canvas");
        if (canvas) {
            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}





UserProfileCard.prototype.updateDataId = function (dataId, data) {
    this.dataId = dataId;
    this.data = data;
}

UserProfileCard.prototype.updateCursor = function (cursorX, cursorY) {
    const cursorPadding = 10;
    const windowPadding = 20;

    this.cursorX = cursorX;
    this.cursorY = cursorY;

    if (this.el) {
        let width = this.el.scrollWidth;
        let height = this.el.scrollHeight;

        if (this.cursorX + width + windowPadding > window.scrollX + window.innerWidth) {
            // Will overflow to the right, put it on the left
            this.el.style.left = `${this.cursorX - cursorPadding - width}px`;
        } else {
            this.el.style.left = `${this.cursorX + cursorPadding}px`;
        }

        if (this.cursorY + height + windowPadding > window.scrollY + window.innerHeight) {
            // Will overflow to the bottom, put it on the top
            if (this.cursorY - windowPadding - height < window.scrollY) {
                // Can't fit on top either, put it in the middle
                this.el.style.top = `${window.scrollY + (window.innerHeight - height) / 2}px`;
            } else {
                this.el.style.top = `${this.cursorY - cursorPadding - height}px`;
            }
        } else {
            this.el.style.top = `${this.cursorY + cursorPadding}px`;
        }
    }
}

UserProfileCard.prototype.updateTarget = function (target) {
    this.target = target;
    upc = this
    this.target.addEventListener("mouseleave", function leaveHandle(ev) {
        upc.disable();
        upc.lastDisable = Date.now();
        this.removeEventListener("mouseleave", leaveHandle);
    })
}


function anaDis(rawData) {
    let bins = [];
    let data = [];

    // 先将键排序
    const sortedKeys = Object.keys(rawData).sort((a, b) => {
        const aLowerBound = parseFloat(a.match(/\d+\.?\d*/g)[0]);
        const bLowerBound = parseFloat(b.match(/\d+\.?\d*/g)[0]);
        return aLowerBound - bLowerBound;
    });

    // 然后遍历排序后的键
    sortedKeys.forEach((key, index) => {
        const bounds = key.match(/\d+\.?\d*/g).map(Number);
        // 对于数组的第一个元素，添加其下界
        if (index === 0) bins.push(bounds[0]);
        // 添加上界
        bins.push(bounds[1]);
        // 添加对应的数据值
        data.push(rawData[key]);
    });
    return [bins, data];
}

var sum = function(x,y){ return x+y;};　
UserProfileCard.prototype.updateData = function (data) {
    this.el.innerHTML = getUserProfileCardHTML();
    this.el.style.display = "flex";
    console.log(data)

    document.getElementById("title").innerHTML = `${this.data.dataField} 分析报告`;

    document.getElementById("frequency").innerHTML = `更新频率: ${data['frequency']}`;
    document.getElementById("coverage").innerHTML = `覆盖数: ${(data['Coverage'].reduce(sum)/data['Coverage'].length).toFixed(0)}`;
    document.getElementById("coverageRatio").innerHTML = `覆盖率: ${(data['CoverageRatio'].reduce(sum)/data['CoverageRatio'].length).toFixed(2)}`;
    document.getElementById("posRatio").innerHTML = `正值占比: ${(data['IndicativePositiveRatio'].reduce(sum)/data['IndicativePositiveRatio'].length).toFixed(2)}`;
    document.getElementById("negRatio").innerHTML = `负值占比: ${(data['IndicativeNegativeRatio'].reduce(sum)/data['IndicativeNegativeRatio'].length).toFixed(2)}`;
    document.getElementById("abs01Ratio").innerHTML = `abs在[0,1]的占比: ${(data['absValueBetween1and0ratio'].reduce(sum)/data['absValueBetween1and0ratio'].length).toFixed(2)}`;
    document.getElementById("intStat").innerHTML = `是否为整数: ${data['IntegerStatus']}`;
    document.getElementById("skew").innerHTML = `偏度: ${data['skenewss']}`;
    document.getElementById("kurt").innerHTML = `峰度: ${data['kurtosis']}`;


    const ctx = document.getElementById(`WQAnaDataHist`).getContext('2d');

    const myHistogram = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], // 生成X轴的标签
            datasets: [{
                label: '覆盖率',
                data: data['CoverageRatio'], // 使用计算出的频率数据
                fill: false,
                // borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                tension: 0.1
            },{
                label: '正值占比',
                data: data['IndicativePositiveRatio'], // 使用计算出的频率数据
                fill: false,
                // borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                tension: 0.1
            },{
                label: '负值占比',
                data: data['IndicativeNegativeRatio'], // 使用计算出的频率数据
                fill: false,
                // borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                tension: 0.1
            },{
                label: 'abs在[0,1]的占比',
                data: data['absValueBetween1and0ratio'], // 使用计算出的频率数据
                fill: false,
                // borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                tension: 0.1
            },
        ]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            animations: false,
            scales: {
                y: {
                    min: 0, // 设置 Y 轴的最小值
                    max: 1, // 设置 Y 轴的最大值
                    beginAtZero: true // 确保 Y 轴从 0 开始
                },
            },
        },
    });



    // var ctx = document.getElementById('myChart').getContext('2d');
    // var myChart = new Chart(ctx, {
    //     type: 'line',
    //     data: {
    //         labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
    //         datasets: [{


    //             fill: false,
    //             borderColor: 'rgb(75, 192, 192)',
    //             tension: 0.1
    //         }]
    //     },
    //     options: {
    //         scales: {
    //             y: {
    //                 beginAtZero: true
    //             }
    //         }
    //     }
    // });




    for (var i = 0; i < data['yearly_distribution'].length; i++) {

        let result = anaDis(data['yearly_distribution'][i]);
        let bins = result[0];
        let bins_data = result[1];
        const ctx = document.getElementById(`WQAnaDataHist${i}`).getContext('2d');
        const myHistogram = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bins, // 生成X轴的标签
                datasets: [{
                    label: 'Frequency',
                    data: bins_data, // 使用计算出的频率数据
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                animations: false,
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    // x: { // 注意：这里的x是Chart.js较新版本的用法，老版本可能需要使用xAxes数组
                    //     ticks: {
                    //         // 使用callback自定义显示哪些刻度标签
                    //         callback: function(value, index, values) {
                    //             // 例如，只显示索引为偶数的刻度标签
                    //             console.log(value,index,values)
                    //             return index % 3 === 0 ? index*0.05 : '';
                    //         }
                    //     }
                    // }
        
                },
                plugins: {
                    legend: {
                        display: false // 通过这里隐藏图例
                    }
                },
            },
        });
    }


}


userProfileCard = new UserProfileCard();



