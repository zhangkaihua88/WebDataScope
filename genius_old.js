// genius.js: genius相关功能的 JS 文件
console.log('genius.js loaded');



// ############################## 常数变量 ##############################
// operator API URL
const OptUrl = 'https://api.worldquantbrain.com/operators';
// genius level criteria
const levelCriteria = {
    "expert": { "alphaCount": 20, "pyramidCount": 10, "combinedAlphaPerformance": 0.5, "combinedSelectedAlphaPerformance": 0.5, "combinedPowerPoolAlphaPerformance": 0.5 },
    "master": { "alphaCount": 120, "pyramidCount": 30, "combinedAlphaPerformance": 1, "combinedSelectedAlphaPerformance": 1, "combinedPowerPoolAlphaPerformance": 1 },
    "grandmaster": { "alphaCount": 220, "pyramidCount": 60, "combinedAlphaPerformance": 2, "combinedSelectedAlphaPerformance": 2, "combinedPowerPoolAlphaPerformance": 2 }
}



const targetSelectorButton = '#root > div > div.genius__container > div > div > div.genius__header';


// ############################## 运算符分析 ##############################

async function fetchAllAlphas() {
    // 抓取本季度所有的alpha

    setButtonState('WQPOPSFetchButton', `开始抓取...`,'load');

    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const quarter = Math.floor((currentDate.getMonth() + 3) / 3);
    const quarters = [
        { start: `${year}-01-01T05:00:00.000Z`, end: `${year}-04-01T04:00:00.000Z` },  // 第一季度
        { start: `${year}-04-01T04:00:00.000Z`, end: `${year}-07-01T04:00:00.000Z` },  // 第二季度
        { start: `${year}-07-01T04:00:00.000Z`, end: `${year}-10-01T04:00:00.000Z` },  // 第三季度
        { start: `${year}-10-01T04:00:00.000Z`, end: `${year}-01-01T05:00:00.000Z` }   // 第四季度
    ];
    const { start, end } = quarters[quarter - 1];
    const dateRange = `dateSubmitted%3E${start}&dateSubmitted%3C${end}`;

    const limit = 30; // Data limit per page
    const formatUrl = `https://api.worldquantbrain.com/users/self/alphas?limit={limit}&offset={offset}&status!=UNSUBMITTED%1FIS-FAIL&${dateRange}&order=-dateCreated&hidden=false`
    let data = await getDataFromUrlWithOffsetParallel(formatUrl, limit, 'WQPOPSFetchButton')
    return data;
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
    setButtonState('WQPOPSFetchButton', `运算符分析完成${data.length}`, 'enable');
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
            let tableHTML = generateOperatorTable(savedTimestamp, nonZeroCount, zeroCount, savedArray);

            // 查找目标插入位置
            const mainContent = document.querySelector('.genius__main-content');

                if (mainContent) {
                    // 删除旧的表格容器（假设整体容器有唯一类名或ID）
                    const oldWrapper = mainContent.querySelector('#operatorTable');
                    if (oldWrapper) {
                        oldWrapper.remove();
                    }

                    // 插入到 mainContent 的末尾
                    mainContent.insertAdjacentHTML('beforeend', tableHTML);
                } else {
                    console.error('未找到 mainContent 元素');
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
// 工具函數,提供inertOpsTable使用
function generateOperatorTable(savedTimestamp, nonZeroCount, zeroCount, savedArray) {
    const [usTime, cnTime] = formatSavedTimestamp(savedTimestamp);

    const rowsHTML = savedArray.map((item, index) => `
                        <tr class="${index % 2 ? 'odd-row' : ''}">
                            <td>${item.category}</td>
                            <td>${item.definition}</td>
                            <td>${item.count}</td>
                            <td>${item.scope}</td>
                            <td>${item.level}</td>
                        </tr>
                    `).join('');

    return `
                    <div class="research-paradigm__header">
                        <h2 class="genius__subtitle">Operator Analysis</h2>
                        <small class="genius__hint genius__hint--dark">
                            <span>美东时间: ${usTime}</span>
                            <span>北京时间: ${cnTime}</span>
                        </small>
                    </div>
                    
                    <article class="card">
                        <div class="card_wrapper">
                            <div class="card__content" style="padding-bottom: 26px;">
                                <h3>在你可用的运算符中，共有${nonZeroCount}种运算符被使用，${zeroCount}种运算符未被使用。</h3>
                                <p>'-'有两种含义分别是substract和revers, 此处统一为substrac
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
                                            ${rowsHTML}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </article>
                `;
}



// ############################## 排名分析 ##############################



function determineUserLevel(userData, geniusCombineTag, ignoreCombine = false) {
    // 根据用户数据判断用户级别
    const currentLevelCriteria = customLevelCriteria || levelCriteria;

    for (const level of ["grandmaster", "master", "expert"]) {
        const criteria = currentLevelCriteria[level];

        // 检查 alphaCount 和 pyramidCount 是否满足条件
        const isBaseConditionMet = (
            userData.alphaCount >= criteria.alphaCount &&
            userData.pyramidCount >= criteria.pyramidCount
        );

        // 根据 geniusCombineTag 和 ignoreCombine 决定是否检查 combinedAlphaPerformance
        let isPerformanceConditionMet = true;
        if (!ignoreCombine) { // Only check combine metrics if not ignoring
            if (geniusCombineTag) {
                // 如果 geniusCombineTag 为 true，需要同时满足 combinedAlphaPerformance 和 combinedSelectedAlphaPerformance
                isPerformanceConditionMet = (
                    userData.combinedAlphaPerformance >= criteria.combinedAlphaPerformance ||
                    userData.combinedSelectedAlphaPerformance >= criteria.combinedSelectedAlphaPerformance ||
                    userData.combinedPowerPoolAlphaPerformance >= criteria.combinedPowerPoolAlphaPerformance
                );
            }
        }

        // 如果所有条件都满足，则返回当前级别
        if (isBaseConditionMet && isPerformanceConditionMet) {
            return level;
        }
    }
    return 'gold';
}

async function getAllRank(ignoreCombine = false) {
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
            const currentLevelCriteria = customLevelCriteria || levelCriteria;

            data.forEach(item => item['finalLevel'] = 'gold');
            data = data.filter(item => item.alphaCount > 0);

            for (const model of ["gold", "expert", "master", "grandmaster"]) {
                if (model === 'gold') {
                    itemData = data.map((item, index) => ({ ...item, originalIndex: index }));
                } else {
                    itemData = data.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.alphaCount >= currentLevelCriteria[model].alphaCount && item.pyramidCount >= currentLevelCriteria[model].pyramidCount);
                    if (!ignoreCombine) { // Only filter by combine metrics if not ignoring
                        if (WQPSettings.geniusCombineTag) {
                            itemData = itemData.filter(item => item.combinedAlphaPerformance >= currentLevelCriteria[model].combinedAlphaPerformance || item.combinedSelectedAlphaPerformance >= currentLevelCriteria[model].combinedSelectedAlphaPerformance || item.combinedPowerPoolAlphaPerformance >= currentLevelCriteria[model].combinedPowerPoolAlphaPerformance);
                        }
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

            const filteredBaseCountData = data.filter(item => item.alphaCount >= WQPSettings.geniusAlphaCount);
            baseCount = filteredBaseCountData.length;

            let expertCandidates = filteredBaseCountData.filter(item => determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'expert' || determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'master' || determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'grandmaster');
            let masterCandidates = filteredBaseCountData.filter(item => determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'master' || determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'grandmaster');
            let grandmasterCandidates = filteredBaseCountData.filter(item => determineUserLevel(item, WQPSettings.geniusCombineTag, ignoreCombine) === 'grandmaster');


            expertCount = Math.round(baseCount * 0.2);
            masterCount = Math.round(baseCount * 0.08);
            grandmasterCount = Math.round(baseCount * 0.02);

            // Sort candidates by their respective total ranks and assign final level
            expertCandidates.sort((a, b) => a.expertTotalRank - b.expertTotalRank);
            masterCandidates.sort((a, b) => a.masterTotalRank - b.masterTotalRank);
            grandmasterCandidates.sort((a, b) => a.grandmasterTotalRank - b.grandmasterTotalRank);

            // Assign final levels based on counts and sorted candidates
            expertCandidates.slice(0, expertCount).forEach(item => { item.finalLevel = 'expert'; });
            masterCandidates.slice(0, masterCount).forEach(item => { item.finalLevel = 'master'; });
            grandmasterCandidates.slice(0, grandmasterCount).forEach(item => { item.finalLevel = 'grandmaster'; });

            // Ensure unique levels for each user based on highest achieved level
            data.forEach(user => {
                if (grandmasterCandidates.includes(user) && user.finalLevel === 'grandmaster') {
                    user.finalLevel = 'grandmaster';
                } else if (masterCandidates.includes(user) && user.finalLevel === 'master') {
                    user.finalLevel = 'master';
                } else if (expertCandidates.includes(user) && user.finalLevel === 'expert') {
                    user.finalLevel = 'expert';
                } else {
                    user.finalLevel = 'gold'; // Default to gold if no higher level achieved
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
            <small class="genius__hint genius__hint--dark">
                <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
            </small>
        </div>

        <article class="card" style="flex-direction: column-reverse;">
        <div class="card_wrapper">
        <div class="card__content" style="padding-bottom: 26px;max-width: 100%">
        <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">排名信息</h3>
        <small class="genius__hint genius__hint--dark">
            <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
            <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
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
        const existingTable = mainContent.querySelector("#rankListCard");
        if (existingTable) {
            existingTable.remove();
        }
        mainContent.insertAdjacentHTML('afterend', tableHTML);

        data.forEach((item, idx) => {
            item.index = idx + 1;
        });
        grandmasterCount = data.filter(item => item.finalLevel === 'grandmaster').length;

        let columns = [
            { title: '排名', data: 'index', type: 'num', render: function (data, type) { return `<span style="cursor:pointer;margin-right: 8px;">&#9654;</span>` + data; }, className: 'details-control', },
            { title: '用户ID', data: 'user' },
            { title: '达成等级', data: 'achievedLevel' },
            { title: '最终等级', data: 'finalLevel' },
            { title: '国家/地区', data: 'country', render: function (data, type) { return `<i title="${data}" class="${data.toLowerCase()} flag"></i>` + data; } },
            { title: 'Signals', data: 'alphaCount', visible: false },
            { title: 'Pyramids', data: 'pyramidCount', visible: false },
            { title: 'Combined Alpha Performance', data: 'combinedAlphaPerformance', visible: false },
            { title: 'Combined Selected Alpha Performance', data: 'combinedSelectedAlphaPerformance', visible: false },
            { title: 'Combined Power Pool Alpha Performance', data: 'combinedPowerPoolAlphaPerformance', visible: false },

            { title: 'RA Count', data: 'submissionsCount', visible: false },
            { title: 'RA Fields Used', data: 'dataFieldsUsed', visible: false },
            { title: 'RA Prod Corr', data: 'meanProdCorrelation', visible: false },
            { title: 'RA Self Corr', data: 'meanSelfCorrelation', visible: false },
            { title: 'SA Count', data: 'superAlphaSubmissionsCount', visible: false },
            { title: 'SA Prod Corr', data: 'superAlphaMeanProdCorrelation', visible: false },
            { title: 'SA Self Corr', data: 'superAlphaMeanSelfCorrelation', visible: false },
            { title: 'University', data: 'university', visible: false },
            { title: 'Value Factor', data: 'valueFactor', visible: false },
            { title: 'Weight Factor', data: 'weightFactor', visible: false },

            { title: 'Operators used', data: 'operatorCount', visible: false },
            { title: 'Operator Avg', data: 'operatorAvg', visible: false },
            { title: 'Fields used', data: 'fieldCount', visible: false },
            { title: 'Field Avg', data: 'fieldAvg', visible: false },
            { title: 'Community Activity', data: 'communityActivity', visible: false },
            { title: 'Max Simulation Streak', data: 'maxSimulationStreak', visible: false },

            { title: 'Gold Total Rank', data: 'goldTotalRank', visible: false },
            { title: 'Gold Operator Count Rank', data: 'goldoperatorCountRank', visible: false },
            { title: 'Gold Operator Avg Rank', data: 'goldoperatorAvgRank', visible: false },
            { title: 'Gold Field Count Rank', data: 'goldfieldCountRank', visible: false },
            { title: 'Gold Field Avg Rank', data: 'goldfieldAvgRank', visible: false },
            { title: 'Gold Community Activity Rank', data: 'goldcommunityActivityRank', visible: false },
            { title: 'Gold Max Simulation Streak Rank', data: 'goldmaxSimulationStreakRank', visible: false },


            { title: 'Expert Total Rank', data: 'expertTotalRank', visible: false },
            { title: 'Expert Operator Count Rank', data: 'expertoperatorCountRank', visible: false },
            { title: 'Expert Operator Avg Rank', data: 'expertoperatorAvgRank', visible: false },
            { title: 'Expert Field Count Rank', data: 'expertfieldCountRank', visible: false },
            { title: 'Expert Field Avg Rank', data: 'expertfieldAvgRank', visible: false },
            { title: 'Expert Community Activity Rank', data: 'expertcommunityActivityRank', visible: false },
            { title: 'Expert Max Simulation Streak Rank', data: 'expertmaxSimulationStreakRank', visible: false },

            { title: 'Master Total Rank', data: 'masterTotalRank', visible: false },
            { title: 'Master Operator Count Rank', data: 'masteroperatorCountRank', visible: false },
            { title: 'Master Operator Avg Rank', data: 'masteroperatorAvgRank', visible: false },
            { title: 'Master Field Count Rank', data: 'masterfieldCountRank', visible: false },
            { title: 'Master Field Avg Rank', data: 'masterfieldAvgRank', visible: false },
            { title: 'Master Community Activity Rank', data: 'mastercommunityActivityRank', visible: false },
            { title: 'Master Max Simulation Streak Rank', data: 'mastermaxSimulationStreakRank', visible: false },

            { title: 'Grandmaster Total Rank', data: 'grandmasterTotalRank', visible: false },
            { title: 'Grandmaster Operator Count Rank', data: 'grandmasteroperatorCountRank', visible: false },
            { title: 'Grandmaster Operator Avg Rank', data: 'grandmasteroperatorAvg Rank', visible: false },
            { title: 'Grandmaster Field Count Rank', data: 'grandmasterfieldCountRank', visible: false },
            { title: 'Grandmaster Field Avg Rank', data: 'grandmasterfieldAvgRank', visible: false },
            { title: 'Grandmaster Community Activity Rank', data: 'grandmastercommunityActivityRank', visible: false },
            { title: 'Grandmaster Max Simulation Streak Rank', data: 'grandmastermaxSimulationStreakRank', visible: false },
        ];


        const minEl = document.querySelector('#min');
        const maxEl = document.querySelector('#max');



        const table = new DataTable('#WQScope_RankListTable', {
            lengthMenu: [10, 25, 50, grandmasterCount],
            data: data,
            columns,
            columnDefs: [
                { targets: 0, type: 'num' },
                { targets: 3, orderDataType: 'level-order' },
                { targets: 2, orderDataType: 'level-order' },
                { targets: [2, 3, 4], columnControl: ['order', ['searchList']] }
            ],
            scrollX: true,
            responsive: false,
            stateSave: true,
            layout: {
                topStart: ['pageLength'],
                topEnd: ['search', 'buttons'],
                bottomStart: 'info',
                bottomEnd: 'paging'
            },
            buttons: [
                {
                    text: '下载原始JSON',
                    action: function (e, dt, button, config) {
                        DataTable.fileSave(new Blob([JSON.stringify(data)]), 'Export.json');
                    }
                },
                {
                    extend: 'colvis',
                    text: '显示/隐藏列',
                    className: 'buttons-colvis',
                    columns: ':gt(2)'
                }
            ],
            columnControl: [
                {
                    target: 0,
                    content: ['orderStatus',]
                },
                {
                    target: 1,
                    content: ['search']
                }
            ],
        });

        function renderRowDetail(rowData, columnsArr) {

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

            var baseFields = [
                'Signals', 'Pyramids', 'Combined Alpha Performance', 'Combined Selected Alpha Performance', 'Combined Power Pool Alpha Performance'
            ];
            var sixFields = [
                'Operators used', 'Operator Avg', 'Fields used', 'Field Avg', 'Community Activity', 'Max Simulation Streak'
            ];
            var consultantFields = [
                'RA Count', 'RA Prod Corr', 'RA Self Corr', 'SA Count', 'SA Prod Corr', 'SA Self Corr', 'University', 'Value Factor', 'Weight Factor',
            ]
            let html = '';
            let base = getFields(baseFields);
            let six = getFields(sixFields);
            let consultantInfo = getFields(consultantFields);
            if (base.length) {
                html += '<div style="margin:12px 0 8px 0;"><b>Consultant 基本信息</b></div>';
                html += '<div style="display: flex; flex-direction: column;">' + toRows(consultantInfo, 3) + '</div>';
            }
            if (base.length) {
                html += '<div style="margin:12px 0 8px 0;"><b>基础信息</b></div>';
                html += '<div style="display: flex; flex-direction: column;">' + toRows(base, 2) + '</div>';
            }
            if (six.length) {
                html += '<div style="margin:12px 0 8px 0;"><b>六维</b></div>';
                html += '<div style="display: flex; flex-direction: column;">' + toRows(six, 3) + '</div>';
            }
            for (const model of ["gold", "expert", "master", "grandmaster"]) {
                var modelFields = columnsArr.filter(function (col) {
                    return col.title && col.title.toLowerCase().startsWith(model);
                });
                if (rowData[model + "TotalRank"] === null) continue;
                if (modelFields.length) {
                    html += `<div style="margin:12px 0 8px 0;"><b>${model.charAt(0).toUpperCase() + model.slice(1)} 排名总和: ${rowData[model + "TotalRank"]}</b></div>`;
                    modelFields = modelFields.filter(function (col) {
                        return !col.title.toLowerCase().includes('total');
                    });
                    html += '<div style="display: flex; flex-direction: column;">' + toRows(modelFields.map(col => ({ title: col.title, value: rowData[col.data] })), 3) + '</div>';
                }
            }
            return html || false;
        }

        $('#WQScope_RankListTable tbody').on('click', 'td.details-control', function () {
            var tr = $(this).closest('tr');
            var row = table.row(tr);
            if (row.child.isShown()) {
                row.child.hide();
                tr.removeClass('shown');
                $(this).find('span').text('▶');
            } else {
                var rowData = row.data();
                var columnsArr = table.settings().init().columns;
                var html = renderRowDetail(rowData, columnsArr);
                row.child(html).show();
                tr.addClass('shown');
                $(this).find('span').text('▼');
            }
        });

        table.search.fixed('range', function (searchStr, data, index) {
            console.log(data)
            var min = parseFloat(minEl.value);
            var max = parseFloat(maxEl.value);
            var age = parseFloat(data['index']);
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
        minEl.addEventListener('input', function () {
            table.draw();
        });
        maxEl.addEventListener('input', function () {
            table.draw();
        });


        $.fn.dataTable.ext.order['level-order'] = function (settings, col) {
            const levelOrder = { grandmaster: 1, master: 2, expert: 3, gold: 4 };
            return this.api().column(col, { order: 'index' }).data().map(function (level) {
                return levelOrder[level] || 99;
            });
        };
    } else {
        console.error('未找到mainContent元素');
    }
}

async function getSingleRankByUserId(userId, ignoreCombine = false) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['WQPRankData', 'WQPSettings'], function ({ WQPRankData, WQPSettings }) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            const data = WQPRankData?.array || [];
            const savedTimestamp = WQPRankData?.timestamp || 'N/A';

            calculateRanks(data, userId, WQPSettings, ignoreCombine)
                .then(result => resolve({ result, savedTimestamp }))
                .catch(reject);
        });
    });
}

async function calculateRanks(data, userId, WQPSettings, ignoreCombine = false) {
    const userData = data.find(item => item.user === userId);

    if (!userData) {
        return Promise.reject(`User with ID ${userId} not found.`);
    }

    const result = {};
    result['userData'] = userData;
    result['info'] = {
        "currentLevel": determineUserLevel(userData, WQPSettings.geniusCombineTag, ignoreCombine),
        "baseAlphaCount": WQPSettings.geniusAlphaCount,
    };
    result['gold'] = Object.fromEntries(Object.entries(userData).filter(([key, value]) => key.endsWith('Rank')));
    result['gold']['rank'] = data.filter(item => item.totalRank < userData.totalRank).length;
    result['gold']['count'] = data.length;
    result['gold']['baseCount'] = data.filter(item => item.alphaCount >= WQPSettings.geniusAlphaCount).length;
    const currentLevelCriteria = customLevelCriteria || levelCriteria;

    for (const model of ["expert", "master", "grandmaster"]) {
        let itemData = data.filter(item => item.alphaCount >= currentLevelCriteria[model].alphaCount && item.pyramidCount >= currentLevelCriteria[model].pyramidCount);
        if (!ignoreCombine) {
            if (WQPSettings.geniusCombineTag) {
                itemData = itemData.filter(item => item.combinedAlphaPerformance >= currentLevelCriteria[model].combinedAlphaPerformance || item.combinedSelectedAlphaPerformance >= currentLevelCriteria[model].combinedSelectedAlphaPerformance || item.combinedPowerPoolAlphaPerformance >= currentLevelCriteria[model].combinedPowerPoolAlphaPerformance);
            }
        }
        result['gold'][model + 'Rank'] = itemData.filter(item => item.totalRank < userData.totalRank).length + 1;

        let item_count = itemData.length;

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

let customLevelCriteria = null; // 用于存储用户自定义的等级标准

function rankInfo2Html(result, ignoreCombineChecked = false) {
    const userData = result['userData'];
    const currentLevelCriteria = customLevelCriteria || levelCriteria;

    return `
    <p>
    <strong>总人数:</strong> ${result.gold.count} 人<br>
    <strong>可能的基准人数:</strong> ${result.gold.baseCount} 人（交够${result.info.baseAlphaCount}个）
    </p>

    <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
        <h4>自定义等级标准</h4>
        <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 10px;">
            <div style="flex: 1;">
                <h5>Expert</h5>
                <div>
                    <label>Alpha Count:</label>
                    <input type="number" id="customExpertAlphaCount" value="${currentLevelCriteria.expert.alphaCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Pyramid Count:</label>
                    <input type="number" id="customExpertPyramidCount" value="${currentLevelCriteria.expert.pyramidCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Combined Performance:</label>
                    <input type="number" step="0.1" id="customExpertCombinedPerformance" value="${currentLevelCriteria.expert.combinedAlphaPerformance}" style="width: 100%;">
                </div>
            </div>

            <div style="flex: 1;">
                <h5>Master</h5>
                <div>
                    <label>Alpha Count:</label>
                    <input type="number" id="customMasterAlphaCount" value="${currentLevelCriteria.master.alphaCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Master Pyramid Count:</label>
                    <input type="number" id="customMasterPyramidCount" value="${currentLevelCriteria.master.pyramidCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Master Combined Performance:</label>
                    <input type="number" step="0.1" id="customMasterCombinedPerformance" value="${currentLevelCriteria.master.combinedAlphaPerformance}" style="width: 100%;">
                </div>
            </div>

            <div style="flex: 1;">
                <h5>Grandmaster</h5>
                <div>
                    <label>Alpha Count:</label>
                    <input type="number" id="customGrandmasterAlphaCount" value="${currentLevelCriteria.grandmaster.alphaCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Grandmaster Pyramid Count:</label>
                    <input type="number" id="customGrandmasterPyramidCount" value="${currentLevelCriteria.grandmaster.pyramidCount}" style="width: 100%;">
                </div>
                <div>
                    <label>Grandmaster Combined Performance:</label>
                    <input type="number" step="0.1" id="customGrandmasterCombinedPerformance" value="${currentLevelCriteria.grandmaster.combinedAlphaPerformance}" style="width: 100%;">
                </div>
            </div>
        </div>
        <button id="applyCustomLevelCriteria" style="margin-top: 10px; padding: 5px 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">应用自定义标准</button>
        <button id="resetCustomLevelCriteria" style="margin-top: 10px; margin-left: 10px; padding: 5px 10px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">重置为默认标准</button>
    </div>

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

    <div style="margin-bottom: 10px;">
        <input type="checkbox" id="ignoreCombineCheckbox" ${ignoreCombineChecked ? 'checked' : ''}>
        <label for="ignoreCombineCheckbox">不按 combine 过滤</label>
    </div>

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
    `;
}

async function insertMyRankInfo() {
    console.log('insertMyRankInfo function called.');
    let userId = await getDataFromUrl('https://api.worldquantbrain.com/users/self/consultant/summary');
    userId = userId.leaderboard.user;
    const { result, savedTimestamp } = await getSingleRankByUserId(userId);
    let tableHTML = `
        <div id='rankCard'>
        <div class="research-paradigm__header">
            <h2 class="genius__subtitle">Genius Rank Analysis</h2>
            <small class="genius__hint genius__hint--dark">
                <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
            </small>
        </div>

        <article class="card" style="flex-direction: column-reverse;">
        <div class="card_wrapper">
        <div class="card__content" style="padding-bottom: 26px;max-width: 100%">
        <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
        <small class="genius__hint genius__hint--dark">
            <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
            <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
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
        const existingTable = mainContent.querySelector("#rankCard");
        if (existingTable) {
            existingTable.remove();
        }
        const progressContainer = mainContent.querySelector('#WQButtonContainer');
        progressContainer.insertAdjacentHTML('afterend', tableHTML);
        bindRankEditEvents(userId, savedTimestamp);
    } else {
        console.error('未找到mainContent元素');
    }
}


function bindRankEditEvents(userId, savedTimestamp) {
    const editButton = document.getElementById('editRankButton');
    const editForm = document.getElementById('editRankForm');
    const updateButton = document.getElementById('updateRankButton');
    const ignoreCombineCheckbox = document.getElementById('ignoreCombineCheckbox');
    const applyCustomLevelCriteriaButton = document.getElementById('applyCustomLevelCriteria');
    const resetCustomLevelCriteriaButton = document.getElementById('resetCustomLevelCriteria');


    if (editButton && editForm && updateButton && ignoreCombineCheckbox) {
        editButton.addEventListener('click', () => {
            editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
        });

        updateButton.addEventListener('click', async () => {
            console.log('Update Rank button clicked');
            const newData = {
                operatorCount: parseInt(document.getElementById('operatorCount').value) || 0,
                operatorAvg: parseFloat(document.getElementById('operatorAvg').value) || 0,
                fieldCount: parseInt(document.getElementById('fieldCount').value) || 0,
                fieldAvg: parseFloat(document.getElementById('fieldAvg').value) || 0,
                communityActivity: parseFloat(document.getElementById('communityActivity').value) || 0,
                maxSimulationStreak: parseInt(document.getElementById('maxSimulationStreak').value) || 0
            };
            console.debug('newData', newData);

            const updatedResult = await updateUserRankings(userId, newData, ignoreCombineCheckbox.checked);

            const rankCard = document.getElementById('rankCard');
            if (rankCard) {
                rankCard.querySelector('.card__content').innerHTML = `
                    <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
                    <small class="genius__hint genius__hint--dark">
                        <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                        <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
                    </small>
                    ${rankInfo2Html(updatedResult, ignoreCombineCheckbox.checked)}
                `;
                bindRankEditEvents(userId, savedTimestamp);
            }
        });

        ignoreCombineCheckbox.addEventListener('change', async () => {
            console.log('Ignore Combine checkbox changed');
            const { result, savedTimestamp } = await getSingleRankByUserId(userId, ignoreCombineCheckbox.checked);
            const rankCard = document.getElementById('rankCard');
            if (rankCard) {
                rankCard.querySelector('.card__content').innerHTML = `
                    <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
                    <small class="genius__hint genius__hint--dark">
                        <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                        <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
                    </small>
                    ${rankInfo2Html(result, ignoreCombineCheckbox.checked)}
                `;
                bindRankEditEvents(userId, savedTimestamp);
            }
        });
    }

    if (applyCustomLevelCriteriaButton) {
        console.log('Attaching event listener to applyCustomLevelCriteriaButton');
        applyCustomLevelCriteriaButton.addEventListener('click', async () => {
            console.log('Apply Custom Level Criteria button clicked');
            const newCustomCriteria = {
                "expert": {
                    "alphaCount": parseInt(document.getElementById('customExpertAlphaCount').value) || 0,
                    "pyramidCount": parseInt(document.getElementById('customExpertPyramidCount').value) || 0,
                    "combinedAlphaPerformance": parseFloat(document.getElementById('customExpertCombinedPerformance').value) || 0
                },
                "master": {
                    "alphaCount": parseInt(document.getElementById('customMasterAlphaCount').value) || 0,
                    "pyramidCount": parseInt(document.getElementById('customMasterPyramidCount').value) || 0,
                    "combinedAlphaPerformance": parseFloat(document.getElementById('customMasterCombinedPerformance').value) || 0
                },
                "grandmaster": {
                    "alphaCount": parseInt(document.getElementById('customGrandmasterAlphaCount').value) || 0,
                    "pyramidCount": parseInt(document.getElementById('customGrandmasterPyramidCount').value) || 0,
                    "combinedAlphaPerformance": parseFloat(document.getElementById('customGrandmasterCombinedPerformance').value) || 0
                }
            };

            let allMatchDefaults = true;
            for (const level of ["expert", "master", "grandmaster"]) {
                if (newCustomCriteria[level].alphaCount !== levelCriteria[level].alphaCount ||
                    newCustomCriteria[level].pyramidCount !== levelCriteria[level].pyramidCount ||
                    newCustomCriteria[level].combinedAlphaPerformance !== levelCriteria[level].combinedAlphaPerformance) {
                    allMatchDefaults = false;
                    break;
                }
            }

            if (allMatchDefaults) {
                customLevelCriteria = null;
            } else {
                customLevelCriteria = newCustomCriteria;
            }

            const { result, savedTimestamp } = await getSingleRankByUserId(userId, ignoreCombineCheckbox.checked);
            const rankCard = document.getElementById('rankCard');
            if (rankCard) {
                rankCard.querySelector('.card__content').innerHTML = `
                    <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
                    <small class="genius__hint genius__hint--dark">
                        <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                        <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
                    </small>
                    ${rankInfo2Html(result, ignoreCombineCheckbox.checked)}
                `;
                bindRankEditEvents(userId, savedTimestamp);
            }
        });
    } else {
        console.log('applyCustomLevelCriteriaButton not found');
    }

    if (resetCustomLevelCriteriaButton) {
        console.log('Attaching event listener to resetCustomLevelCriteriaButton');
        resetCustomLevelCriteriaButton.addEventListener('click', async () => {
            console.log('Reset Custom Level Criteria button clicked');
            customLevelCriteria = null;
            const { result, savedTimestamp } = await getSingleRankByUserId(userId, ignoreCombineCheckbox.checked);
            const rankCard = document.getElementById('rankCard');
            if (rankCard) {
                rankCard.querySelector('.card__content').innerHTML = `
                    <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
                    <small class="genius__hint genius__hint--dark">
                        <span>美东时间: ${formatSavedTimestamp(savedTimestamp)[0]}</span>
                        <span>北京时间: ${formatSavedTimestamp(savedTimestamp)[1]}</span>
                    </small>
                    ${rankInfo2Html(result, ignoreCombineCheckbox.checked)}
                `;
                bindRankEditEvents(userId, savedTimestamp);
            }
        });
    } else {
        console.log('resetCustomLevelCriteriaButton not found');
    }
}

async function updateUserRankings(userId, newData, ignoreCombine = false) {
    const { WQPRankData, WQPSettings } = await new Promise(resolve => {
        chrome.storage.local.get(['WQPRankData', 'WQPSettings'], resolve);
    });

    if (!WQPRankData || !WQPRankData.array) {
        throw new Error('No rank data available');
    }

    const userData = WQPRankData.array.find(item => item.user === userId);
    if (!userData) {
        throw new Error('User data not found');
    }

    Object.assign(userData, newData);

    return await calculateRanks(WQPRankData.array, userId, WQPSettings, ignoreCombine);
}

function getSeason() {
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
    setButtonState('WQPRankFetchButton', '开始抓取...', 'load');

    const season = getSeason();
    console.log(season, "season")

    const limit = 100;
    const formatUrl = `https://api.worldquantbrain.com/consultant/boards/genius?limit={limit}&offset={offset}&date=${season}&aggregate=user`;
    let data = await getDataFromUrlWithOffsetParallel(formatUrl, limit, 'WQPRankFetchButton')
    return data;
}

async function fetchConsultantLB(){
    setButtonState('WQPRankFetchButton', '开始深度抓取...', 'load');
    const limit = 100;
    const formatUrl = 'https://api.worldquantbrain.com/consultant/boards/leader?limit={limit}&offset={offset}&&aggregate=user';
    let data = await getDataFromUrlWithOffsetParallel(formatUrl, limit, 'WQPRankFetchButton');
    return data;
}

async function rankAna() {
    let data = await fetchAllUsers();
    let dataConsultantLB = await fetchConsultantLB();

    const consultantMap = new Map();
    
    for (const item of dataConsultantLB) {
        if (item.user !== undefined) {
        consultantMap.set(item.user, item);
        }
    }
    
    for (const item of data) {
        if (item.user !== undefined && consultantMap.has(item.user)) {
        const consultantItem = consultantMap.get(item.user);
        Object.assign(item, consultantItem);
        }
    }

    let currentTime = new Date().toISOString();
    let dataToSave = {
        array: data,
        timestamp: currentTime
    };
    chrome.storage.local.set({ WQPRankData: dataToSave }, function () {
        console.log('数据已保存');
        console.log(dataToSave);
    });
    setButtonState('WQPRankFetchButton', `排名分析完成`, 'disable');
    insertMyRankInfo();
}



async function setup(){
    authToken = await getAuth();
    setButtonState('WQPAuth', `配置完成${authToken}`, 'disable');
}


// ############################## 插入按钮 ##############################

function ButtonGen(buttonText, buttonId, buttonClickFunction) {
    const button = document.createElement('button');
    button.id = buttonId;
    button.innerText = buttonText;
    button.style.padding = '10px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.marginTop = '20px';
    button.style.marginBottom = '20px';
    button.style.display = 'block';
    button.style.marginLeft = 'auto';
    button.style.marginRight = 'auto';
    button.addEventListener('mouseover', function () {
        button.style.backgroundColor = '#45a049';
    });

    button.addEventListener('mouseout', function () {
        button.style.backgroundColor = '#4CAF50';
    });
    button.addEventListener('click', buttonClickFunction);
    return button
}

function insertButton() {
    console.log('insertButton function called.');
    const targetElement = document.querySelector(targetSelectorButton);
    console.log(targetElement);
    if (targetElement) {
        console.log('Disconnecting observer');


        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'WQButtonContainer';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '10px';

        buttonContainer.appendChild(ButtonGen('配置插件', 'WQPAuth', setup));
        buttonContainer.appendChild(ButtonGen('运算符分析', 'WQPOPSFetchButton', opsAna));
        buttonContainer.appendChild(ButtonGen('显示运算符分析', 'WQPOPSShowButton', insertOpsTable));
        buttonContainer.appendChild(ButtonGen('排名分析', 'WQPRankFetchButton', rankAna));
        buttonContainer.appendChild(ButtonGen('显示排名分析', 'WQPRankShowButton', insertMyRankInfo));
        buttonContainer.appendChild(ButtonGen('显示排名列表', 'WQPRankListShowButton', insertRankListInfo));

        targetElement.insertAdjacentElement('afterend', buttonContainer);
        
        insertMyRankInfo();

    }

}



function getUserId(node) {
    if (node.classList.contains('genius__container') || node.classList.contains('genius-main') || node.classList.contains('competition-consultant-leaderboard')) {
        return [node, null];
    }
    if (node.classList.contains('competitions_data_container--user')) {
        return [node, node.getAttribute('data-user-id') || node.textContent.trim() || null];
    }

    let userDiv = node.querySelector('div.competitions_data_container--user');

    if (userDiv) {
        return [userDiv, userDiv.getAttribute('data-user-id') || userDiv.textContent.trim() || null];
    }
    return [node, null];
}
async function showGeniusCard(event) {
    let [userHtml, userId] = getUserId(event.target);
    if (userId) {
        userId = userId.substring(0, 7);
        console.log(userHtml, userId);
        const { result, savedTimestamp } = await getSingleRankByUserId(userId);
        if (card.enable(userId)) {
            console.log('Card enabled');
            card.updateDataId(userId);
            card.updateCursor(event.clientX, event.clientY);
            card.updateTargetHtml(userHtml);
            cardTitle = `${userId} 排名信息`;
            cardContent = rankInfo2Html(result);
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
            insertButton();
            observer.disconnect();
        }
    });

    // Configure the MutationObserver
    observer.observe(document.body, { childList: true, subtree: true });
}


watchForElementAndInsertButton();
document.addEventListener("mouseover", showGeniusCard);
document.addEventListener("mousemove", (ev) => card.updateCursor(ev.pageX, ev.pageY));
