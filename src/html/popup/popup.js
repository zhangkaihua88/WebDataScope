// Description: 弹出窗口的 JS 文件
console.log('popup.js loaded');

// 获取 HTML 元素
const dbAddressInput = document.getElementById('dbAddress');
const hiddenFeatureCheckbox = document.getElementById('hiddenFeature');
const dataAnalysisCheckbox = document.getElementById('dataAnalysis');
const geniusCombineTagCheckbox = document.getElementById('geniusCombineTag');
const geniusAlphaCountInput = document.getElementById('geniusAlphaCount');
const apiMonitorEnabledCheckbox = document.getElementById('apiMonitorEnabled');
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
        apiMonitorEnabledCheckbox.checked = WQPSettings.apiMonitorEnabled || false;

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
        geniusAlphaCount: parseInt(geniusAlphaCountInput.value) || 40,
        apiMonitorEnabled: apiMonitorEnabledCheckbox.checked
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
    if (!message) {
        statusText.className = '';
        return;
    }
    if (typeof isSuccess === 'string') {
        statusText.className = isSuccess;
        return;
    }
    statusText.className = isSuccess ? 'success' : 'error';
}

function showProgressStatus(prefix, current, total) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
    const ratio = safeCurrent / safeTotal;
    const percent = Math.floor(ratio * 100);
    const barWidth = 20;
    const filled = Math.round(ratio * barWidth);
    const bar = `[${'#'.repeat(filled)}${'-'.repeat(barWidth - filled)}]`;
    showStatusMessage(`${prefix} ${bar} ${percent}% (${safeCurrent}/${safeTotal})`, 'info');
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

// ========== 数据文件加载 ==========
const loadDataFileBtn = document.getElementById('loadDataFileBtn');
const loadDataFile = document.getElementById('loadDataFile');
const dataFileStatus = document.getElementById('dataFileStatus');

// IndexedDB 配置 - 用户导入的数据（存储在background script的IndexedDB中）
const USER_DB_NAME = 'WQP_User_Data';
const USER_STORE_NAME = 'dataFiles';
const USER_DB_VERSION = 1;

// 分块发送数据到background（绕过64MB限制）
async function sendDataToBackground(dataFiles, version, onProgress) {
    const dataStr = JSON.stringify(dataFiles);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(dataStr);
    const chunkSize = 1024 * 1024; // 1MB 每块
    const totalChunks = Math.ceil(dataBytes.length / chunkSize);

    console.log(`Sending ${dataBytes.length} bytes in ${totalChunks} chunks`);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, dataBytes.length);
        const chunk = dataBytes.slice(start, end);
        const isLast = i === totalChunks - 1;

        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'STORE_DATA_CHUNK',
                chunk: Array.from(chunk), // 转为数组以序列化
                chunkIndex: i,
                totalChunks: totalChunks,
                version: version,
                isLast: isLast
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(resp);
                }
            });
        });

        if (typeof onProgress === 'function') {
            onProgress(i + 1, totalChunks);
        }

        console.log(`Chunk ${i + 1}/${totalChunks} sent`);
    }

    return true;
}

function handleLoadDataFileClick() {
    if (loadDataFile) loadDataFile.value = '';
    loadDataFile.click();
}

function handleLoadDataFileChange(evt) {
    showStatusMessage('');
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    const isZip = /\.zip$/i.test(file.name);
    if (!isZip) {
        showStatusMessage('请选择 ZIP 格式的文件。', false);
        return;
    }

    statusText.textContent = '正在解析...';
    const reader = new FileReader();

    reader.onload = async function(event) {
        try {
            const arrayBuffer = event.target.result;
            const zip = await JSZip.loadAsync(arrayBuffer);

            // 查找ZIP中的bin/json文件
            const binFiles = [];
            const jsonFiles = [];
            const dataFiles = {};

            zip.forEach((relativePath, zipEntry) => {
                if (relativePath.endsWith('.bin')) {
                    binFiles.push({ name: relativePath, data: zipEntry });
                }
                if (relativePath.endsWith('.json')) {
                    jsonFiles.push({ name: relativePath, data: zipEntry });
                }
            });

            if (binFiles.length === 0) {
                showStatusMessage('ZIP文件中没有找到.bin数据文件。', false);
                dataFileStatus.textContent = '';
                return;
            }

            // 解析每个bin文件
            
            for (let i = 0; i < binFiles.length; i++) {
                const binFile = binFiles[i];
                const binData = await binFile.data.async('arraybuffer');
                // 解压和解码
                const inflated = pako.inflate(new Uint8Array(binData));
                const decoded = msgpack.decode(new Uint8Array(inflated));
                // 使用文件名作为key（去掉.bin后缀）
                const key = binFile.name.replace(/\.bin$/, '');
                dataFiles[key] = decoded;
                console.log(`Loaded: ${binFile.name}`);
                showProgressStatus('解析数据', i + 1, binFiles.length);
            }

            // 解析ZIP中的JSON文件并直接放入dataFiles
            for (let i = 0; i < jsonFiles.length; i++) {
                const jsonFile = jsonFiles[i];
                const jsonText = await jsonFile.data.async('text');
                dataFiles[jsonFile.name] = JSON.parse(jsonText);
                console.log(`Loaded JSON: ${jsonFile.name}`);
            }

            // 分块发送到 background
            await sendDataToBackground(dataFiles, file.name, (current, total) => {
                showProgressStatus('写入数据库', current, total);
            });

            showStatusMessage(`成功加载 ${binFiles.length} 个数据文件。`, true);
            // dataFileStatus.textContent = `已加载: ${binFiles.map(f => f.name).join(', ')}`;

        } catch (e) {
            console.error('解析ZIP文件失败:', e);
            showStatusMessage('解析ZIP文件失败: ' + e.message, false);
            dataFileStatus.textContent = '';
        }
    };

    reader.onerror = () => {
        showStatusMessage('读取文件失败。', false);
        dataFileStatus.textContent = '';
    };

    reader.readAsArrayBuffer(file);
}

loadDataFileBtn?.addEventListener('click', handleLoadDataFileClick);
loadDataFile?.addEventListener('change', handleLoadDataFileChange);

// ========== 测试数据库 ==========
const testDataBtn = document.getElementById('testDataBtn');

async function handleTestDataClick() {
    statusText.textContent = '测试中...';
    // dataFileStatus.textContent = '正在检查数据库...';
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'DEBUG_GET_DATA' }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(resp);
                }
            });
        });
        
        console.log('Database test result:', response);
        
        if (response && response.ok && response.result) {
            const keys = response.result;
            
            // dataFileStatus.textContent = `数据库正常: ${keys.length} 个文件,`;
            showStatusMessage(`数据库正常！${keys.length} 个数据文件已加载。`, true);
            
            // 显示前几个key
            console.log('Data keys:', keys.slice(0, 10));
        } else {
            // dataFileStatus.textContent = '数据库为空或无响应';
            showStatusMessage('数据库为空，请先加载ZIP文件。', false);
        }
    } catch (e) {
        console.error('Database test error:', e);
        dataFileStatus.textContent = '测试失败';
        showStatusMessage('数据库测试失败: ' + e.message, false);
    }
}

testDataBtn?.addEventListener('click', handleTestDataClick);
