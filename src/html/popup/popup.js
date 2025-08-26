// Description: 弹出窗口的 JS 文件
console.log('popup.js loaded');

// 获取 HTML 元素
const dbAddressInput = document.getElementById('dbAddress');
const hiddenFeatureCheckbox = document.getElementById('hiddenFeature');
const dataAnalysisCheckbox = document.getElementById('dataAnalysis');
const geniusCombineTagCheckbox = document.getElementById('geniusCombineTag');
const geniusAlphaCountInput = document.getElementById('geniusAlphaCount');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('status');
const settingsForm = document.getElementById('settingsForm');
const exportCommunityBtn = document.getElementById('exportCommunityBtn');
const exportCommunityCompressedBtn = document.getElementById('exportCommunityCompressedBtn');
const importCommunityBtn = document.getElementById('importCommunityBtn');
const importCommunityFile = document.getElementById('importCommunityFile');

// 加载用户设置
function loadSettings() {
    statusText.textContent = '加载中...';
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        dbAddressInput.value = WQPSettings.apiAddress || '';
        hiddenFeatureCheckbox.checked = WQPSettings.hiddenFeatureEnabled || false;
        dataAnalysisCheckbox.checked = WQPSettings.dataAnalysisEnabled || false;
        geniusCombineTagCheckbox.checked = WQPSettings.geniusCombineTag || false;
        geniusAlphaCountInput.value = WQPSettings.geniusAlphaCount || 40;
        
        saveBtn.disabled = !dbAddressInput.value.trim();
        statusText.textContent = '';
    });
}

// 保存用户设置
function saveSettings(event) {
    event.preventDefault();
    saveBtn.disabled = true;
    const WQPSettings = {
        apiAddress: dbAddressInput.value.trim(),
        hiddenFeatureEnabled: hiddenFeatureCheckbox.checked,
        dataAnalysisEnabled: dataAnalysisCheckbox.checked,
        geniusCombineTag: geniusCombineTagCheckbox.checked,
        geniusAlphaCount: parseInt(geniusAlphaCountInput.value) || 40
    };

    if (!WQPSettings.apiAddress) {
        showStatusMessage('请输入有效的地址！', false);
        saveBtn.disabled = false;
        return;
    }
    chrome.storage.local.set({ WQPSettings }, () => {
        if (chrome.runtime.lastError) {
            showStatusMessage('保存失败，请重试！', false);
            saveBtn.disabled = false;
        } else {
            showStatusMessage('设置已保存！', true);
            setTimeout(() => {
                statusText.textContent = '';
                saveBtn.disabled = false;
            }, 2000);
        }
    });
}

// 显示状态信息
function showStatusMessage(message, isSuccess = true) {
    statusText.textContent = message;
    statusText.className = isSuccess ? 'success' : 'error';
}

// 事件监听：表单提交
settingsForm.addEventListener('submit', saveSettings);

// 监听输入框内容变化，启用或禁用按钮
dbAddressInput.addEventListener('input', () => {
    saveBtn.disabled = !dbAddressInput.value.trim();
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', loadSettings);

// ========== 社区数据 导出/导入 ==========
function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadBytes(filename, bytes, mime = 'application/octet-stream') {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatNow() {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function handleExportCommunity() {
    statusText.textContent = '导出中...';
    chrome.storage.local.get('WQPCommunityState', ({ WQPCommunityState }) => {
        try {
            if (!WQPCommunityState) {
                showStatusMessage('没有可导出的社区数据。', false);
                return;
            }
            const json = JSON.stringify(WQPCommunityState, null, 2);
            downloadText(`WQPCommunityState_${formatNow()}.json`, json);
            showStatusMessage('导出完成。', true);
        } catch (e) {
            console.error(e);
            showStatusMessage('导出失败。', false);
        }
    });
}

function handleExportCommunityCompressed() {
    statusText.textContent = '导出(压缩)中...';
    chrome.storage.local.get('WQPCommunityState', ({ WQPCommunityState }) => {
        try {
            if (!WQPCommunityState) {
                showStatusMessage('没有可导出的社区数据。', false);
                return;
            }
            // 使用 msgpack 编码 + pako 压缩
            const packed = msgpack.encode(WQPCommunityState);
            const deflated = pako.deflate(packed);
            downloadBytes(`WQPCommunityState_${formatNow()}.wqcs`, deflated, 'application/octet-stream');
            showStatusMessage('压缩导出完成。', true);
        } catch (e) {
            console.error(e);
            showStatusMessage('压缩导出失败。', false);
        }
    });
}

function handleImportClick() {
    if (importCommunityFile) importCommunityFile.value = '';
    importCommunityFile.click();
}

function handleImportFileChange(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    statusText.textContent = '导入中...';
    const isCompressed = /\.wqcs$/i.test(file.name);
    const reader = new FileReader();
    if (isCompressed) {
        reader.onload = () => {
            try {
                const arr = new Uint8Array(reader.result);
                const inflated = pako.inflate(arr);
                const obj = msgpack.decode(inflated);
                chrome.storage.local.set({ WQPCommunityState: obj }, () => {
                    if (chrome.runtime.lastError) {
                        showStatusMessage('写入存储失败。', false);
                    } else {
                        showStatusMessage('导入成功。', true);
                    }
                });
            } catch (e) {
                console.error(e);
                showStatusMessage('导入失败：压缩内容无法解析。', false);
            }
        };
        reader.onerror = () => showStatusMessage('读取文件失败。', false);
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = () => {
            try {
                const obj = JSON.parse(reader.result);
                chrome.storage.local.set({ WQPCommunityState: obj }, () => {
                    if (chrome.runtime.lastError) {
                        showStatusMessage('写入存储失败。', false);
                    } else {
                        showStatusMessage('导入成功。', true);
                    }
                });
            } catch (e) {
                console.error(e);
                showStatusMessage('导入失败：不是合法的 JSON。', false);
            }
        };
        reader.onerror = () => showStatusMessage('读取文件失败。', false);
        reader.readAsText(file, 'utf-8');
    }
}

exportCommunityBtn?.addEventListener('click', handleExportCommunity);
exportCommunityCompressedBtn?.addEventListener('click', handleExportCommunityCompressed);
importCommunityBtn?.addEventListener('click', handleImportClick);
importCommunityFile?.addEventListener('change', handleImportFileChange);
