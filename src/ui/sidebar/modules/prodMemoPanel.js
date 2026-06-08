import { sendMessage } from './runtimeClient.js';
import { downloadText, formatNow, setStatus } from './ui.js';

const ids = {
    summary: 'prodMemoSummary',
    status: 'prodMemoStatus',
    list: 'prodMemoList',
    search: 'prodMemoSearch',
    refresh: 'refreshProdMemoBtn',
    export: 'exportProdMemoBtn',
    import: 'importProdMemoBtn',
    importFile: 'importProdMemoFile',
    clear: 'clearProdMemoBtn',
};

let latestMemoData = {};
let currentSearch = '';

function getEl(id) {
    return document.getElementById(id);
}

function formatTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

function formatStat(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(4) : '-';
}

function bestTimestamp(memo) {
    return Math.max(
        Number(memo?.prod?.updated || 0) || 0,
        Number(memo?.pool?.updated || 0) || 0,
        Number(memo?.self?.updated || 0) || 0,
    );
}

function setPanelStatus(message, mode = '') {
    const statusEl = getEl(ids.status);
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = `info-box${mode ? ` ${mode}` : ''}`;
}

function renderSummary(entries, totalCount) {
    const summary = getEl(ids.summary);
    if (!summary) return;
    const latest = entries[0]?.[1];
    summary.innerHTML = '';

    const countRow = document.createElement('div');
    const countStrong = document.createElement('strong');
    countStrong.textContent = '已缓存：';
    countRow.appendChild(countStrong);
    const countText = currentSearch && totalCount !== entries.length
        ? `${totalCount} 条（显示 ${entries.length} 条）`
        : `${totalCount} 条`;
    countRow.append(document.createTextNode(countText));
    summary.appendChild(countRow);

    const latestRow = document.createElement('div');
    const latestStrong = document.createElement('strong');
    latestStrong.textContent = '最近更新：';
    latestRow.appendChild(latestStrong);
    latestRow.append(document.createTextNode(formatTime(bestTimestamp(latest))));
    summary.appendChild(latestRow);
}

function hasStat(stat) {
    return Number.isFinite(Number(stat?.max));
}

function createStatChip(label, stat) {
    const item = document.createElement('span');
    item.className = hasStat(stat) ? 'is-present' : 'is-missing';
    item.textContent = `${label}: ${hasStat(stat) ? formatStat(stat.max) : '缺失'}`;
    if (stat?.updated) {
        item.title = `更新时间：${formatTime(stat.updated)}`;
    }
    return item;
}

function createCacheRow(alphaId, memo) {
    const row = document.createElement('div');
    row.className = 'cache-row';
    row.dataset.alphaId = alphaId;

    const head = document.createElement('div');
    head.className = 'cache-row-head';

    const id = document.createElement('div');
    id.className = 'cache-alpha-id';
    id.title = alphaId;
    id.textContent = alphaId;

    const time = document.createElement('div');
    time.className = 'cache-time';
    time.textContent = formatTime(bestTimestamp(memo));

    const actions = document.createElement('div');
    actions.className = 'cache-row-actions';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'cache-delete-btn';
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete-prod-memo';
    deleteButton.dataset.alphaId = alphaId;
    deleteButton.textContent = '删除';

    actions.append(time, deleteButton);
    head.append(id, actions);

    const stats = document.createElement('div');
    stats.className = 'cache-stats';
    [
        createStatChip('PC', memo?.prod),
        createStatChip('Max Pool Corr', memo?.pool),
        createStatChip('Max Self Corr', memo?.self),
    ].forEach((item) => stats.appendChild(item));

    row.append(head, stats);
    return row;
}

function getSortedEntries(memoData) {
    return Object.entries(memoData || {})
        .sort((a, b) => bestTimestamp(b[1]) - bestTimestamp(a[1]));
}

function filterEntries(entries) {
    const query = currentSearch.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(([alphaId]) => alphaId.toLowerCase().includes(query));
}

function renderList(memoData = latestMemoData) {
    latestMemoData = memoData || {};
    const allEntries = getSortedEntries(latestMemoData);
    const entries = filterEntries(allEntries);
    renderSummary(entries, allEntries.length);

    const list = getEl(ids.list);
    if (!list) return;
    list.innerHTML = '';

    if (allEntries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '暂无 ProdMemo 缓存。';
        list.appendChild(empty);
        return;
    }

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '没有匹配的 ProdMemo 缓存。';
        list.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    entries.forEach(([alphaId, memo]) => {
        fragment.appendChild(createCacheRow(alphaId, memo));
    });
    list.appendChild(fragment);
}

