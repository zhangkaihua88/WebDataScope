// alphaDetailsPopup.js: 独立脚本，用于显示双击选中的 Alpha 详细信息弹窗
console.log('alphaDetailsPopup.js loaded');

// Global variable to hold the independent card element for double-click
let submittedAlphaCard = null;
const fieldMetadataCache = new Map();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeFieldId(value) {
    return String(value || '')
        .trim()
        .replace(/^['"`]+|['"`]+$/g, '');
}

function pickLabel(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object') {
        return pickLabel(value.name)
            || pickLabel(value.title)
            || pickLabel(value.id)
            || pickLabel(value.value);
    }
    return '';
}

async function fetchBrainJson(url) {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        referrer: 'https://platform.worldquantbrain.com/',
        referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (!response.ok) return null;
    return response.json();
}

function extractFieldMetadata(fieldData) {
    if (!fieldData) return null;

    const datasetId = pickLabel(fieldData.dataset?.id)
        || pickLabel(fieldData.dataSet?.id)
        || pickLabel(fieldData.data_set?.id)
        || pickLabel(fieldData.datasetId)
        || pickLabel(fieldData.dataSetId)
        || pickLabel(fieldData.dataset_id)
        || pickLabel(fieldData.dataset)
        || pickLabel(fieldData.dataSet);

    const category = pickLabel(fieldData.dataset?.category)
        || pickLabel(fieldData.dataSet?.category)
        || pickLabel(fieldData.dataCategory)
        || pickLabel(fieldData.category);

    const fieldName = pickLabel(fieldData.name) || pickLabel(fieldData.description);

    if (!datasetId && !category && !fieldName) return null;
    return {
        datasetId,
        category,
        fieldName,
    };
}

async function getFieldMetadata(fieldId) {
    const normalizedId = normalizeFieldId(fieldId);
    if (!normalizedId) return null;

    if (fieldMetadataCache.has(normalizedId)) return fieldMetadataCache.get(normalizedId);

    let fieldData = null;
    try {
        fieldData = await fetchBrainJson(`https://api.worldquantbrain.com/data-fields/${encodeURIComponent(normalizedId)}`);
    } catch (_) {
        fieldData = null;
    }

    const metadata = extractFieldMetadata(fieldData);
    fieldMetadataCache.set(normalizedId, metadata);
    return metadata;
}

function renderFieldMetadata(metadata) {
    const rowStyle = 'display:flex; gap:8px; align-items:flex-start; margin-top:3px;';
    const labelStyle = 'flex:0 0 auto; color:#6b7280; font-weight:600;';
    const valueStyle = 'min-width:0; color:#111827; word-break:break-all;';

    if (!metadata) {
        return `
            <div style="margin-bottom: 14px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff;">
                <div style="${rowStyle}">
                    <span style="${labelStyle}">字段信息:</span>
                    <span style="${valueStyle}">未从 Brain API 找到 dataset / 分类</span>
                </div>
            </div>
        `;
    }

    return `
        <div style="margin-bottom: 14px; padding: 10px; border: 1px solid #dbeafe; border-radius: 6px; background: #eff6ff;">
            <div style="${rowStyle}">
                <span style="${labelStyle}">Dataset ID:</span>
                <span style="${valueStyle}">
                    ${metadata.datasetId ? `
                        <a href="https://platform.worldquantbrain.com/data/data-sets/${encodeURIComponent(metadata.datasetId)}" target="_blank" rel="noopener noreferrer" style="color:#007bff; text-decoration:none;">
                            ${escapeHtml(metadata.datasetId)}
                        </a>
                    ` : '-'}
                </span>
            </div>
            <div style="${rowStyle}">
                <span style="${labelStyle}">分类:</span>
                <span style="${valueStyle}">${escapeHtml(metadata.category || '-')}</span>
            </div>
            ${metadata.fieldName ? `
                <div style="${rowStyle}">
                    <span style="${labelStyle}">字段名:</span>
                    <span style="${valueStyle}">${escapeHtml(metadata.fieldName)}</span>
                </div>
            ` : ''}
        </div>
    `;
}

function dismissSubmittedAlphaCard() {
    if (submittedAlphaCard && submittedAlphaCard.parentNode) {
        submittedAlphaCard.parentNode.removeChild(submittedAlphaCard);
    }
    submittedAlphaCard = null;
    document.removeEventListener('click', dismissSubmittedAlphaCardOutside);
    document.removeEventListener('keydown', dismissSubmittedAlphaCardOnEscape);
}

function dismissSubmittedAlphaCardOutside(event) {
    if (submittedAlphaCard && !submittedAlphaCard.contains(event.target)) {
        dismissSubmittedAlphaCard();
    }
}

function dismissSubmittedAlphaCardOnEscape(event) {
    if (event.key === 'Escape') {
        dismissSubmittedAlphaCard();
    }
}

async function showSubmittedAlphaDetailsCard(event) {
    // Dismiss any existing independent card first
    dismissSubmittedAlphaCard();

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // 校验选中文本：不能为空，且不能过长
    if (!selectedText || selectedText.length > 100) {
        return;
    }

    // Create the independent card element
    submittedAlphaCard = document.createElement('div');
    submittedAlphaCard.id = 'submittedAlphaDetailsCard';
    submittedAlphaCard.style.cssText = `
        position: fixed;
        background-color: #f8f8f8; /* Light grey background */
        border: 1px solid #ddd;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); /* More prominent shadow */
        padding: 20px; /* More padding */
        z-index: 10000;
        max-width: 450px; /* Slightly wider */
        max-height: 500px; /* Limit height for scroll */
        overflow-y: auto; /* Enable vertical scroll */
        border-radius: 10px; /* Rounded corners */
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; /* Modern font */
        color: #333;
        line-height: 1.6;
        cursor: auto;
    `;

    // Position the card near the mouse
    submittedAlphaCard.style.left = `${event.clientX + 15}px`;
    submittedAlphaCard.style.top = `${event.clientY + 15}px`;

    document.body.appendChild(submittedAlphaCard);

    // Initial loading state
    submittedAlphaCard.innerHTML = `
        <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 15px;">
            <span style="color: #007bff;">${escapeHtml(selectedText)}</span> 字段提交状态查询
        </div>
        <div style="text-align: center; padding: 20px;">查询中... <div class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div></div>
        <button id="closeSubmittedAlphaCard" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    // Add close button functionality
    document.getElementById('closeSubmittedAlphaCard').addEventListener('click', dismissSubmittedAlphaCard);

    // Add click-outside and escape key listeners for dismissal
    document.addEventListener('click', dismissSubmittedAlphaCardOutside);
    document.addEventListener('keydown', dismissSubmittedAlphaCardOnEscape);


    try {
        // Assume getSubmittedFields is available globally or imported
        // Since it's in utils.js, it should be available if utils.js is loaded before this script.
        const alphas = await getSubmittedFields(); // 获取所有已提交的 Alpha

        console.log("Selected Text:", selectedText);
        const matchedAlphasSummary = alphas.filter(alpha => alpha.regular && alpha.regular.code && alpha.regular.code.includes(selectedText));
        console.log("Matched Alphas Summary:", matchedAlphasSummary);

        const fieldMetadata = await getFieldMetadata(selectedText);
        let cardContentHtml = '';
        let mainTitleText = `<span style="color: #007bff;">${escapeHtml(selectedText)}</span> 字段在本赛季提交状态:`;

        if (matchedAlphasSummary.length > 0) {
            cardContentHtml += `<ul style="list-style-type: none; padding: 0;">`; // Remove default list styling
            let hasValidAlphasToDisplay = false;
            matchedAlphasSummary.forEach(alpha => { // Directly iterate over the summary alphas
                if (alpha && alpha.id) { // Use alpha.id as the Alpha ID
                    hasValidAlphasToDisplay = true;
                    // Build Alpha settings information directly from alpha.settings
                    const settings = `${alpha.settings?.instrumentType || 'N/A'} / ${alpha.settings?.region || 'N/A'} / ${alpha.settings?.universe || 'N/A'} / D${alpha.settings?.delay || 'N/A'}`;
                    const alphaCode = alpha.regular && alpha.regular.code ? alpha.regular.code : 'N/A';
                    
                    cardContentHtml += `
                        <li style="margin-bottom: 20px; padding: 10px; border: 1px solid #eee; border-radius: 5px; background-color: #fff;">
                            <div style="font-weight: bold; margin-bottom: 5px;">Alpha ID: <a href="https://platform.worldquantbrain.com/alpha/${encodeURIComponent(alpha.id)}" target="_blank" style="color: #007bff; text-decoration: none;">${escapeHtml(alpha.id)}</a></div>
                            <div style="margin-bottom: 5px;">设置: ${escapeHtml(settings)}</div>
                            <div>代码:<pre style="background-color: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-family: 'Courier New', Courier, monospace; font-size: 0.9em;"><code>${escapeHtml(alphaCode)}</code></pre></div>
                        </li>
                    `;
                }
            });
            cardContentHtml += `</ul>`;

            if (!hasValidAlphasToDisplay) {
                cardContentHtml = `<div style="text-align: center; padding: 20px;">未能获取到匹配 Alpha 的详细信息。</div>`;
            }
        } else {
            cardContentHtml = `<div style="text-align: center; padding: 20px;">未被使用。</div>`; // Concise "Not used" status
        }
        
        submittedAlphaCard.innerHTML = `
            <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 15px;">
                ${mainTitleText}
            </div>
            ${renderFieldMetadata(fieldMetadata)}
            ${cardContentHtml}
            <button id="closeSubmittedAlphaCard" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
        `;
        // Ensure the close button listener is re-attached after innerHTML update
        document.getElementById('closeSubmittedAlphaCard').addEventListener('click', dismissSubmittedAlphaCard);


    } catch (error) {
        console.error('查询已提交 Alpha 详情失败:', error);
        submittedAlphaCard.innerHTML = `
            <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 15px;">
                <span style="color: #007bff;">${escapeHtml(selectedText)}</span> 字段提交状态查询失败
            </div>
            <div style="text-align: center; padding: 20px; color: red;">查询失败: ${escapeHtml(error.message)}</div>
            <button id="closeSubmittedAlphaCard" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
        `;
        document.getElementById('closeSubmittedAlphaCard').addEventListener('click', dismissSubmittedAlphaCard);
    }
}

// Add event listener for dblclick
document.addEventListener("dblclick", showSubmittedAlphaDetailsCard);
