// dataFlag.js: 对已经分析过的数据集进行标记
// 架构：只负责提取页面信息，发送给 background 处理，返回结果后再标记
console.log('dataFlag.js loaded');

const flagMapOtherUniverse = {};

// ---------------------- 向 Background 发送消息的辅助函数 ----------------------
function sendMessageToBackground(msg) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(msg, (resp) => {
            if (chrome.runtime.lastError) {
                console.error('Message error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve(resp);
            }
        });
    });
}

// ---------------------- Data Loader - 从 background 获取处理结果 ----------------------

// 从 background 获取标记信息
async function getFlagsFromBackground(region, delay, universe, datasetNames) {
    try {
        const resp = await sendMessageToBackground({
            type: 'GET_FLAGS',
            region: region,
            delay: delay,
            universe: universe,
            datasetNames: datasetNames
        });
        
        if (resp && resp.ok) {
            return resp.flags;
        }
        return null;
    } catch (e) {
        console.log('Error getting flags from background:', e);
        return null;
    }
}

// 从 background 获取 OS/IS 标记
async function getOSISFlagsFromBackground(region, delay, datasetNames) {
    try {
        const resp = await sendMessageToBackground({
            type: 'GET_OSIS_FLAGS',
            region: region,
            delay: delay,
            datasetNames: datasetNames
        });
        
        if (resp && resp.ok) {
            return resp.flags;
        }
        return null;
    } catch (e) {
        console.log('Error getting OSIS flags from background:', e);
        return null;
    }
}

// 从 background 获取 Neutralization 标记
async function getNeutralizationFlagsFromBackground(region, delay, datasetNames) {
    try {
        const resp = await sendMessageToBackground({
            type: 'GET_NEUT_FLAGS',
            region: region,
            delay: delay,
            datasetNames: datasetNames
        });
        
        if (resp && resp.ok) {
            return resp.flags;
        }
        return null;
    } catch (e) {
        console.log('Error getting neutralization flags from background:', e);
        return null;
    }
}