async function refreshProdMemoPanel() {
    const data = await sendMessage('WQP_PRODMEMO_GET');
    renderList(data.memoData || {});
    return data;
}

async function runWithButton(buttonId, fn) {
    const button = getEl(buttonId);
    if (button) button.disabled = true;
    try {
        return await fn();
    } finally {
        if (button) button.disabled = false;
    }
}

async function exportProdMemo() {
    const data = await sendMessage('WQP_PRODMEMO_EXPORT');
    const memoData = data.memoData || {};
    const count = data.count || Object.keys(memoData).length;
    if (count === 0) {
        setPanelStatus('无数据可导出。', 'error');
        return;
    }
    downloadText(`WQP_ProdMemo_export_${formatNow()}.json`, JSON.stringify(memoData, null, 2));
    renderList(memoData);
    setPanelStatus(`已导出 ${count} 条 ProdMemo 缓存。`, 'success');
}

async function importProdMemoFile(file) {
    const text = await file.text();
    const memoData = JSON.parse(text);
    const result = await sendMessage('WQP_PRODMEMO_IMPORT', { memoData });
    await refreshProdMemoPanel();
    setPanelStatus(`已导入 ${result.imported || 0} 条，跳过 ${result.skipped || 0} 条。`, 'success');
}

async function clearProdMemo() {
    if (!confirm('确定要清空所有 ProdMemo 缓存吗？')) return;
    const result = await sendMessage('WQP_PRODMEMO_CLEAR');
    renderList({});
    setPanelStatus(`已清空 ${result.cleared || 0} 条 ProdMemo 缓存。`, 'success');
}

async function deleteProdMemo(alphaId) {
    const normalizedId = String(alphaId || '').trim();
    if (!normalizedId) return;
    if (!confirm(`确定要删除 ${normalizedId} 的 ProdMemo 缓存吗？`)) return;

    const result = await sendMessage('WQP_PRODMEMO_DELETE', { alphaId: normalizedId });
    delete latestMemoData[normalizedId];
    renderList(latestMemoData);
    setPanelStatus(
        result.deleted
            ? `已删除 ${normalizedId} 的 ProdMemo 缓存。`
            : `${normalizedId} 没有可删除的 ProdMemo 缓存。`,
        result.deleted ? 'success' : 'error',
    );
}

export async function initProdMemoPanel() {
    try {
        await refreshProdMemoPanel();
        setPanelStatus('ProdMemo 缓存已加载。');
    } catch (error) {
        setPanelStatus(`ProdMemo 缓存加载失败：${error.message}`, 'error');
        setStatus(`ProdMemo 缓存加载失败：${error.message}`, 'error');
    }

    getEl(ids.refresh).addEventListener('click', () => {
        runWithButton(ids.refresh, async () => {
            await refreshProdMemoPanel();
            setPanelStatus('ProdMemo 缓存已刷新。', 'success');
        }).catch((error) => {
            setPanelStatus(`刷新失败：${error.message}`, 'error');
        });
    });

    getEl(ids.export).addEventListener('click', () => {
        runWithButton(ids.export, exportProdMemo).catch((error) => {
            setPanelStatus(`导出失败：${error.message}`, 'error');
        });
    });

    getEl(ids.import).addEventListener('click', () => {
        const input = getEl(ids.importFile);
        input.value = '';
        input.click();
    });

    getEl(ids.importFile).addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        runWithButton(ids.import, () => importProdMemoFile(file)).catch((error) => {
            setPanelStatus(`导入失败：${error.message}`, 'error');
        }).finally(() => {
            event.target.value = '';
        });
    });

    getEl(ids.search).addEventListener('input', (event) => {
        currentSearch = event.target.value || '';
        renderList(latestMemoData);
    });

    getEl(ids.list).addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="delete-prod-memo"]');
        if (!button) return;
        button.disabled = true;
        deleteProdMemo(button.dataset.alphaId)
            .catch((error) => {
                setPanelStatus(`删除失败：${error.message}`, 'error');
            })
            .finally(() => {
                if (button.isConnected) button.disabled = false;
            });
    });

    getEl(ids.clear).addEventListener('click', () => {
        runWithButton(ids.clear, clearProdMemo).catch((error) => {
            setPanelStatus(`清空失败：${error.message}`, 'error');
        });
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;
        const hasProdMemoChange = Object.keys(changes).some((key) => key.startsWith('WQP_ProdMemo_'));
        if (!hasProdMemoChange) return;
        refreshProdMemoPanel().catch(() => {});
    });
}
