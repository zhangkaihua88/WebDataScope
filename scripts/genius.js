console.log('Genius script loaded');


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

async function getAlphaFromUrl(AlphaUrl) {
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
        data = await getAlphaFromUrl(AlphaUrl);
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
        chrome.storage.local.set({ WQPOPSAna: dataToSave }, function() {
            console.log('数据已保存');
            console.log(dataToSave);
        });
        insertOpsTable();
        resetButton('WQPOPSFetchButton', `分析完成${data.length}`);
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

// Define the target element's selector


// Function to insert the button
function insertButton() {
    const targetElement = document.querySelector(targetSelectorButton);
    console.log(targetElement);
    if (targetElement) {
        // Disconnect observer to avoid duplicate insertions
        console.log('Disconnecting observer');
        observer.disconnect();

        // Create a container div to hold both buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex'; // Flexbox to arrange buttons side by side
        buttonContainer.style.justifyContent = 'center'; // Center buttons horizontally
        buttonContainer.style.gap = '10px'; // Space between buttons
        
        // Append buttons to the container
        buttonContainer.appendChild(ButtonOpsAna());
        buttonContainer.appendChild(ButtonOpsShow());

        // Insert the button container after the target element
        targetElement.insertAdjacentElement('afterend', buttonContainer);
    }
    
}
function insertOpsTable() {
    chrome.storage.local.get('WQPOPSAna', function(result) {
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
                header.addEventListener('click', function() {
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