// dataFlag.js: 对已经分析过的数据集进行标记
console.log('dataFlag.js loaded');

const flagMapOtherUniverse = {};

function dataFlagFunc(dataSetList, dataIsOs, url) {
    waitForElement(".data-table__container", ".data-table__stale-loader-container").then(() => {
        console.log(`${url}完成加载`)
        const delay = document.getElementById('data-delay').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const region = document.getElementById('data-region').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const universe = document.getElementById('data-universe').querySelector('[aria-selected="true"]').firstChild.innerHTML
        const elements = document.querySelectorAll(".rt-tr-group");

        // 循环遍历这些元素
        // 计算当前 Region+Delay 的 Sharpe 均值（用于颜色阈值）
        let meanSharpe = NaN;
        try {
            const meanSharpeRaw = dataIsOs?.[`${region}_${delay}`]?.['mean']?.['sharpe_ratio'];
            meanSharpe = (meanSharpeRaw !== undefined && meanSharpeRaw !== null) ? parseFloat(meanSharpeRaw) : NaN;
        } catch (_) { /* 忽略路径异常 */ }
        let osisEndDate = dataIsOs?.[`${region}_${delay}`]?.['sub_end_time']
        let osisTotalCount = dataIsOs?.[`${region}_${delay}`]?.['total_count']

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

        elements.forEach(function (element) {
            try {
                let a_element = element.querySelector(".link.link--wrap");
                // console.log(a_element)
                if (a_element.href.includes("data-fields")) {
                    return;
                }
                let parts = a_element.href.split("/");
                let lastPart = parts[parts.length - 1];
                // 读取该数据集在 dataIsOs 中的指标数据
                let item_data = undefined;
                try {
                    item_data = dataIsOs?.[`${region}_${delay}`]?.['dataset']?.[lastPart];
                } catch (_) { /* 忽略路径异常 */ }

                // 移除已有的徽章，避免重复添加
                const existingBadge = a_element.querySelector('.wq-sr-badge');
                if (existingBadge) existingBadge.remove();

                // 计算 Sharpe 与样本数（空值安全）
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
                    badge.className = 'wq-sr-badge';
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
                    const tooltip = `OS/IS Sharpe: ${srText}\nCount: ${cntText}\nMean OS/IS Sharpe(${region}_${delay}): ${meanText}\nTotal Count: ${osisTotalCount}\nDataset: ${lastPart}\n统计截至日期: ${osisEndDate}`;
                    badge.title = tooltip;
                    badge.setAttribute('aria-label', tooltip);
                    a_element.appendChild(badge);
                }
            } catch (error) {
                console.error('捕获到错误:', error);
            }
        });
    })
}
