import { createCommunityPort, sendMessage } from './runtimeClient.js';
import { downloadBytes, downloadText, formatNow, setStatus } from './ui.js';

let communityPort = null;
let running = false;
let currentAction = '';

const DEFAULT_PROGRESS_LABELS = {
    overall: '总进度',
    detail: '当前阶段',
};

const progressNodes = new Map();

function formatLogTime(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function log(message, mode = '') {
    const list = document.getElementById('communityLog');
    if (!list) return;
    const item = document.createElement('li');
    item.textContent = `[${formatLogTime()}] ${message}`;
    if (mode) item.className = mode;
    list.prepend(item);
}

function setSummary(summary) {
    const el = document.getElementById('communitySummary');
    if (!el) return;
    el.innerHTML = '';
    if (!summary) {
        return;
    }
    const parts = [];
    const pushFinite = (key, label) => {
        if (Number.isFinite(summary[key])) parts.push(`${label} ${summary[key]}`);
    };
    pushFinite('liked', '成功');
    pushFinite('skipped', '跳过');
    pushFinite('failed', '失败');
    pushFinite('targets', '目标');
    pushFinite('communities', '社区/分类');
    pushFinite('topics', '帖子');
    pushFinite('comments', '评论');
    pushFinite('articles', '文章');
    pushFinite('updated', '更新');
    if (summary.batchRunLabel) {
        const batchLine = document.createElement('div');
        batchLine.textContent = summary.batchRunLabel;
        el.appendChild(batchLine);
        setBatchRunLabel(summary.batchRunLabel);
    }
    if (currentAction.startsWith('UPVOTE_') && (Number.isFinite(summary.liked) || Number.isFinite(summary.skipped) || Number.isFinite(summary.failed))) {
        setVoteStats({
            total: Number(summary.liked || 0) + Number(summary.skipped || 0),
            fromCache: Number(summary.skipped || 0),
            failed: Number(summary.failed || 0),
        });
    }
    if (Array.isArray(summary.batchUserResults) && summary.batchUserResults.length) {
        const rows = document.getElementById('batchUserRows');
        if (rows && !rows.children.length) {
            summary.batchUserResults.forEach((result) => addBatchUserResult(result));
        }
    }
    const line = document.createElement('div');
    line.textContent = parts.length ? parts.join(' / ') : JSON.stringify(summary);
    el.appendChild(line);

    if (Array.isArray(summary.profiles) && summary.profiles.length) {
        const unique = new Map();
        summary.profiles.forEach((profile) => {
            if (profile?.profileUrl) unique.set(profile.profileUrl, profile);
        });
        unique.forEach((profile) => {
            const row = document.createElement('div');
            row.className = 'profile-link-row';
            const label = document.createElement('span');
            label.textContent = `${profile.label || profile.profileId}: `;
            const link = document.createElement('a');
            link.href = profile.profileUrl;
            link.target = '_blank';
            link.rel = 'noreferrer';
            link.textContent = profile.profileUrl;
            row.appendChild(label);
            row.appendChild(link);
            el.appendChild(row);
        });
    }
}

function setVoteStatsVisible(visible) {
    const el = document.getElementById('voteLiveStats');
    if (el) el.hidden = !visible;
}

function setVoteStats(stats) {
    const el = document.getElementById('voteLiveStats');
    if (!el || !stats) return;
    const total = Number(stats.total || 0);
    const fromCache = Number(stats.fromCache || 0);
    const failed = Number(stats.failed || 0);
    el.hidden = false;
    el.textContent = failed > 0
        ? `本次已点赞 ${total} 个 (来自缓存 ${fromCache} 个，失败 ${failed} 个)`
        : `本次已点赞 ${total} 个 (来自缓存 ${fromCache} 个)`;
}

function resetVoteStats(visible = false) {
    const el = document.getElementById('voteLiveStats');
    if (el) el.textContent = '本次已点赞 0 个 (来自缓存 0 个)';
    setVoteStatsVisible(visible);
}

function resetBatchResults(visible = false) {
    const wrap = document.getElementById('batchUserResults');
    const label = document.getElementById('batchRunLabel');
    const rows = document.getElementById('batchUserRows');
    if (wrap) wrap.hidden = !visible;
    if (label) label.textContent = '';
    if (rows) rows.innerHTML = '';
}

function setBatchRunLabel(labelText) {
    const wrap = document.getElementById('batchUserResults');
    const label = document.getElementById('batchRunLabel');
    if (wrap) wrap.hidden = false;
    if (label) label.textContent = labelText || '';
}

function addBatchUserResult(result) {
    const wrap = document.getElementById('batchUserResults');
    const rows = document.getElementById('batchUserRows');
    if (!wrap || !rows || !result) return;
    wrap.hidden = false;
    const chip = document.createElement('span');
    chip.className = `batch-user-chip${Number(result.failed || 0) > 0 ? ' has-error' : ''}`;
    chip.title = `${result.name || result.maskedName || ''}: 成功 ${result.liked || 0}，缓存 ${result.skipped || 0}，失败 ${result.failed || 0}`;
    chip.textContent = `${result.maskedName || result.name || result.profileId}: ${result.total || 0}`;
    rows.appendChild(chip);
}

function setProgressVisible(visible) {
    const el = document.getElementById('communityProgress');
    if (el) el.hidden = !visible;
}

function createProgressNode(id, label) {
    const container = document.getElementById('communityProgress');
    if (!container) return null;

    const row = document.createElement('div');
    row.className = 'progress-row';
    row.dataset.progressId = id;
    if (id === 'overall') row.classList.add('is-overall');

    const head = document.createElement('div');
    head.className = 'progress-head';

    const labelEl = document.createElement('span');
    labelEl.textContent = label || DEFAULT_PROGRESS_LABELS[id] || id;

    const textEl = document.createElement('span');
    textEl.textContent = '0/0';

    const trackEl = document.createElement('div');
    trackEl.className = 'progress-track';
    trackEl.setAttribute('role', 'progressbar');
    trackEl.setAttribute('aria-label', labelEl.textContent);
    trackEl.setAttribute('aria-valuemin', '0');
    trackEl.setAttribute('aria-valuemax', '100');
    trackEl.setAttribute('aria-valuenow', '0');

    const barEl = document.createElement('div');
    barEl.className = 'progress-fill';

    head.appendChild(labelEl);
    head.appendChild(textEl);
    trackEl.appendChild(barEl);
    row.appendChild(head);
    row.appendChild(trackEl);
    container.appendChild(row);

    const node = { labelEl, textEl, barEl, trackEl };
    progressNodes.set(id, node);
    return node;
}

function getProgressNode(id, label) {
    const progressId = String(id || 'overall');
    return progressNodes.get(progressId) || createProgressNode(progressId, label);
}

function setProgressValue(id, current, total, label) {
    const node = getProgressNode(id, label);
    if (!node) return;

    const safeTotal = Math.max(Number(total) || 0, 0);
    const safeCurrent = Math.min(Math.max(Number(current) || 0, 0), safeTotal || Number(current) || 0);
    const percent = safeTotal > 0 ? Math.min(100, Math.round((safeCurrent / safeTotal) * 100)) : 0;

    if (node.labelEl && label) {
        node.labelEl.textContent = label;
        node.trackEl?.setAttribute('aria-label', label);
    }
    if (node.textEl) node.textEl.textContent = safeTotal > 0 ? `${safeCurrent}/${safeTotal} (${percent}%)` : '处理中';
    if (node.barEl) node.barEl.style.width = `${percent}%`;
    if (node.trackEl) node.trackEl.setAttribute('aria-valuenow', String(percent));
}

function resetProgress(visible = false) {
    const el = document.getElementById('communityProgress');
    if (el) el.innerHTML = '';
    progressNodes.clear();
    setProgressVisible(visible);
    setProgressValue('overall', 0, 0, '总进度');
}

function updateProgress(data) {
    const progress = data?.progress;
    if (progress) {
        setProgressVisible(true);
        const items = Array.isArray(progress) ? progress : [progress];
        items.forEach((item) => {
            setProgressValue(item.id || 'overall', item.current, item.total, item.label);
        });
    }
    if (data?.voteStats) setVoteStats(data.voteStats);
    if (data?.batchRunLabel) setBatchRunLabel(data.batchRunLabel);
    if (data?.batchUserResult) addBatchUserResult(data.batchUserResult);
}

function finishProgress() {
    if (!currentAction.startsWith('CRAWL_')) return;
    progressNodes.forEach((node) => {
        if (node.textEl && node.textEl.textContent !== '0/0') node.textEl.textContent = '完成';
        if (node.barEl) node.barEl.style.width = '100%';
        if (node.trackEl) node.trackEl.setAttribute('aria-valuenow', '100');
    });
}

function setButtonsDisabled(disabled) {
    [
        'connectSupportBtn',
        'crawlFullAllBtn',
        'crawlRecentIncrementalBtn',
        'exportCommunityBtn',
        'exportCommunityCompressedBtn',
        'importCommunityBtn',
        'upvotePostBtn',
        'resolveProfileBtn',
        'upvoteUserBtn',
        'upvoteUsersBtn',
        'clearLikedIdsBtn',
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function ensurePort() {
    if (communityPort) return communityPort;
    communityPort = createCommunityPort((message) => {
        if (message.type === 'progress') {
            updateProgress(message.data);
            log(message.message || JSON.stringify(message.data || {}));
            return;
        }
        if (message.type === 'done') {
            running = false;
            setButtonsDisabled(false);
            if (message.ok) {
                finishProgress();
                setStatus('Community 操作完成。', 'success');
                setSummary(message.data);
                log('完成。', 'success');
            } else {
                setStatus(`Community 操作失败：${message.error}`, 'error');
                log(message.error || '操作失败。', 'error');
            }
        }
        if (message.type === 'disconnect') {
            communityPort = null;
            running = false;
            setButtonsDisabled(false);
            if (message.error) {
                setStatus(`Community 连接已断开：${message.error}`, 'error');
                log(message.error, 'error');
            }
        }
    });
    return communityPort;
}

function runCommunityAction(action, payload) {
    if (running) {
        setStatus('已有 Community 操作正在执行。', 'error');
        return;
    }
    running = true;
    currentAction = action;
    setButtonsDisabled(true);
    setSummary(null);
    resetProgress(action.startsWith('CRAWL_'));
    resetVoteStats(action.startsWith('UPVOTE_'));
    resetBatchResults(action === 'UPVOTE_USERS');
    setStatus('Community 操作执行中...');
    ensurePort().run(action, payload);
}

async function exportCommunity(compressed) {
    const state = await sendMessage('WQP_COMMUNITY_STATE_GET');
    if (!state) throw new Error('没有可导出的社区数据。');
    if (compressed) {
        const packed = msgpack.encode(state);
        const deflated = pako.deflate(packed);
        downloadBytes(`WQP_CommunityState_${formatNow()}.wqcs`, deflated);
    } else {
        downloadText(`WQP_CommunityState_${formatNow()}.json`, JSON.stringify(state, null, 2));
    }
}

async function importCommunity(file) {
    const compressed = /\.wqcs$/i.test(file.name);
    const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取文件失败。'));
        reader.onload = () => resolve(reader.result);
        if (compressed) reader.readAsArrayBuffer(file);
        else reader.readAsText(file, 'utf-8');
    });

    let state;
    if (compressed) {
        const inflated = pako.inflate(new Uint8Array(data));
        state = msgpack.decode(inflated);
    } else {
        state = JSON.parse(data);
    }
    await sendMessage('WQP_COMMUNITY_STATE_SET', { state });
}

function getActiveTabUrl() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(tabs?.[0]?.url || '');
        });
    });
}

