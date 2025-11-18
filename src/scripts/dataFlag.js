// dataFlag.js: 对已经分析过的数据集进行标记
console.log('dataFlag.js loaded');

const flagMapOtherUniverse = {};

function dataFlagFunc(dataSetList, dataInfo, url) {
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(() => {
        console.log(`${url}完成加载`)
        const delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const elements = document.querySelectorAll(".rt-tr-group");


        // 数据分析报告标记
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                if (a_element.href.includes("data-fields")) {
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


        // OS/IS数据标记
        let meanSharpe = NaN;
        try {
            const meanSharpeRaw = dataInfo?.[`${region}_${delay}`]?.['isos']?.['mean']?.['sharpe_ratio'];
            meanSharpe = (meanSharpeRaw !== undefined && meanSharpeRaw !== null) ? parseFloat(meanSharpeRaw) : NaN;
        } catch (_) { /* 忽略路径异常 */ }
        let endDate = dataInfo?.[`${region}_${delay}`]?.['sub_end_time']
        let osisTotalCount = dataInfo?.[`${region}_${delay}`]?.['isos']?.['total_count']

        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                if (a_element.href.includes("data-fields")) {
                    return;
                }
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                let item_data = undefined;
                try {
                    item_data = dataInfo?.[`${region}_${delay}`]?.['isos']?.['dataset']?.[lastPart];
                } catch (_) { /* 忽略路径异常 */ }

                const existingBadge = a_element.querySelector('.wq-isos-badge');
                if (existingBadge) existingBadge.remove();

                const srRaw = item_data?.sharpe_ratio;
                const sr = (srRaw !== undefined && srRaw !== null) ? parseFloat(srRaw) : NaN;
                const count = item_data?.count;

                // 颜色规则：sr < 0 为红；sr > meanSharpe 为绿；其他（>=0 且 <= 均值或无均值）为黄；缺失为灰
                let bgColor = '#9e9e9e';
                if (!Number.isNaN(sr)) {
                    if (sr < 0) {
                        bgColor = '#e53935';
                    } else if (!Number.isNaN(meanSharpe) && sr > meanSharpe) {
                        bgColor = '#2e7d32';
                    } else {
                        bgColor = '#f9a825';
                    }
                }

                // 仅当存在 item_data 时展示徽章（允许 sr 缺失但有 count 的情况）
                if (item_data) {
                    const badge = document.createElement('span');
                    badge.className = 'wq-isos-badge';
                    const countText = (count !== undefined && count !== null && count !== '') ? `(${count})` : '';
                    // 徽章内容：sharpe_ratio(count)
                    badge.textContent = (!Number.isNaN(sr)) ? `${sr.toFixed(2)}${countText}` : `--${countText}`;
                    badge.style.cssText = [
                        'display:inline-block',
                        'margin-left:6px',
                        'padding:0 6px',
                        'border-radius:6px',
                        `background-color:${bgColor}`,
                        'color:#fff',
                        'font-size:12px',
                        'font-weight:600',
                        'line-height:1.6',
                        'vertical-align:middle',
                        'cursor:help'
                    ].join(';');
                    // 悬浮提示：Sharpe、Count、Region_Delay 均值、数据集名称
                    const srText = (!Number.isNaN(sr)) ? sr.toFixed(4) : '--';
                    const meanText = (!Number.isNaN(meanSharpe)) ? meanSharpe.toFixed(4) : '--';
                    const cntText = (count !== undefined && count !== null && count !== '') ? `${count}` : '--';
                    const tooltip = `OS/IS Sharpe: ${srText}\nCount: ${cntText}\nMean OS/IS Sharpe(${region}_${delay}): ${meanText}\nTotal Count: ${osisTotalCount}\nDataset: ${lastPart}\n统计截至日期: ${endDate}`;
                    badge.title = tooltip;
                    badge.setAttribute('aria-label', tooltip);
                    a_element.appendChild(badge);
                }
            } catch (error) {
                console.error('捕获到错误:', error);
            }
        });


        // neutralization 标记
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                if (a_element.href.includes("data-fields")) {
                    return;
                }
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                let item_data = dataInfo?.[`${region}_${delay}`]?.['neutralization']?.['dataset']?.[lastPart];
                let item_res = processNeutralizationData(item_data);

                console.log("neutralization data", lastPart, item_data);

                const existingBadge = a_element.querySelector('.wq-neut-badge');
                if (existingBadge) existingBadge.remove();

                const srRaw = item_data?.sharpe_ratio;
                const sr = (srRaw !== undefined && srRaw !== null) ? parseFloat(srRaw) : NaN;
                const count = item_data?.count;


                // 仅当存在 item_data 时展示徽章（允许 sr 缺失但有 count 的情况）
                if (item_data) {
                    const badge = document.createElement('span');
                    badge.className = 'wq-neut-badge';
                    badge.textContent = `${item_res.maxItem.key.toLowerCase()}(${item_res.maxPercentage}%)`;
                    badge.style.cssText = [
                        'display:inline-block',
                        'margin-left:6px',
                        'padding:0 6px',
                        'border-radius:6px',
                        `background-color:#9e9e9e`,
                        'color:#fff',
                        'font-size:12px',
                        'font-weight:600',
                        'line-height:1.6',
                        'vertical-align:middle',
                        'cursor:pointer'
                    ].join(';');

                    // 创建表格内容
                    const maxPercentage = Math.max(...Object.values(item_res.entries).map(entry => parseFloat(entry.percentage)));
                    const maxSharpeRatio = Math.max(
                        ...Object.entries(item_data)
                            .map(([key, value]) => parseFloat(value?.sharpe_ratio))
                            .filter(val => !isNaN(val) && val !== null)
                    );


                    const tableRows = Object.entries(item_res.entries)
                        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // 按照 Neutralization 列字母排序
                        .map(([key, value], index) => {
                            const sharpeRatio = item_data[key]?.sharpe_ratio !== undefined ? parseFloat(item_data[key]?.sharpe_ratio).toFixed(2) : '--';
                            const isosCount = item_data[key]?.osis_count !== undefined ? item_data[key]?.osis_count : '--';

                            // Determine font color for Sharpe Ratio based on rules
                            let fontColor = '#9e9e9e'; // Default gray for missing values
                            if (!Number.isNaN(parseFloat(sharpeRatio))) {
                                const srValue = parseFloat(sharpeRatio);
                                if (srValue < 0) {
                                    fontColor = '#e53935'; // Red for sr < 0
                                } else if (!Number.isNaN(meanSharpe) && srValue > meanSharpe) {
                                    fontColor = '#2e7d32'; // Green for sr > meanSharpe
                                } else {
                                    fontColor = '#f9a825'; // Yellow for other cases
                                }
                            }

                            const percentageStyle = parseFloat(value.percentage) === maxPercentage ? 'text-decoration: underline double;' : '';
                            const sharpeRatioStyle = parseFloat(sharpeRatio).toFixed(2) === parseFloat(maxSharpeRatio).toFixed(2) ? 'text-decoration: underline double;' : '';
                            const bgColor = index % 2 === 0 ? '#ffffff' : '#f2f2f2'; // Alternate row colors

                            return `<tr style="background: ${bgColor};">
                                <td>${key}</td>
                                <td>${value.count}</td>
                                <td style="${percentageStyle}">${value.percentage}%</td>
                                <td style="${sharpeRatioStyle}; color: ${fontColor};">${sharpeRatio}(${isosCount})</td>
                            </tr>`;
                        }).join('');
                    const tableHTML = `
                        <table style="border-collapse: collapse; width: 100%; border: 1px solid #ddd; background: #f9f9f9; font-family: Arial, sans-serif;">
                            <thead style="background: #f1f1f1;">
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; font-weight: bold;">Neutralization</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">Count</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">Percentage</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">Sharpe Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows.split('</tr>').map((row, index) => {
                        const bgColor = index % 2 === 0 ? '#ffffff' : '#f2f2f2'; // Alternate row colors
                        return row ? `<tr style="background: ${bgColor};">${row}</tr>` : '';
                    }).join('')}
                            </tbody>
                        </table>
                    `;

                    // 创建弹出层
                    const popup = document.createElement('div');
                    popup.className = 'wq-neut-popup';
                    popup.style.cssText = [
                        'position: absolute',
                        'z-index: 1000',
                        'background: #fff',
                        'border: 1px solid #ddd',
                        'box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2)',
                        'padding: 10px',
                        'border-radius: 8px',
                        'display: none'
                    ].join(';');
                    popup.innerHTML = tableHTML;
                    document.body.appendChild(popup);

                    // 显示和隐藏弹出层
                    badge.addEventListener('mouseenter', (event) => {
                        popup.style.display = 'block';
                        popup.style.top = `${event.clientY + 10}px`;
                        popup.style.left = `${event.clientX + 10}px`;
                    });
                    badge.addEventListener('mouseleave', () => {
                        popup.style.display = 'none';
                    });

                    a_element.appendChild(badge);
                }
            } catch (error) {
                console.error('捕获到错误:', error);
            }
        });

    })
}



function processNeutralizationData(itemData) {
    // 提取所有键和对应的count值
    const entries = Object.entries(itemData).map(([key, value]) => ({
        key,
        count: value.count
    }));

    // 计算总数
    const totalCount = entries.reduce((sum, item) => sum + item.count, 0);

    // 找到count最大的项
    const maxItem = entries.reduce((max, current) =>
        current.count > max.count ? current : max, entries[0]);

    // 计算百分比
    const maxPercentage = ((maxItem.count / totalCount) * 100).toFixed(2);

    // 为每个条目计算百分比并转换为以key为键的字典
    const entriesDict = {};
    entries.forEach(item => {
        const percentage = ((item.count / totalCount) * 100).toFixed(2);
        entriesDict[item.key] = {
            count: item.count,
            percentage: percentage
        };
    });

    return {
        entries: entriesDict,  // 现在是字典形式
        totalCount,
        maxItem,
        maxPercentage
    };
}