function dataFlagFunc(dataSetList, url) {
    if(!url.includes("data/data-sets")) return; // 只在数据集列表页面执行

    // 从 background 获取所有标记信息
    async function getAllFlagsFromBackground(region, delay, universe, datasetNames, pageType) {
        try {
            let flagsResp = { flags: {} };
            if (pageType === 'dataset') {
                // 1. 获取分析报告标记
                console.time("测试代码速度analysisFlags");
                flagsResp = await sendMessageToBackground({
                    type: 'GET_FLAGS',
                    region: region,
                    delay: delay,
                    universe: universe,
                    datasetNames: datasetNames,
                    dataSetList: dataSetList,
                    pageType: pageType
                });
                console.timeEnd("测试代码速度analysisFlags");
            }

            // 2&3. OS/IS 与 Neutralization 并行请求，减少总等待时间
            console.time("测试代码速度flagsParallel");
            const [osisResp, neutResp] = await Promise.all([
                sendMessageToBackground({
                    type: 'GET_OSIS_FLAGS',
                    region: region,
                    delay: delay,
                    datasetNames: datasetNames,
                    pageType: pageType
                }),
                sendMessageToBackground({
                    type: 'GET_NEUT_FLAGS',
                    region: region,
                    delay: delay,
                    datasetNames: datasetNames,
                    pageType: pageType
                })
            ]);
            console.timeEnd("测试代码速度flagsParallel");
            
            return {
                analysisFlags: flagsResp?.flags || {},
                osisFlags: osisResp?.flags || {},
                osisMeanSharpe: osisResp?.meanSharpe || NaN,
                osisEndDate: osisResp?.endDate || null,
                osisTotalCount: osisResp?.totalCount || 0,
                neutFlags: neutResp?.flags || {}
            };
        } catch (e) {
            console.error('Error getting flags from background:', e);
            return null;
        }
    }
    
    // 应用分析报告标记
    function applyAnalysisFlags(elements, region, delay, universe, flags) {
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                if (a_element.href.includes("data-fields")) {
                    return;
                }
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                let fileName = `${lastPart}`;
                
                // 清除旧标记
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?★★★<\/span>/g, '');
                a_element.innerHTML = a_element.innerHTML.replace(/<span.*?☆☆☆<\/span>/g, '');
                
                const flag = flags[fileName] || {};
                if (flag.hasAnalysis) {
                    a_element.innerHTML = `<span style="color: red;">★★★</span>${a_element.innerHTML}`;
                } else if (flag.hasOtherUniverse) {
                    a_element.innerHTML = `<span style="color: red;">☆☆☆</span>${a_element.innerHTML}`;
                }
            } catch (error) {
                console.error('Error applying analysis flags:', error);
            }
        });
    }
    
    // 应用 OS/IS 标记
    function applyOSISFlags(elements, region, delay, flags, meanSharpe, endDate, totalCount) {
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                
                const existingBadge = a_element.querySelector('.wq-isos-badge');
                if (existingBadge) existingBadge.remove();
                
                const flag = flags[lastPart];
                if (!flag || !flag.hasData) return;
                
                const sr = flag.sr;
                const count = flag.count;
                
                // 颜色规则
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
                
                const badge = document.createElement('span');
                badge.className = 'wq-isos-badge';
                const countText = (count !== undefined && count !== null && count !== '') ? `(${count})` : '';
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
                
                const srText = (!Number.isNaN(sr)) ? sr.toFixed(4) : '--';
                const meanText = (!Number.isNaN(meanSharpe)) ? meanSharpe.toFixed(4) : '--';
                const cntText = (count !== undefined && count !== null && count !== '') ? `${count}` : '--';
                const tooltip = `OS/IS Sharpe: ${srText}\nCount: ${cntText}\nMean OS/IS Sharpe(${region}_${delay}): ${meanText}\nTotal Count: ${totalCount}\nDataset: ${lastPart}\n统计截至日期: ${endDate}`;
                badge.title = tooltip;
                a_element.appendChild(badge);
            } catch (error) {
                console.error('Error applying OSIS flags:', error);
            }
        });
    }
    
    // 应用 Neutralization 标记
    function applyNeutFlags(elements, region, delay, meanSharpe, flags) {
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                
                const existingBadge = a_element.querySelector('.wq-neut-badge');
                if (existingBadge) existingBadge.remove();
                
                const flag = flags[lastPart];
                if (!flag || !flag.hasData) return;
                
                const { maxItem, maxPercentage, entries, data } = flag;
                
                const badge = document.createElement('span');
                badge.className = 'wq-neut-badge';
                badge.textContent = `${maxItem.key.toLowerCase()}(${maxPercentage}%)`;
                badge.style.cssText = [
                    'display:inline-block',
                    'margin-left:6px',
                    'padding:0 6px',
                    'border-radius:6px',
                    'background-color:#9e9e9e',
                    'color:#fff',
                    'font-size:12px',
                    'font-weight:600',
                    'line-height:1.6',
                    'vertical-align:middle',
                    'cursor:pointer'
                ].join(';');
                
                // 创建表格
                const maxSharpeRatio = Math.max(
                    ...Object.entries(data)
                        .map(([key, value]) => parseFloat(value?.sharpe_ratio))
                        .filter(val => !isNaN(val) && val !== null)
                );

                const tableRows = Object.entries(entries)
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                    .map(([key, value], index) => {
                        const sharpeRatio = data[key]?.sharpe_ratio !== undefined ? parseFloat(data[key]?.sharpe_ratio).toFixed(2) : '--';
                        const isosCount = data[key]?.osis_count !== undefined ? data[key]?.osis_count : '--';

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
                
                badge.addEventListener('mouseenter', (e) => {
                    popup.style.display = 'block';
                    popup.style.top = `${e.clientY + 10}px`;
                    popup.style.left = `${e.clientX + 10}px`;
                });
                badge.addEventListener('mouseleave', () => popup.style.display = 'none');
                
                a_element.appendChild(badge);
            } catch (error) {
                console.error('Error applying neut flags:', error);
            }
        });
    }
    
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(async () => {
        console.log(`${url}完成加载`);
        
        const delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML;
        const region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML;
        const universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML;
        const elements = document.querySelectorAll(".rt-tr-group");
        
        // 提取所有数据集名称
        const datasetNames = [];
        let pageType = null;
        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                pageType = a_element.href.includes("data/data-sets") ? 'dataset' : (a_element.href.includes("data-fields") ? 'datafield' : null);
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                datasetNames.push(lastPart);
            } catch (_) {}
        });


    
        
        console.log('Getting flags from background for', datasetNames.length, pageType, '...');
        
        // 从 background 获取所有标记
        console.time("测试代码速度getAllFlagsFromBackground");
        const allFlags = await getAllFlagsFromBackground(region, delay, universe, datasetNames, pageType);
        console.timeEnd("测试代码速度getAllFlagsFromBackground");
        
        if (!allFlags) {
            console.error('Failed to get flags from background');
            return;
        }
        
        console.log('Applying flags...', allFlags);
        
        // 应用各种标记
        applyAnalysisFlags(elements, region, delay, universe, allFlags.analysisFlags);
        applyOSISFlags(elements, region, delay, allFlags.osisFlags, allFlags.osisMeanSharpe, allFlags.osisEndDate, allFlags.osisTotalCount);
        applyNeutFlags(elements, region, delay, allFlags.osisMeanSharpe, allFlags.neutFlags);
    });
}


// 处理 Neutralization 数据的辅助函数（备用）
function processNeutralizationData(itemData) {
    if (!itemData) return null;
    
    const entries = Object.entries(itemData).map(([key, value]) => ({
        key,
        count: value.count
    }));

    const totalCount = entries.reduce((sum, item) => sum + item.count, 0);
    const maxItem = entries.reduce((max, current) =>
        current.count > max.count ? current : max, entries[0]);
    const maxPercentage = ((maxItem.count / totalCount) * 100).toFixed(2);

    const entriesDict = {};
    entries.forEach(item => {
        const percentage = ((item.count / totalCount) * 100).toFixed(2);
        entriesDict[item.key] = {
            count: item.count,
            percentage: percentage
        };
    });

    return {
        entries: entriesDict,
        totalCount,
        maxItem,
        maxPercentage
    };
}