function isSupportPostUrl(url) {
    return /^https:\/\/support\.worldquantbrain\.com\/hc\/[^/]+\/community\/posts\//.test(url);
}

function isSupportProfileUrl(url) {
    return /^https:\/\/support\.worldquantbrain\.com\/hc\/[^/]+\/profiles\//.test(url);
}

async function getPostUrlFromInputOrCurrent() {
    const input = document.getElementById('postUrl');
    const current = input.value.trim();
    if (current) return current;
    const activeUrl = await getActiveTabUrl();
    if (!isSupportPostUrl(activeUrl)) {
        throw new Error('当前页面不是 Support 帖子页面，请输入帖子 URL。');
    }
    input.value = activeUrl;
    return activeUrl;
}

async function getProfileInputFromInputOrCurrent() {
    const input = document.getElementById('profileId');
    const current = input.value.trim();
    if (current) return current;
    const activeUrl = await getActiveTabUrl();
    if (!isSupportProfileUrl(activeUrl)) {
        throw new Error('当前页面不是 Support 用户 Profile 页面，请输入 profile id、profile 链接或 WQ ID。');
    }
    input.value = activeUrl;
    return activeUrl;
}

function parseBatchUsers(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('请输入批量用户。');
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
        // Fall through to comma/newline format.
    }
    const items = text
        .split(/[,，\n\r;；]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (!items.length) throw new Error('批量用户输入为空。');
    return items;
}

