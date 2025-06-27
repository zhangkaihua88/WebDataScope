//新
// genius.js: genius相关功能的 JS 文件
// 1. Operator Analysis
// 2. Rank Analysis 
console.log('genius.js loaded');
console.log('jQuery version:', typeof $ !== 'undefined' ? $.fn.jquery : 'not loaded');
console.log('DataTables version:', typeof $.fn.dataTable !== 'undefined' ? $.fn.dataTable.version : 'not loaded');
console.log('DataTables Buttons version:', typeof $.fn.dataTable.Buttons !== 'undefined' ? $.fn.dataTable.Buttons.version : 'not loaded');


// ############################## 常数变量 ##############################
// operator API URL
const OptUrl = 'https://api.worldquantbrain.com/operators';
// genius level criteria
const levelCriteria = {
    "expert": { "alphaCount": 20, "pyramidCount": 10, "combinedAlphaPerformance": 0.5, "combinedSelectedAlphaPerformance": 0.5 },
    "master": { "alphaCount": 120, "pyramidCount": 20, "combinedAlphaPerformance": 1, "combinedSelectedAlphaPerformance": 1 },
    "grandmaster": { "alphaCount": 220, "pyramidCount": 50, "combinedAlphaPerformance": 2, "combinedSelectedAlphaPerformance": 2 }
}

const CONCURRENCY = 10; // 同时进行的请求数

const targetSelectorButton = '#root > div > div.genius__container > div > div > div.genius__header';

// ############################## 运算符分析 ##############################

async function fetchAllAlphas() {
    // 抓取本季度所有的alpha

    updateButton('WQPOPSFetchButton', `开始抓取`);

    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const quarter = Math.floor((currentDate.getMonth() + 3) / 3);
    const quarters = [
        // https://api.worldquantbrain.com/users/self/alphas?limit=30&offset=0&status!=UNSUBMITTED%1FIS-FAIL&dateSubmitted%3E
        // 2025-02-01T05:00:00.000Z
        // &dateSubmitted%3C
        // 2025-02-28T05:00:00.000Z
        // &order=-dateCreated&hidden=false

        // https://api.worldquantbrain.com/users/self/alphas?limit=30&offset=0&status!=UNSUBMITTED%1FIS-FAIL&
        // dateSubmitted%3E
        // 2025-01-01T05:00:00.000Z
        // &dateSubmitted%3C
        // 2025-03-31T04:00:00.000Z
        // &order=-dateCreated&hidden=false

        // https://api.worldquantbrain.com/users/self/alphas?limit=30&offset=0&status!=UNSUBMITTED%1FIS-FAIL&dateSubmitted%3E2024-04-01T04:00:00.000Z&dateSubmitted%3C2024-06-30T04:00:00.000Z&order=-dateCreated&hidden=false
        // https://api.worldquantbrain.com/users/self/alphas?limit=30&offset=0&status!=UNSUBMITTED%1FIS-FAIL&dateSubmitted%3E2024-07-01T04:00:00.000Z&dateSubmitted%3C2024-09-30T04:00:00.000Z&order=-dateCreated&hidden=false
        // https://api.worldquantbrain.com/users/self/alphas?limit=30&offset=0&status!=UNSUBMITTED%1FIS-FAIL&dateSubmitted%3E2024-10-01T04:00:00.000Z&dateSubmitted%3C2024-12-31T05:00:00.000Z&order=-dateCreated&hidden=false

        { start: `${year}-01-01T05:00:00.000Z`, end: `${year}-04-01T04:00:00.000Z` },  // 第一季度
        { start: `${year}-04-01T04:00:00.000Z`, end: `${year}-07-01T04:00:00.000Z` },  // 第二季度
        { start: `${year}-07-01T04:00:00.000Z`, end: `${year}-10-01T04:00:00.000Z` },  // 第三季度
        { start: `${year}-10-01T04:00:00.000Z`, end: `${year}-01-01T05:00:00.000Z` }   // 第四季度
    ];
    const { start, end } = quarters[quarter - 1];
    const dateRange = `dateSubmitted%3E${start}&dateSubmitted%3C${end}`;

    let allResults = [];
    let offset = 0; // Initial offset
    const limit = 30; // Data limit per page
    const statusFilter = "status!=UNSUBMITTED%1FIS-FAIL";
    const order = "order=-dateCreated";
    const hiddenFilter = "hidden=false";
    let totalCount = 0; // To store total count

    while (true) {
        const AlphaUrl = `https://api.worldquantbrain.com/users/self/alphas?limit=${limit}&offset=${offset}&${statusFilter}&${dateRange}&${order}&${hiddenFilter}`;
        data = await getDataFromUrl(AlphaUrl);
        allResults = allResults.concat(data.results); // Merge results
        if (totalCount === 0) {
            totalCount = data.count;
        }
        if (allResults.length >= totalCount) {
            break;
        }
        offset += limit; // Increase offset for the next page
        updateButton('WQPOPSFetchButton', `正在抓取 ${allResults.length} / ${totalCount}`); // Update button text
    }
    updateButton('WQPOPSFetchButton', `正在分析`);


    // Check if the length matches the total count
    const count = allResults.length;
    console.log(`Fetched ${count} results, expected ${totalCount}`);

    if (count === totalCount) {
        console.log("All results fetched successfully!");
    } else {
        console.log("There seems to be a mismatch in the count!");
    }
    return allResults;
}

async function opsAna() {
    // 分析所有的alpha中的运算符, button 分析运算符的调用函数

    const data = await fetchAllAlphas();
    let operators = await getDataFromUrl(OptUrl);
    operators = operators.filter(item => item.scope.includes('REGULAR'));

    regulars = data.map(item => item.type === 'REGULAR' ? item.regular.code : '');
    // regulars = data.map(item => item.type === 'REGULAR' ? item.regular.code : item.combo.code);
    console.log(regulars);
    let use_ops = regulars.map(item => findOps(item, operators)).flat();

    const operatorMapping = {
        '+': 'add',
        '-': 'subtract',
        '*': 'multiply',
        '/': 'divide',
        '^': 'power',
        '<=': 'less_equal',
        '>=': 'greater_equal',
        '<': 'less',
        '>': 'greater',
        '==': 'equal',
        '!=': 'not_equal',
        '?': 'if_else',
        '&&': 'and',
        '||': 'or',
        '!': 'not'
    };

    use_ops = use_ops.map(op => operatorMapping[op] || op);

    let counts = {};
    // Count the occurrences of each item
    use_ops.forEach(op => {
        counts[op] = (counts[op] || 0) + 1;
    });

    // Assign the count to each element in the array
    operators = operators.map(op => {
        return {
            name: op.name,
            category: op.category,
            definition: op.definition,
            count: counts[op.name] || 0,
            scope: op.scope,
            level: op.level === 'ALL' ? 'base' : 'genius',
        };
    });
    let currentTime = new Date().toISOString();
    let dataToSave = {
        array: operators,
        timestamp: currentTime
    };
    chrome.storage.local.set({ WQPOPSAna: dataToSave }, function () {
        console.log('数据已保存');
        console.log(dataToSave);
    });
    insertOpsTable();
    resetButton('WQPOPSFetchButton', `运算符分析完成${data.length}`);
}

