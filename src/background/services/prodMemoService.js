const STORAGE_PREFIX = 'WQP_ProdMemo_';

function getAllLocal() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve(items || {});
        });
    });
}

function setLocal(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
}

function removeLocal(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
}

function normalizeAlphaId(value) {
    return String(value || '').trim();
}

function hasMemoPayload(value) {
    return Boolean(value && typeof value === 'object' && (value.prod || value.pool || value.self));
}

function normalizeMemo(value) {
    const memo = {};
    ['prod', 'pool', 'self'].forEach((key) => {
        if (value?.[key] && typeof value[key] === 'object') {
            memo[key] = value[key];
        }
    });
    return memo;
}

export async function getProdMemoCache() {
    const all = await getAllLocal();
    const memoData = {};
    Object.entries(all).forEach(([key, value]) => {
        if (!key.startsWith(STORAGE_PREFIX)) return;
        const alphaId = key.slice(STORAGE_PREFIX.length);
        if (!alphaId) return;
        memoData[alphaId] = value;
    });
    return {
        count: Object.keys(memoData).length,
        memoData,
    };
}

export async function importProdMemoCache(importedData) {
    if (!importedData || typeof importedData !== 'object' || Array.isArray(importedData)) {
        throw new Error('ProdMemo 导入文件必须是 JSON 对象。');
    }

    const values = {};
    let imported = 0;
    let skipped = 0;

    Object.entries(importedData).forEach(([rawAlphaId, value]) => {
        const alphaId = normalizeAlphaId(rawAlphaId.replace(/^WQP_ProdMemo_/, ''));
        if (!alphaId || !hasMemoPayload(value)) {
            skipped += 1;
            return;
        }
        values[`${STORAGE_PREFIX}${alphaId}`] = normalizeMemo(value);
        imported += 1;
    });

    if (imported > 0) {
        await setLocal(values);
    }

    return {
        imported,
        skipped,
        count: (await getProdMemoCache()).count,
    };
}

export async function clearProdMemoCache() {
    const all = await getAllLocal();
    const keys = Object.keys(all).filter((key) => key.startsWith(STORAGE_PREFIX));
    if (keys.length > 0) {
        await removeLocal(keys);
    }
    return {
        cleared: keys.length,
        count: 0,
    };
}

export async function deleteProdMemoCache(alphaId) {
    const normalizedId = normalizeAlphaId(alphaId);
    if (!normalizedId) {
        throw new Error('Alpha ID 不能为空。');
    }

    const key = `${STORAGE_PREFIX}${normalizedId}`;
    const all = await getAllLocal();
    const existed = Object.prototype.hasOwnProperty.call(all, key);
    if (existed) {
        await removeLocal([key]);
    }

    return {
        alphaId: normalizedId,
        deleted: existed ? 1 : 0,
        count: (await getProdMemoCache()).count,
    };
}
