console.log('Genius script loaded');

// ############################## 运算符分析 ##############################
async function fetchAllOperators() {
    OptUrl = 'https://api.worldquantbrain.com/operators';
    data = {};
    try {
        const response = await fetch(OptUrl, {
            referrer: "https://platform.worldquantbrain.com/",
            referrerPolicy: "strict-origin-when-cross-origin",
            body: null,
            method: "GET",
            mode: "cors",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        data = await response.json();
    } catch (error) {
        console.error("Error fetching data:", error);
    }
    return data;
}

async function getDataFromUrl(AlphaUrl) {
    const response = await fetch(AlphaUrl, {
        referrer: "https://platform.worldquantbrain.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
        body: null,
        method: "GET",
        mode: "cors",
        credentials: "include"
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json(); // Parse JSON data
    return data
}

// Define fetchAllAlphas function
async function fetchAllAlphas() {
    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const quarter = Math.floor((currentDate.getMonth() + 3) / 3);
    const quarters = [
        { start: `${year}-01-01T00:00:00.000Z`, end: `${year}-03-31T23:59:59.000Z` },  // 第一季度
        { start: `${year}-04-01T00:00:00.000Z`, end: `${year}-06-30T23:59:59.000Z` },  // 第二季度
        { start: `${year}-07-01T00:00:00.000Z`, end: `${year}-09-30T23:59:59.000Z` },  // 第三季度
        { start: `${year}-10-01T00:00:00.000Z`, end: `${year}-12-31T23:59:59.000Z` }   // 第四季度
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
            totalCount = data.count; // Get count (on first request)
        }
        // If fetched results are greater than or equal to the total count, stop fetching
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


function removeComments(code) {
    const lines = code.split('\n');
    const cleanedLines = lines.map(line => line.split('#')[0].trim());
    return cleanedLines.join('\n');
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&');
}

function findSingleOps(text) {
    const singleOps = ['+', '-', '*', '/', '^', '<=', '>=', '<', '>', '==', '!=', '?'];
    let count = [];
    singleOps.sort((a, b) => b.length - a.length);  // Sort by operator length in descending order
    singleOps.forEach(op => {
        // Adjusting regex to avoid matching '+' and '-' when followed by a number
        let regex = new RegExp(`(?<!\\d)${escapeRegExp(op)}(?!\\d)`, 'g');
        let matches = [...text.matchAll(regex)];
        count = count.concat(Array(matches.length).fill(op));  // Add matched operator to the count
        text = text.replace(regex, ' ');  // Replace matched operators with spaces
    });
    return count;
}

const splitFunc = (item) => {
    return item.replace(' ', '').split(/[(),:+\-*/^<>=!?;\n#]+/).filter(part => part).map(item => item.replace(' ', ''));
};

function findOps(regular, operators) {
    regular = removeComments(regular);
    // console.log(splitFunc(regular));
    const ops = [
        ...splitFunc(regular).filter(item => operators.map(item => item.name).includes(item)),
        ...findSingleOps(regular)
    ];
    return ops;
}



// Create the button
function ButtonOpsAna() {
    const button = document.createElement('button');
    button.id = 'WQPOPSFetchButton';
    button.innerText = '运算符分析';
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

    // Button click event to fetch data
    button.addEventListener('click', async function () {
        const data = await fetchAllAlphas();
        operators = await fetchAllOperators();
        operators = operators.filter(item => item.scope.includes('REGULAR') || item.scope.includes('COMBO'));

        // regulars = data.map(item => item.regular.code);
        regulars = data.map(item => item.type === 'REGULAR' ? item.regular.code : item.combo.code);
        console.log(regulars);
        let use_ops = regulars.map(item => findOps(item, operators)).flat();;

        const operatorMapping = {
            '+': 'add',
            '-': 'subtract',
            '*': 'multiply',
            '/': 'divide',
            '^': 'power',
            '<=': 'less_than_equal',
            '>=': 'greater_than_equal',
            '<': 'less',
            '>': 'greater',
            '==': 'equal',
            '!=': 'not_equal',
            '?': 'if_else'
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
                scope: op.scope
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
    });
    return button
}

function ButtonOpsShow() {
    const button = document.createElement('button');
    button.innerText = '显示运算符分析';
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

    button.addEventListener('click', function () {
        insertOpsTable();
    });

    return button
}
function insertOpsTable() {
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
                <small class="genius__hint genius__hint--dark"><span>${savedTimestamp}</span></small>
            </div>

            <article class="card">
            <div class="card_wrapper">
            <div class="card__content" style="padding-bottom: 26px;">
                <h3>在你可用的运算符中，共有${nonZeroCount}种运算符被使用，${zeroCount}种运算符未被使用。</h3>
                
                
                <div class="operator-table">
                    <table id="operatorTable" class="sortable WQScope_table">
                        <thead>
                            <tr>
                                <th data-sort="category">Category</th>
                                <th data-sort="definition">Definition</th>
                                <th data-sort="count">Count</th>
                                <th data-sort="scope">Scope</th>
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
            const mainContent = document.querySelector(targetSelectorTable);
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

async function getSingleRankByUserId(userId) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get('WQPRankData', function (WQPRankData) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            const data = WQPRankData.WQPRankData?.array || [];
            const savedTimestamp = WQPRankData.WQPRankData?.timestamp || 'N/A';
            const userData = data.find(item => item.user === userId);

            if (!userData) {
                reject(`User with ID ${userId} not found.`);
                return;
            }

            console.log(userData);
            const criteria = {
                "expert": { "alphaCount": 20, "pyramidCount": 10, "combinedAlphaPerformance": 0.5, "combinedSelectedAlphaPerformance": 0.5 },
                "master": { "alphaCount": 120, "pyramidCount": 30, "combinedAlphaPerformance": 1, "combinedSelectedAlphaPerformance": 1 },
                "grandmaster": { "alphaCount": 220, "pyramidCount": 60, "combinedAlphaPerformance": 2, "combinedSelectedAlphaPerformance": 2 }
            }
            const result = {};
            // filter以item.name Rank结尾的
            result['gold'] = Object.fromEntries(Object.entries(userData).filter(([key, value]) => key.endsWith('Rank')));
            result['gold']['rank'] = data.filter(item => item.totalRank < userData.totalRank).length;
            result['gold']['count'] = data.length;
            result['gold']['baseCount'] = data.filter(item => item.alphaCount >= 40).length;

            for (const model of ["expert", "master", "grandmaster"]) {
                let itemData = data.filter(item => item.alphaCount >= criteria[model].alphaCount && item.pyramidCount >= criteria[model].pyramidCount);
                if (combineTag) {
                    itemData = itemData.filter(item => item.combinedAlphaPerformance >= criteria[model].combinedAlphaPerformance || item.combinedSelectedAlphaPerformance >= criteria[model].combinedSelectedAlphaPerformance);
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

            resolve({ result, savedTimestamp });
        });
    });
}

function rankInfo2Html(result){
    return `
    <p>
    <strong>总人数:</strong> ${result.gold.count} 人<br>
    <strong>可能的基准人数:</strong> ${result.gold.baseCount} 人（交够40个）
    </p>

    <hr>

    <h4 style="margin-top: 10px;">以 Gold 为 Universe 计算的结果：</h4>
    <p>
    <strong>总排名 (排名 / 满足的人数 / 最终的人数):</strong><br>
    <ul>
        <li>For Expert: ${result.gold.expertRank} / ${result.expert.count} / ${Math.round(result.gold.baseCount * 0.2)}</li>
        <li>For Master: ${result.gold.masterRank} / ${result.master.count} / ${Math.round(result.gold.baseCount * 0.1)}</li>
        <li>For Grandmaster: ${result.gold.grandmasterRank} / ${result.grandmaster.count} / ${Math.round(result.gold.baseCount * 0.02)}</li> 
    </ul>
    </p>

    <h4 style="margin-top: 10px;">各项排名：</h4>
    <ul>
    <li>Operator Count: ${result.gold.operatorCountRank} 名</li>
    <li>Operator Avg: ${result.gold.operatorAvgRank} 名</li>
    <li>Field Count: ${result.gold.fieldCountRank} 名</li>
    <li>Field Avg: ${result.gold.fieldAvgRank} 名</li>
    <li>Community Activity: ${result.gold.communityActivityRank} 名</li>
    <li>Completed Referrals: ${result.gold.completedReferralsRank} 名</li>
    <li>Max Simulation Streak: ${result.gold.maxSimulationStreakRank} 名</li>
    <li>Total Rank: ${result.gold.totalRank} 名</li>
    </ul>

    <hr>

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
        <p><strong>总排名:</strong> ${result.master.rank} / ${Math.round(result.gold.baseCount * 0.1)}</p>
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


const combineTag = true;

async function insertMyRankInfo() {
    let userId = await getDataFromUrl('https://api.worldquantbrain.com/users/self/consultant/summary');
    userId = userId.leaderboard.user;
    const { result, savedTimestamp } = await getSingleRankByUserId(userId);
    console.log('Data:', result);
    let tableHTML = `
        <div id='rankCard'>
        <div class="research-paradigm__header">
            <h2 class="genius__subtitle">Genius Rank Analysis</h2>
            <small class="genius__hint genius__hint--dark"><span>${savedTimestamp}</span></small>
        </div>

        <article class="card" style="flex-direction: column-reverse;">
        <div class="card_wrapper">
        <div class="card__content" style="padding-bottom: 26px;max-width: 100%">
        <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 10px;">我的排名信息</h3>
        <small class="genius__hint genius__hint--dark">
            <span>${savedTimestamp}</span>
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
    } else {
        console.error('未找到mainContent元素');
    }

}



async function fetchAllUsers() {
    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const quarter = Math.floor((currentDate.getMonth() + 3) / 3);
    const quarters = [
        `${year}-01-01`, // 第一季度
        `${year}-04-01`, // 第二季度
        `${year}-07-01`, // 第三季度
        `${year}-10-01`  // 第四季度
    ];
    const season = quarters[quarter - 1];


    let data = [];
    let offset = 0; // Initial offset
    const limit = 100; // Data limit per page
    let totalCount = 0; // To store total count

    while (true) {
        const UserUrl = `https://api.worldquantbrain.com/consultant/boards/genius?limit=${limit}&offset=${offset}&date=${season}&aggregate=user`;

        itemData = await getDataFromUrl(UserUrl);
        data = data.concat(itemData.results); // Merge results
        if (totalCount === 0) {
            totalCount = itemData.count; // Get count (on first request)
        }
        // If fetched results are greater than or equal to the total count, stop fetching
        if (data.length >= totalCount) {
            break;
        }
        offset += limit; // Increase offset for the next page
        updateButton('WQPRankFetchButton', `正在抓取 ${data.length} / ${totalCount}`); // Update button text
    }
    updateButton('WQPRankFetchButton', `正在分析`);



    data.forEach(item => item['totalRank'] = 0);
    for (const col of ["operatorCount", "fieldCount", "communityActivity", "completedReferrals", "maxSimulationStreak"]) {
        let sorted = data.map(item => item[col]).sort((a, b) => b - a);
        data.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
        data.forEach(item => item['totalRank'] = item['totalRank'] + item[col + 'Rank']);
    }
    for (const col of ["operatorAvg", "fieldAvg"]) {
        let sorted = data.map(item => item[col]).sort((a, b) => a - b);
        data.forEach(item => item[col + 'Rank'] = sorted.indexOf(item[col]) + 1);
        data.forEach(item => item['totalRank'] = item['totalRank'] + item[col + 'Rank']);
    }

    // Check if the length matches the total count
    const count = data.length;
    console.log(`Fetched ${count} results, expected ${totalCount}`);

    if (count === totalCount) {
        console.log("All results fetched successfully!");
    } else {
        console.log("There seems to be a mismatch in the count!");
    }

    return data;
}



function ButtonRankShow() {
    const button = document.createElement('button');
    button.id = 'WQPRankFetchButton';
    button.innerText = '显示排名分析';
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

    button.addEventListener('click', async function () {
        insertMyRankInfo();
    });

    return button
}



function ButtonRankAna() {
    const button = document.createElement('button');
    button.id = 'WQPRankFetchButton';
    button.innerText = '排名分析';
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

    button.addEventListener('click', async function () {
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
    });

    return button
}
// Define the target element's selector



// ############################## 插入按钮 ##############################

function insertButton() {
    const targetElement = document.querySelector(targetSelectorButton);
    console.log(targetElement);
    if (targetElement) {
        // Disconnect observer to avoid duplicate insertions
        console.log('Disconnecting observer');
        observer.disconnect();

        // Create a container div to hold both buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'WQButtonContainer';
        buttonContainer.style.display = 'flex'; // Flexbox to arrange buttons side by side
        buttonContainer.style.justifyContent = 'center'; // Center buttons horizontally
        buttonContainer.style.gap = '10px'; // Space between buttons

        // Append buttons to the container
        buttonContainer.appendChild(ButtonOpsAna());
        buttonContainer.appendChild(ButtonOpsShow());
        buttonContainer.appendChild(ButtonRankAna());
        buttonContainer.appendChild(ButtonRankShow());

        // Insert the button container after the target element
        targetElement.insertAdjacentElement('afterend', buttonContainer);
    }

}

let targetSelectorTable = '.genius__main-content';
const targetSelectorButton = '#root > div > div.genius__container > div > div > div.genius__header';

// Use MutationObserver to watch for DOM changes
const observer = new MutationObserver(() => {
    if (document.querySelector(targetSelectorButton)) {
        insertButton(); // Insert the button when the target element is available
    }
});

// Configure the MutationObserver
observer.observe(document.body, { childList: true, subtree: true });




function getUserId(node) {
    // 检查 node 是否自身就是目标元素
    if (node.classList.contains('competitions_data_container--user')) {
        return node.getAttribute('data-user-id') || node.textContent.trim() || null;
    }

    // 查找子元素中是否存在匹配的 div
    let userDiv = node.querySelector('div.competitions_data_container--user');

    // 如果找到了该节点，尝试获取用户 ID
    if (userDiv) {
        return userDiv.getAttribute('data-user-id') || userDiv.textContent.trim() || null;
    }

    // 未找到则返回 null
    return null;
}



document.addEventListener("mouseover", showGeniusProfile);
document.addEventListener("mousemove", (ev) => geniusRankProfileCard.updateCursor(ev.pageX, ev.pageY));

async function showGeniusProfile(event) {
    let userId = getUserId(event.target);
    if (!userId) {
        geniusRankProfileCard.hide();
    }
    userId = userId.substring(0, 7);
    const { result, savedTimestamp } = await getSingleRankByUserId(userId);
    if (geniusRankProfileCard.enable(userId)) {
        geniusRankProfileCard.updateDataId(userId, result, savedTimestamp, rankInfo2Html(result));
        geniusRankProfileCard.updateCursor(event.clientX, event.clientY);
        geniusRankProfileCard.updateData();

    } e
}