export function initCommunityPanel() {
    const exportCommunityBtn = document.getElementById('exportCommunityBtn');
    const exportCommunityCompressedBtn = document.getElementById('exportCommunityCompressedBtn');
    const importCommunityBtn = document.getElementById('importCommunityBtn');
    const importCommunityFile = document.getElementById('importCommunityFile');

    document.getElementById('connectSupportBtn').addEventListener('click', () => {
        runCommunityAction('AUTH_SUPPORT', {});
    });

    document.getElementById('crawlFullAllBtn').addEventListener('click', () => {
        runCommunityAction('CRAWL_FULL_ALL', {});
    });

    document.getElementById('crawlRecentIncrementalBtn').addEventListener('click', () => {
        runCommunityAction('CRAWL_RECENT_INCREMENTAL', {});
    });

    exportCommunityBtn.addEventListener('click', async () => {
        try {
            await exportCommunity(false);
            setStatus('社区数据 JSON 导出完成。', 'success');
        } catch (error) {
            setStatus(`导出失败：${error.message}`, 'error');
        }
    });

    exportCommunityCompressedBtn.addEventListener('click', async () => {
        try {
            await exportCommunity(true);
            setStatus('社区数据压缩导出完成。', 'success');
        } catch (error) {
            setStatus(`导出失败：${error.message}`, 'error');
        }
    });

    importCommunityBtn.addEventListener('click', () => {
        importCommunityFile.value = '';
        importCommunityFile.click();
    });

    importCommunityFile.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        importCommunityBtn.disabled = true;
        try {
            await importCommunity(file);
            setStatus('社区数据导入成功。', 'success');
        } catch (error) {
            setStatus(`导入失败：${error.message}`, 'error');
        } finally {
            importCommunityBtn.disabled = false;
            importCommunityFile.value = '';
        }
    });

    document.getElementById('upvotePostBtn').addEventListener('click', async () => {
        try {
            const postUrl = await getPostUrlFromInputOrCurrent();
            runCommunityAction('UPVOTE_POST', { postUrl });
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('resolveProfileBtn').addEventListener('click', async () => {
        try {
            const profileId = await getProfileInputFromInputOrCurrent();
            runCommunityAction('RESOLVE_PROFILE', { profileId });
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('upvoteUserBtn').addEventListener('click', async () => {
        try {
            const profileId = await getProfileInputFromInputOrCurrent();
            runCommunityAction('UPVOTE_USER', { profileId });
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });

    document.getElementById('upvoteUsersBtn').addEventListener('click', () => {
        const raw = document.getElementById('multiUserJson').value.trim();
        let users;
        try {
            users = parseBatchUsers(raw);
        } catch (error) {
            setStatus(error.message, 'error');
            return;
        }
        runCommunityAction('UPVOTE_USERS', { users });
    });

    document.getElementById('clearLikedIdsBtn').addEventListener('click', () => {
        if (!confirm('确定要清空所有点赞记录吗？此操作不可恢复。')) return;
        if (!confirm('请再次确认，是否真的要清空所有点赞记录？')) return;
        runCommunityAction('CLEAR_LIKED_IDS', {});
    });
}