function formatSavedTimestamp(isoString){
	try{
		return new Date(isoString).toLocaleString();
	}catch(error){
		console.error('格式化保存时间戳失败:', error);
		return isoString;
	}
}
function insertOpsTable() {
    // 插入运算符分析的表格, button 插入表格的调用函数

    chrome.storage.local.get('WQPOPSAna', function (result) {
        if (result.WQPOPSAna) {
            console.log('读取的数据:', result.WQPOPSAna);
            let savedArray = result.WQPOPSAna.array;
            let savedTimestamp = result.WQPOPSAna.timestamp;
            const zeroCount = savedArray.filter(item => item.count === 0).length;
            const nonZeroCount = savedArray.filter(item => item.count !== 0).length;

            console.log(savedArray);
            console.log(savedTimestamp);

            // 创建表格结构
            let tableHTML = `
            <div class="research-paradigm__header">
                <h2 class="genius__subtitle">Operator Analysis</h2>
                <small class="genius__hint genius__hint--dark"><span>${formatSavedTimestamp(savedTimestamp)}</span></small>
            </div>

            <article class="card">
            <div class="card_wrapper">
            <div class="card__content" style="padding-bottom: 26px;">
                <h3>在你可用的运算符中，共有${nonZeroCount}种运算符被使用，${zeroCount}种运算符未被使用。</h3>
                <p>'-'有两种含义分别是substract和revers, 此处统一为substract</p>
                
                
                <div class="operator-table">
                    <table id="operatorTable" class="sortable WQScope_table">
                        <thead>
                            <tr>
                                <th data-sort="category">Category</th>
                                <th data-sort="definition">Definition</th>
                                <th data-sort="count">Count</th>
                                <th data-sort="scope">Scope</th>
                                <th data-sort="level">Level</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            // 插入数据行
            savedArray.forEach((item, index) => {
                const rowClass = index % 2 === 0 ? '' : 'class="odd-row"';
                tableHTML += `
                <tr ${rowClass}>
                    <td>${item.category}</td>
                    <td>${item.definition}</td>
                    <td>${item.count}</td>
                    <td>${item.scope}</td>
                    <td>${item.level}</td>
                </tr>
                `;
            });

            // 关闭表格标签
            tableHTML += `
                        </tbody>
                    </table>
                </div>
            </div>
            </div>
            </article>
            `;

            // 查找目标插入位置
            const mainContent = document.querySelector('.genius__main-content');
            if (mainContent) {
                // 检查是否已经存在表格，如果存在则删除旧表格
                const existingTable = mainContent.querySelector("#operatorTable");
                if (existingTable) {
                    existingTable.remove();
                }
                // 插入新的表格
                mainContent.innerHTML += tableHTML;
            } else {
                console.error('未找到mainContent元素');
            }

            // 排序功能
            const table = document.getElementById("operatorTable");
            const headers = table.querySelectorAll("th");

            headers.forEach(header => {
                header.addEventListener('click', function () {
                    const column = this.getAttribute('data-sort');
                    const rows = Array.from(table.querySelectorAll("tbody tr"));
                    const sortedRows = rows.sort((a, b) => {
                        const cellA = a.querySelector(`td:nth-child(${this.cellIndex + 1})`).innerText;
                        const cellB = b.querySelector(`td:nth-child(${this.cellIndex + 1})`).innerText;

                        // 判断排序方式（数值或字符串）
                        if (column === 'count') {
                            return parseFloat(cellB) - parseFloat(cellA); // 数值排序
                        } else {
                            return cellA.localeCompare(cellB); // 字符串排序
                        }
                    });

                    // 清空原有的行并添加排序后的行
                    const tbody = table.querySelector("tbody");
                    tbody.innerHTML = '';
                    sortedRows.forEach(row => tbody.appendChild(row));
                });
            });

        } else {
            console.log('没有找到保存的数据');
        }
    });
}


// ############################## 排名分析 ##############################


function determineUserLevel(userData, geniusCombineTag) {
    // 根据用户数据判断用户级别

    for (const level of ["grandmaster", "master", "expert"]) {
        const criteria = levelCriteria[level];

        // 检查 alphaCount 和 pyramidCount 是否满足条件
        const isBaseConditionMet = (
            userData.alphaCount >= criteria.alphaCount &&
            userData.pyramidCount >= criteria.pyramidCount
        );

        // 根据 geniusCombineTag 决定是否检查 combinedAlphaPerformance 或 combinedSelectedAlphaPerformance
        let isPerformanceConditionMet = true;
        if (geniusCombineTag) {
            // 如果 geniusCombineTag 为 true，需要同时满足 combinedAlphaPerformance 和 combinedSelectedAlphaPerformance
            isPerformanceConditionMet = (
                userData.combinedAlphaPerformance >= criteria.combinedAlphaPerformance ||
                userData.combinedSelectedAlphaPerformance >= criteria.combinedSelectedAlphaPerformance
            );
        }

        // 如果所有条件都满足，则返回当前级别
        if (isBaseConditionMet && isPerformanceConditionMet) {
            return level;
        }
    }
    return 'gold';
}

async function getAllRank() {
    // 根据用户ID获取单个用户的排名信息

    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['WQPRankData', 'WQPSettings'], function ({ WQPRankData, WQPSettings }) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            let data = WQPRankData?.array || [];
            const savedTimestamp = WQPRankData?.timestamp || 'N/A';
            let itemData;

            // data.forEach(item => item['achievedLevel'] = determineUserLevel(item, WQPSettings.geniusCombineTag));
            data.forEach(item => item['finalLevel'] = 'gold');
            data = data.filter(item => item.alphaCount > 0);

            for (const model of ["gold", "expert", "master", "grandmaster"]) {
                if (model === 'gold') {
                    itemData = data.map((item, index) => ({ ...item, originalIndex: index }));
                } else {
                    itemData = data.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.alphaCount >= levelCriteria[model].alphaCount && item.pyramidCount >= levelCriteria[model].pyramidCount);
                    if (WQPSettings.geniusCombineTag) {
                        itemData = itemData.filter(item => item.combinedAlphaPerformance >= levelCriteria[model].combinedAlphaPerformance || item.combinedSelectedAlphaPerformance >= levelCriteria[model].combinedSelectedAlphaPerformance);
                    }
                }
                itemData.forEach(item => item['TotalRank'] = 0);
                for (const col of ["operatorCount", "fieldCount", "communityActivity", "completedReferrals", "maxSimulationStreak"]) {
                    let sorted = itemData.map(item => item[col]).sort((a, b) => b - a);
                    itemData.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
                    itemData.forEach(item => item['TotalRank'] = item['TotalRank'] + item[col + 'Rank']);
                }
                for (const col of ["operatorAvg", "fieldAvg"]) {
                    let sorted = itemData.map(item => item[col]).sort((a, b) => a - b);
                    itemData.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
                    itemData.forEach(item => item['TotalRank'] = item['TotalRank'] + item[col + 'Rank']);
                }
                itemData.forEach(item => {
                    data[item.originalIndex][model + 'TotalRank'] = item['TotalRank'];
                    for (const col of ["operatorCount", "fieldCount", "communityActivity", "completedReferrals", "maxSimulationStreak", "operatorAvg", "fieldAvg"]) {
                        data[item.originalIndex][model + col + 'Rank'] = item[col + 'Rank'];
                    };
                    data[item.originalIndex]['achievedLevel'] = model;
                });
            }



            baseCount = data.filter(item => item.alphaCount >= WQPSettings.geniusAlphaCount).length;
            grandmasterCount = Math.round(baseCount * 0.02);
            masterCount = Math.round(baseCount * 0.08);
            expertCount = Math.round(baseCount * 0.2);


            console.log('baseCount:', baseCount);
            console.log('expertCount:', expertCount);
            console.log('masterCount:', masterCount);
            console.log('grandmasterCount:', grandmasterCount);





            // 计算每个用户的最终级别
            // 根据totalRank进行排序，前面的用户级别为最高级别
            data.sort((a, b) => {
                const rankA = isNaN(a.expertTotalRank) ? Number.MAX_SAFE_INTEGER : a.expertTotalRank;
                const rankB = isNaN(b.expertTotalRank) ? Number.MAX_SAFE_INTEGER : b.expertTotalRank;
                return rankA - rankB;
            });
            data.forEach((item, index) => {
                if (index < expertCount + masterCount + grandmasterCount && ['expert', 'master', 'grandmaster'].includes(item.achievedLevel)) {
                    item.finalLevel = 'expert';
                }
            });
            // data.sort((a, b) => a.masterTotalRank - b.masterTotalRank);
            data.sort((a, b) => {
                const rankA = isNaN(a.masterTotalRank) ? Number.MAX_SAFE_INTEGER : a.masterTotalRank;
                const rankB = isNaN(b.masterTotalRank) ? Number.MAX_SAFE_INTEGER : b.masterTotalRank;
                return rankA - rankB;
            });
            data.forEach((item, index) => {
                if (index < masterCount + grandmasterCount && ['master', 'grandmaster'].includes(item.achievedLevel)) {
                    item.finalLevel = 'master';
                }
            });
            // data.sort((a, b) => a.grandmasterTotalRank - b.grandmasterTotalRank);
            data.sort((a, b) => {
                const rankA = isNaN(a.grandmasterTotalRank) ? Number.MAX_SAFE_INTEGER : a.grandmasterTotalRank;
                const rankB = isNaN(b.grandmasterTotalRank) ? Number.MAX_SAFE_INTEGER : b.grandmasterTotalRank;
                return rankA - rankB;
            });
            data.forEach((item, index) => {
                if (index < grandmasterCount && item.achievedLevel == 'grandmaster') {
                    item.finalLevel = 'grandmaster';
                }
            });



            data.forEach((item, index) => {
                switch (item.finalLevel) {
                    case 'grandmaster':
                        item.showRank = 300000 - parseInt(item.grandmasterTotalRank) || Number.MAX_SAFE_INTEGER;
                        break;
                    case 'master':
                        item.showRank = 200000 - parseInt(item.masterTotalRank) || Number.MAX_SAFE_INTEGER;
                        break;
                    case 'expert':
                        item.showRank = 100000 - parseInt(item.expertTotalRank) || Number.MAX_SAFE_INTEGER;
                        break;
                    case 'gold':
                    default:
                        item.showRank = -parseInt(item.goldTotalRank) || Number.MAX_SAFE_INTEGER;
                        break;
                }
            })
            // 数据的最后排序，先grandmaster，再master，再expert，最后gold，在每个级别内按照各自的totalRank排序（gradnmaster按照grandmasterTotalRank，master按照masterTotalRank，expert按照expertTotalRank，gold按照goldTotalRank）
            data.sort((a, b) => {
                return b.showRank - a.showRank;
            });
            console.log('Data:', data);





            resolve({ data, savedTimestamp });
        });
    });
}




async function insertRankListInfo() {
    const { data, savedTimestamp } = await getAllRank();


    let tableHTML = `
        <div id='rankListCard'>
        <div class="research-paradigm__header">
            <h2 class="genius__subtitle">Genius Rank List</h2>
            <small class="genius__hint genius__hint--dark"><span>${formatSavedTimestamp(savedTimestamp)}</span></small>
        </div>

        <article class="card" style="flex-direction: column-reverse;">
        <div class="card_wrapper">
        <div class="card__content" style="padding-bottom: 26px;max-width: 100%">
        <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">排名信息</h3>
        <small class="genius__hint genius__hint--dark">
            <span>${formatSavedTimestamp(savedTimestamp)}</span>
        </small>
        <table id="WQScope_RankListTable_RankSearch" class="inputs">
        <tbody><tr>
            <td>Minimum 排名:</td>
            <td><input type="text" id="min" name="min"></td>
        </tr>
        <tr>
            <td>Maximum 排名:</td>
            <td><input type="text" id="max" name="max"></td>
        </tr>
        </tbody></table>
        <table id="WQScope_RankListTable" class="display nowrap">
        </div>
        </div>
        </div>
        </article>
        </div>
        `;
    let mainContent = document.querySelector(targetSelectorButton);
    mainContent = mainContent.parentElement;
    if (mainContent) {
        // 检查是否已经存在表格，如果存在则删除旧表格
        const existingTable = mainContent.querySelector("#rankListCard");
        if (existingTable) {
            existingTable.remove();
        }
        // 插入新的表格
        const progressContainer = mainContent.querySelector('#WQButtonContainer');
        progressContainer.insertAdjacentHTML('afterend', tableHTML);

        data.forEach((item, idx) => {
            item.index = idx + 1;
        });
        grandmasterCount = data.filter(item => item.finalLevel === 'grandmaster').length;

        let columns = [
            {
                title: '',
                data: null,
                className: 'details-control',
                orderable: false,
                defaultContent: '<span style="cursor:pointer;">+</span>',
                width: '12px'
            },
            { title: '排名', data: 'index' },
            { title: '排序值', data: 'showRank', className: 'none' }, // 不显示排序值列
            { title: '用户ID', data: 'user' },
            { title: '达成等级', data: 'achievedLevel' },
            { title: '最终等级', data: 'finalLevel' },
            { title: '国家/地区', data: 'country', render: function (data, type) { return `<i title="${data}" class="${data.toLowerCase()} flag"></i>` + data; } },
            // 基础信息
            { title: 'Signals', data: 'alphaCount'}, // 信号数量
            { title: 'Pyramids', data: 'pyramidCount'}, // 金字塔数量
            { title: 'Combined Alpha Performance', data: 'combinedAlphaPerformance'}, // 综合Alpha表现
            { title: 'Combined Selected Alpha Performance', data: 'combinedSelectedAlphaPerformance'}, // 综合选择的Alpha表现

            
            
            // 六维
            { title: 'Operators used', data: 'operatorCount'},
            { title: 'Operator Avg', data: 'operatorAvg'},
            { title: 'Fields used', data: 'fieldCount'},
            { title: 'Field Avg', data: 'fieldAvg'},
            { title: 'Community Activity', data: 'communityActivity'},
            { title: 'Max Simulation Streak', data: 'maxSimulationStreak'},

            // 排名
            { title: 'Gold Total Rank', data: 'goldTotalRank'},
            { title: 'Gold Operator Count Rank', data: 'goldoperatorCountRank'},
            { title: 'Gold Operator Avg Rank', data: 'goldoperatorAvgRank'},
            { title: 'Gold Field Count Rank', data: 'goldfieldCountRank'},
            { title: 'Gold Field Avg Rank', data: 'goldfieldAvgRank'},
            { title: 'Gold Community Activity Rank', data: 'goldcommunityActivityRank'},
            { title: 'Gold Max Simulation Streak Rank', data: 'goldmaxSimulationStreakRank'},
            

            { title: 'Expert Total Rank', data: 'expertTotalRank'},
            { title: 'Expert Operator Count Rank', data: 'expertoperatorCountRank'},
            { title: 'Expert Operator Avg Rank', data: 'expertoperatorAvgRank'},
            { title: 'Expert Field Count Rank', data: 'expertfieldCountRank'},
            { title: 'Expert Field Avg Rank', data: 'expertfieldAvgRank'},
            { title: 'Expert Community Activity Rank', data: 'expertcommunityActivityRank'},
            { title: 'Expert Max Simulation Streak Rank', data: 'expertmaxSimulationStreakRank'},

            { title: 'Master Total Rank', data: 'masterTotalRank'},
            { title: 'Master Operator Count Rank', data: 'masteroperatorCountRank'},
            { title: 'Master Operator Avg Rank', data: 'masteroperatorAvgRank'},
            { title: 'Master Field Count Rank', data: 'masterfieldCountRank'},
            { title: 'Master Field Avg Rank', data: 'masterfieldAvgRank'},
            { title: 'Master Community Activity Rank', data: 'mastercommunityActivityRank'},
            { title: 'Master Max Simulation Streak Rank', data: 'mastermaxSimulationStreakRank'},

            { title: 'Grandmaster Total Rank', data: 'grandmasterTotalRank'},
            { title: 'Grandmaster Operator Count Rank', data: 'grandmasteroperatorCountRank'},
            { title: 'Grandmaster Operator Avg Rank', data: 'grandmasteroperatorAvgRank'},
            { title: 'Grandmaster Field Count Rank', data: 'grandmasterfieldCountRank'},
            { title: 'Grandmaster Field Avg Rank', data: 'grandmasterfieldAvgRank'},
            { title: 'Grandmaster Community Activity Rank', data: 'grandmastercommunityActivityRank'},
            { title: 'Grandmaster Max Simulation Streak Rank', data: 'grandmastermaxSimulationStreakRank'},
        ];


        const minEl = document.querySelector('#min');
        const maxEl = document.querySelector('#max');



        // 安全初始化 DataTable，数据缺失时自动填充 null
        const safeData = Array.isArray(data)
            ? data.map(row => {
            // 确保每个 columns.data 字段都存在，否则填 null
            const safeRow = {};
            columns.forEach(col => {
                // 支持自定义 render 字段
                if (typeof col.data === 'string') {
                safeRow[col.data] = row[col.data] !== undefined ? row[col.data] : null;
                }
            });
            // 保留原始字段
            return { ...row, ...safeRow };
            })
            : [];

        const table = new DataTable('#WQScope_RankListTable', {
            lengthMenu: [5, 10, 25, 50, grandmasterCount],
            data: safeData,
            columns,
            order: [[2, 'desc']],
            columnDefs: [
                { targets: [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44], visible: false },
                { targets: 2, visible: false, searchable: false },
                { targets: 5, orderDataType: 'level-order' },
                { targets: 4, orderDataType: 'level-order' },
                { targets: [4,5,6], columnControl: ['order', ['searchList']] }
            ],
            scrollX: true,
            responsive: false,
            stateSave: true,			
            layout: {
                topStart: 'pageLength',
                topEnd: ['search', 'buttons'],
                bottomStart: 'info',
                bottomEnd: 'paging'
            },
            buttons: [
                {
                    extend: 'colvis',
                    text: '显示/隐藏列',
                    className: 'buttons-colvis',
                    columns: ':gt(2)'
                }
            ],
            columnControl: [
                // {
                //     target: 1,
                //     content: ['orderStatus',]
                // },
                // {
                //     target: 2,
                //     content: ['search']
                // }
            ],			
        });

        // 行展开内容渲染函数
        function renderRowDetail(rowData, columnsArr) {
            var baseFields = [
                'Signals', 'Pyramids', 'Combined Alpha Performance', 'Combined Selected Alpha Performance',
            ];
            var sixFields = [
                'Operators used', 'Operator Avg', 'Fields used', 'Field Avg', 'Community Activity', 'Max Simulation Streak'
            ];
            function toRows(fields, colNum) {
                let html = '';
                for (let i = 0; i < fields.length; i += colNum) {
                    html += '<div style="display: flex; width: 100%;">';
                    for (let j = 0; j < colNum; j++) {
                        if (fields[i + j]) {
                            html += '<div style="flex:1; min-width: 180px; padding: 2px 8px;">' +
                                fields[i + j].title + ': ' + fields[i + j].value + '</div>';
                        } else {
                            html += '<div style="flex:1; min-width: 180px; padding: 2px 8px;"></div>';
                        }
                    }
                    html += '</div>';
                }
                return html;
            }
            function getFields(titles) {
                return columnsArr
                    .filter(col => titles.includes(col.title))
                    .map(col => ({
                        title: col.title,
                        value: rowData[col.data] !== undefined ? rowData[col.data] : ''
                    }));
            }
            let html = '';
            let base = getFields(baseFields);
            let six = getFields(sixFields);
            if (base.length) {
                html += '<div style="margin-bottom:8px;"><b>基础信息</b></div>';
                html += '<div style="display: flex; flex-direction: column;">' + toRows(base, 2) + '</div>';
            }
            if (six.length) {
                html += '<div style="margin-bottom:8px;"><b>六维</b></div>';
                html += '<div style="display: flex; flex-direction: column;">' + toRows(six, 3) + '</div>';
            }
            for (const model of ["gold", "expert", "master", "grandmaster"]) {
                var modelFields = columnsArr.filter(function(col) {
                    return col.title && col.title.toLowerCase().startsWith(model);
                });
                if (modelFields.length) {
                    html += `<div style="margin:12px 0 8px 0;"><b>${model.charAt(0).toUpperCase() + model.slice(1)} 排名总和: ${rowData[model+"TotalRank"]}</b></div>`;
                    modelFields = modelFields.filter(function(col) {
                        return !col.title.toLowerCase().includes('total');
                    });
                    html += '<div style="display: flex; flex-direction: column;">' + toRows(modelFields.map(col => ({title: col.title, value: rowData[col.data]})), 3) + '</div>';
                }
            }
            return html || false;
        }

        // 行展开/收起事件
        $('#WQScope_RankListTable tbody').on('click', 'td.details-control', function () {
            var tr = $(this).closest('tr');
            var row = table.row(tr);
            if (row.child.isShown()) {
                row.child.hide();
                tr.removeClass('shown');
                $(this).find('span').text('+');
            } else {
                var rowData = row.data();
                var columnsArr = table.settings().init().columns;
                var html = renderRowDetail(rowData, columnsArr);
                row.child(html).show();
                tr.addClass('shown');
                $(this).find('span').text('-');
            }
        });

        table.search.fixed('range', function (searchStr, data, index) {
            console.log(data)
            var min = parseFloat(minEl.value);
            var max = parseFloat(maxEl.value);
            var age = parseFloat(data['index']); // use data for the age column
            console.log(`Searching for range: ${min} - ${max}, current value: ${age}`);


            if (
                (isNaN(min) && isNaN(max)) ||
                (isNaN(min) && age <= max) ||
                (min <= age && isNaN(max)) ||
                (min <= age && age <= max)
            ) {
                return true;
            }

            return false;
        });
        // Changes to the inputs will trigger a redraw to update the table
        minEl.addEventListener('input', function () {
            table.draw();
        });
        maxEl.addEventListener('input', function () {
            table.draw();
        });


        // 自定义排序：grandmaster > master > expert > gold
        $.fn.dataTable.ext.order['level-order'] = function (settings, col) {
            const levelOrder = { grandmaster: 1, master: 2, expert: 3, gold: 4 };
            return this.api().column(col, { order: 'index' }).data().map(function (level) {
                return levelOrder[level] || 99;
            });
        };

        // mainContent.innerHTML = tableHTML + mainContent.innerHTML;
    } else {
        console.error('未找到mainContent元素');
    }
}

async function getSingleRankByUserId(userId) {
    // 根据用户ID获取单个用户的排名信息
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['WQPRankData', 'WQPSettings'], function ({ WQPRankData, WQPSettings }) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            const data = WQPRankData?.array || [];
            const savedTimestamp = WQPRankData?.timestamp || 'N/A';

            calculateRanks(data, userId, WQPSettings)
                .then(result => resolve({ result, savedTimestamp }))
                .catch(reject);
        });
    });
}

async function calculateRanks(data, userId, WQPSettings) {
	const userData = data.find(item => item.user === userId);

	if (!userData) {
		reject(`User with ID ${userId} not found.`);
		return;
	}

	const result = {};
	result['userData'] = userData;
	result['info'] = {
		"currentLevel": determineUserLevel(userData, WQPSettings.geniusCombineTag),
		"baseAlphaCount": WQPSettings.geniusAlphaCount,
	};
	// filter以item.name Rank结尾的
	result['gold'] = Object.fromEntries(Object.entries(userData).filter(([key, value]) => key.endsWith('Rank')));
	result['gold']['rank'] = data.filter(item => item.totalRank < userData.totalRank).length;
	result['gold']['count'] = data.length;
	result['gold']['baseCount'] = data.filter(item => item.alphaCount >= WQPSettings.geniusAlphaCount).length;

	for (const model of ["expert", "master", "grandmaster"]) {
		let itemData = data.filter(item => item.alphaCount >= levelCriteria[model].alphaCount && item.pyramidCount >= levelCriteria[model].pyramidCount);
		if (WQPSettings.geniusCombineTag) {
			itemData = itemData.filter(item => item.combinedAlphaPerformance >= levelCriteria[model].combinedAlphaPerformance || item.combinedSelectedAlphaPerformance >= levelCriteria[model].combinedSelectedAlphaPerformance);
		}
		result['gold'][model + 'Rank'] = itemData.filter(item => item.totalRank < userData.totalRank).length + 1;

		item_count = itemData.length;

		let itemUserData = itemData.find(item => item.user === userId);
		if (!itemUserData) {
			itemData.push(userData);
		}

		itemData.forEach(item => item['totalRank'] = 0);
		for (const col of ["operatorCount", "fieldCount", "communityActivity", "completedReferrals", "maxSimulationStreak"]) {
			let sorted = itemData.map(item => item[col]).sort((a, b) => b - a);
			itemData.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
			itemData.forEach(item => item['totalRank'] = item['totalRank'] + item[col + 'Rank']);
		}
		for (const col of ["operatorAvg", "fieldAvg"]) {
			let sorted = itemData.map(item => item[col]).sort((a, b) => a - b);
		 itemData.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
			itemData.forEach(item => item['totalRank'] = item['totalRank'] + item[col + 'Rank']);
		}

		itemUserData = itemData.find(item => item.user === userId);
		result[model] = Object.fromEntries(Object.entries(itemUserData).filter(([key, value]) => key.endsWith('Rank')));
		result[model]['rank'] = itemData.filter(item => item.totalRank < itemUserData.totalRank).length;
		result[model]['count'] = item_count;
	}

	return result;
}

function rankInfo2Html(result) {
	const userData = result['userData'] ;

    // 将排名信息转换为HTML格式
    return `
    <p>
    <strong>总人数:</strong> ${result.gold.count} 人<br>
    <strong>可能的基准人数:</strong> ${result.gold.baseCount} 人（交够${result.info.baseAlphaCount}个）
    </p>
    <strong>各个Level 满足的人数 / 最终的人数:</strong><br>
    <ul>
        <li>For Expert: ${result.expert.count} / ${Math.round(result.gold.baseCount * 0.2)}</li>
        <li>For Master: ${result.master.count} / ${Math.round(result.gold.baseCount * 0.08)}</li>
        <li>For Grandmaster: ${result.grandmaster.count} / ${Math.round(result.gold.baseCount * 0.02)}</li> 
    </ul>
    </p>
    
    <hr>
    <p>
    该用户目前满足的级别: <strong>${result.info.currentLevel}</strong>
    </p>

    <button id="editRankButton" style="margin-bottom: 10px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">编辑六维指标</button>
    <div id="editRankForm" style="display: none; margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
        <h4>编辑六维指标数据</h4>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <div>
                <label>Operator Count:</label>
                <input type="number" id="operatorCount" value="${userData.operatorCount || 0}" style="width: 100%;">
            </div>
            <div>
                <label>Operator Avg:</label>
                <input type="number" id="operatorAvg" value="${userData.operatorAvg || 0}" style="width: 100%;">
            </div>			
            <div>
                <label>Field Count:</label>
                <input type="number" id="fieldCount" value="${userData.fieldCount || 0}" style="width: 100%;">
            </div>
            <div>
                <label>Field Avg:</label>
                <input type="number" id="fieldAvg" value="${userData.fieldAvg || 0}" style="width: 100%;">
            </div>			
            <div>
                <label>Community Activity:</label>
                <input type="number" id="communityActivity" value="${userData.communityActivity || 0}" style="width: 100%;">
            </div>
            <div>
                <label>Max Simulation Streak:</label>
                <input type="number" id="maxSimulationStreak" value="${userData.maxSimulationStreak || 0}" style="width: 100%;">
            </div>
        </div>
        <button id="updateRankButton" style="margin-top: 10px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">更新排名</button>
    </div>
    <div style="display: flex; justify-content: space-between; gap: 20px;">
    <div style="flex: 1;">
        <h4>以 Expert 为 Universe</h4>
        <p><strong>总排名:</strong> ${result.expert.rank} / ${Math.round(result.gold.baseCount * 0.2)}</p>
        <ul>
            <li>Operator Count: ${result.expert.operatorCountRank} 名</li>
            <li>Operator Avg: ${result.expert.operatorAvgRank} 名</li>
            <li>Field Count: ${result.expert.fieldCountRank} 名</li>
            <li>Field Avg: ${result.expert.fieldAvgRank} 名</li>
            <li>Community Activity: ${result.expert.communityActivityRank} 名</li>
            <li>Completed Referrals: ${result.expert.completedReferralsRank} 名</li>
            <li>Max Simulation Streak: ${result.expert.maxSimulationStreakRank} 名</li>
            <li>Total Rank: ${result.expert.totalRank} 名</li>
        </ul>
    </div>

    <div style="flex: 1;">
        <h4>以 Master 为 Universe</h4>
        <p><strong>总排名:</strong> ${result.master.rank} / ${Math.round(result.gold.baseCount * 0.08)}</p>
        <ul>
            <li>Operator Count: ${result.master.operatorCountRank} 名</li>
            <li>Operator Avg: ${result.master.operatorAvgRank} 名</li>
            <li>Field Count: ${result.master.fieldCountRank} 名</li>
            <li>Field Avg: ${result.master.fieldAvgRank} 名</li>
            <li>Community Activity: ${result.master.communityActivityRank} 名</li>
            <li>Completed Referrals: ${result.master.completedReferralsRank} 名</li>
            <li>Max Simulation Streak: ${result.master.maxSimulationStreakRank} 名</li>
            <li>Total Rank: ${result.master.totalRank} 名</li>
        </ul>
    </div>

    <div style="flex: 1;">
        <h4>以 Grandmaster 为 Universe</h4>
        <p><strong>总排名:</strong> ${result.grandmaster.rank} / ${Math.round(result.gold.baseCount * 0.02)}</p>
        <ul>
            <li>Operator Count: ${result.grandmaster.operatorCountRank} 名</li>
            <li>Operator Avg: ${result.grandmaster.operatorAvgRank} 名</li>
            <li>Field Count: ${result.grandmaster.fieldCountRank} 名</li>
            <li>Field Avg: ${result.grandmaster.fieldAvgRank} 名</li>
            <li>Community Activity: ${result.grandmaster.communityActivityRank} 名</li>
            <li>Completed Referrals: ${result.grandmaster.completedReferralsRank} 名</li>
            <li>Max Simulation Streak: ${result.grandmaster.maxSimulationStreakRank} 名</li>
            <li>Total Rank: ${result.grandmaster.totalRank} 名</li>
        </ul>
    </div>
    `
}




async function insertMyRankInfo() {
    // 插入我的排名信息, button 插入我的排名信息的调用函数

    let userId = await getDataFromUrl('https://api.worldquantbrain.com/users/self/consultant/summary');
    userId = userId.leaderboard.user;
    const { result, savedTimestamp } = await getSingleRankByUserId(userId);
    // console.log('Data:', result);
    let tableHTML = `
        <div id='rankCard'>
        <div class="research-paradigm__header">
            <h2 class="genius__subtitle">Genius Rank Analysis</h2>
            <small class="genius__hint genius__hint--dark"><span>${formatSavedTimestamp(savedTimestamp)}</span></small>
        </div>

        <article class="card" style="flex-direction: column-reverse;">
        <div class="card_wrapper">
        <div class="card__content" style="padding-bottom: 26px;max-width: 100%">
        <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
        <small class="genius__hint genius__hint--dark">
            <span>${formatSavedTimestamp(savedTimestamp)}</span>
        </small>
        ${rankInfo2Html(result)}
        </div>
        </div>
        </div>
        </article>
        </div>
        `;
    let mainContent = document.querySelector(targetSelectorButton);
    mainContent = mainContent.parentElement;
    if (mainContent) {
        // 检查是否已经存在表格，如果存在则删除旧表格
        const existingTable = mainContent.querySelector("#rankCard");
        if (existingTable) {
            existingTable.remove();
        }
        // 插入新的表格
        const progressContainer = mainContent.querySelector('#WQButtonContainer');
        progressContainer.insertAdjacentHTML('afterend', tableHTML);
        // mainContent.innerHTML = tableHTML + mainContent.innerHTML;
		// 绑定事件监听器
		bindRankEditEvents(userId, savedTimestamp);
    } else {
        console.error('未找到mainContent元素');
    }
}


function bindRankEditEvents(userId, savedTimestamp) {
    const editButton = document.getElementById('editRankButton');
    const editForm = document.getElementById('editRankForm');
    const updateButton = document.getElementById('updateRankButton');

    if (editButton && editForm && updateButton) {
        editButton.addEventListener('click', () => {
            editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
        });

        updateButton.addEventListener('click', async () => {
            const newData = {
                operatorCount: parseInt(document.getElementById('operatorCount').value) || 0,
                operatorAvg: parseFloat(document.getElementById('operatorAvg').value) || 0,
                fieldCount: parseInt(document.getElementById('fieldCount').value) || 0,
                fieldAvg: parseFloat(document.getElementById('fieldAvg').value) || 0,
                communityActivity: parseFloat(document.getElementById('communityActivity').value) || 0,
                // completedReferrals: parseInt(document.getElementById('completedReferrals').value) || 0,
                maxSimulationStreak: parseInt(document.getElementById('maxSimulationStreak').value) || 0
            };
            console.debug('newData', newData);

            // 更新数据并重新计算排名
            const updatedResult = await updateUserRankings(userId, newData);
            
            // 更新显示
            const rankCard = document.getElementById('rankCard');
            if (rankCard) {
                rankCard.querySelector('.card__content').innerHTML = `
                    <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
                    <small class="genius__hint genius__hint--dark">
                        <span>${formatSavedTimestamp(savedTimestamp)}</span>
                    </small>
                    ${rankInfo2Html(updatedResult)}
                `;
                // 重新绑定事件监听器
                bindRankEditEvents(userId, savedTimestamp);
            }
        });
    }
}

async function updateUserRankings(userId, newData) {
    // 获取所有用户数据
    const { WQPRankData, WQPSettings } = await new Promise(resolve => {
        chrome.storage.local.get(['WQPRankData', 'WQPSettings'], resolve);
    });

    if (!WQPRankData || !WQPRankData.array) {
        throw new Error('No rank data available');
    }

    // 找到当前用户的数据
    const userData = WQPRankData.array.find(item => item.user === userId);
    if (!userData) {
        throw new Error('User data not found');
    }

    // 更新用户数据
    Object.assign(userData, newData);

    // 使用通用的排名计算函数
    return await calculateRanks(WQPRankData.array, userId, WQPSettings);
}

function getSeason() {
    // 获取当前季度
    // 2025-Q1、2025-Q2 (Current)
    let text = document.querySelector('.dropdown-custom--quarter').innerText;
    text = text.split('(')[0];
    text = text.trim();
    text = text.replace('Q1', '01-01');
    text = text.replace('Q2', '04-01');
    text = text.replace('Q3', '07-01');
    text = text.replace('Q4', '10-01');
    return text;
}
async function fetchAllUsers() {
    // 抓取所有用户的排名信息

    updateButton('WQPRankFetchButton', `开始抓取`);
    // const currentDate = new Date();

    // Convert to Eastern Time (ET)
    // const options = { timeZone: 'America/New_York' };
    // const easternDate = new Date(currentDate.toLocaleString('en-US', options));

    // Get year and quarter in Eastern Time
    // const year = easternDate.getFullYear();
    // const quarter = Math.floor((easternDate.getMonth() + 3) / 3);

    // const quarters = [
    //     `${year}-01-01`, // 第一季度
    //     `${year}-04-01`, // 第二季度
    //     `${year}-07-01`, // 第三季度
    //     `${year}-10-01`  // 第四季度
    // ];
    // const season = quarters[quarter - 1];
    const season = getSeason();
    console.log(season, "season")

    const limit = 100;
    // 获取初始数据
    const initialUrl = `https://api.worldquantbrain.com/consultant/boards/genius?limit=${limit}&offset=0&date=${season}&aggregate=user`;
    const initialData = await getDataFromUrl(initialUrl);
    const totalCount = initialData.count;
    let data = initialData.results;

    // 初始化进度
    let fetchedCount = data.length;
    updateButton('WQPRankFetchButton', `正在抓取 ${fetchedCount} / ${totalCount}`);

    // 计算剩余请求
    const remainingPages = Math.ceil(totalCount / limit) - 1;
    const offsets = Array.from({ length: remainingPages }, (_, i) => (i + 1) * limit);
    const urls = offsets.map(offset =>
        `https://api.worldquantbrain.com/consultant/boards/genius?limit=${limit}&offset=${offset}&date=${season}&aggregate=user`
    );

    // 并发控制配置


    // 分批请求函数
    const fetchBatch = async (batchUrls) => {
        const batchRequests = batchUrls.map(url =>
            getDataFromUrl(url).then(page => {
                fetchedCount += page.results.length;
                updateButton('WQPRankFetchButton', `正在抓取 ${fetchedCount} / ${totalCount}`);
                return page;
            })
        );
        return await Promise.all(batchRequests);
    };

    // 执行分批请求
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batchUrls = urls.slice(i, i + CONCURRENCY);
        const batchData = await fetchBatch(batchUrls);
        batchData.forEach(page => data = data.concat(page.results));
    }

    // // 保持原有的排名计算逻辑
    // data.forEach(item => item['totalRank'] = 0);
    // for (const col of ["operatorCount", "fieldCount", "communityActivity", "completedReferrals", "maxSimulationStreak"]) {
    //     let sorted = data.map(item => item[col]).sort((a, b) => b - a);
    //     data.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
    //     data.forEach(item => item['totalRank'] += item[col + 'Rank']);
    // }
    // for (const col of ["operatorAvg", "fieldAvg"]) {
    //     let sorted = data.map(item => item[col]).sort((a, b) => a - b);
    //     data.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
    //     data.forEach(item => item['totalRank'] += item[col + 'Rank']);
    // }

    console.log(`Fetched ${data.length} results, expected ${totalCount}`);
    return data;
}

async function rankAna() {
    // 分析所有用户的排名信息, button 分析排名的调用函数

    data = await fetchAllUsers();
    let currentTime = new Date().toISOString();
    let dataToSave = {
        array: data,
        timestamp: currentTime
    };
    chrome.storage.local.set({ WQPRankData: dataToSave }, function () {
        console.log('数据已保存');
        console.log(dataToSave);
    });
    resetButton('WQPRankFetchButton', `排名分析完成`);
    insertMyRankInfo();
}






// ############################## 插入按钮 ##############################

function ButtonGen(buttonText, buttonId, buttonClickFunction) {
    // 生成按钮
    const button = document.createElement('button');
    button.id = buttonId;
    button.innerText = buttonText;
    button.style.padding = '10px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.marginTop = '20px'; // Add margin on top
    button.style.marginBottom = '20px'; // Add margin on bottom
    button.style.display = 'block'; // Make the button a block element
    button.style.marginLeft = 'auto'; // Center the button horizontally
    button.style.marginRight = 'auto'; // Center the button horizontally
    button.addEventListener('mouseover', function () {
        button.style.backgroundColor = '#45a049'; // Darker green on hover
    });

    button.addEventListener('mouseout', function () {
        button.style.backgroundColor = '#4CAF50'; // Revert back to original color
    });
    button.addEventListener('click', buttonClickFunction);
    return button
}

function insertButton() {
    // 插入按钮
    const targetElement = document.querySelector(targetSelectorButton);
    console.log(targetElement);
    if (targetElement) {
        // Disconnect observer to avoid duplicate insertions
        console.log('Disconnecting observer');


        // Create a container div to hold both buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'WQButtonContainer';
        buttonContainer.style.display = 'flex'; // Flexbox to arrange buttons side by side
        buttonContainer.style.justifyContent = 'center'; // Center buttons horizontally
        buttonContainer.style.gap = '10px'; // Space between buttons

        // Append buttons to the container
        buttonContainer.appendChild(ButtonGen('运算符分析', 'WQPOPSFetchButton', opsAna));
        buttonContainer.appendChild(ButtonGen('显示运算符分析', 'WQPOPSShowButton', insertOpsTable));
        buttonContainer.appendChild(ButtonGen('排名分析', 'WQPRankFetchButton', rankAna));
        buttonContainer.appendChild(ButtonGen('显示排名分析', 'WQPRankShowButton', insertMyRankInfo));
        buttonContainer.appendChild(ButtonGen('显示排名列表', 'WQPRankListShowButton', insertRankListInfo));

        // Insert the button container after the target element
        targetElement.insertAdjacentElement('afterend', buttonContainer);
        //   <table id="myTable" class="display" style="width:100%"></table>
        // table = document.createElement('table');
        // table.id = 'WQScope_table';
        // table.className = 'display';
        // table.style.width = '100%';
        // // Append the table to the button container
        // targetElement.insertAdjacentElement('afterend', table);


    }

}



function getUserId(node) {
    // 根据鼠标悬停的元素获取用户 ID

    // 检查 node 是否自身就是目标元素
    if (node.classList.contains('genius__container') || node.classList.contains('genius-main') || node.classList.contains('competition-consultant-leaderboard')) {
        return [node, null];
    }
    if (node.classList.contains('competitions_data_container--user')) {
        return [node, node.getAttribute('data-user-id') || node.textContent.trim() || null];
    }

    // 查找子元素中是否存在匹配的 div
    let userDiv = node.querySelector('div.competitions_data_container--user');

    // 如果找到了该节点，尝试获取用户 ID
    if (userDiv) {
        return [userDiv, userDiv.getAttribute('data-user-id') || userDiv.textContent.trim() || null];
    }
    // 未找到则返回 null
    return [node, null];
}
async function showGeniusCard(event) {
    // 显示用户的排名信息的卡片
    let [userHtml, userId] = getUserId(event.target);
    if (userId) {
        userId = userId.substring(0, 7);
        console.log(userHtml, userId);
        const { result, savedTimestamp } = await getSingleRankByUserId(userId);
        // result, savedTimestamp, rankInfo2Html(result)
        if (card.enable(userId)) {
            console.log('Card enabled');
            card.updateDataId(userId);
            card.updateCursor(event.clientX, event.clientY);
            card.updateTargetHtml(userHtml);
            cardTitle = `${userId} 排名信息`;
            cardContent = rankInfo2Html(result);
            // console.log(cardContent);
            card.updateData(cardTitle, cardContent);
        }
        return;
    }
    card.disable();
}



function watchForElementAndInsertButton() {


    // Use MutationObserver to watch for DOM changes
    var observer = new MutationObserver(() => {
        if (document.querySelector(targetSelectorButton) && !document.getElementById('WQButtonContainer')) {
            insertButton(); // Insert the button when the target element is available
            observer.disconnect();
        }
    });

    // Configure the MutationObserver
    observer.observe(document.body, { childList: true, subtree: true });
}


watchForElementAndInsertButton();
document.addEventListener("mouseover", showGeniusCard);
document.addEventListener("mousemove", (ev) => card.updateCursor(ev.pageX, ev.pageY));

