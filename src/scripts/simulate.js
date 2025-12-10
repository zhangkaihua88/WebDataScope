// 入口概览：
// - 加载后：插入进度条、恢复显示、监听 DOM
// - 监听后台：/simulations 完成时根据响应头更新配额（不删除正常模拟）
// - 刷新按钮：触发一次模拟，仅删除本次刷新产生的模拟，用于刷新配额
// - 限流策略：10 分钟最多刷新 5 次（持久化）
console.log('simulate.js loaded');

// 页面元素选择器：定位工具栏与插入位置
const containerSelector = '.editor-bottom-bar-left-monaco.editor-bottom-bar-left-monaco--isConsultant.editor-bottom-bar-left-monaco--is-code';
const fallbackContainerSelector = '.editor-bottom-bar-left-monaco';
const simulateBlockSelector = '.editor-simulate.editor-simulate--isConsultant.editor-simulate--is-code';
const buttonContainerSelector = '.editor-button-container';
// 本地存储键：配额显示与刷新次数
const storageKey = 'WQ_SIM_RATE_LIMIT';
const refreshQuotaKey = 'WQ_SIM_REFRESH_QUOTA';

// 查找底部工具栏容器：优先完整类名，找不到则降级简化类名
function findContainer() {
    return document.querySelector(containerSelector) || document.querySelector(fallbackContainerSelector) || null;
}

// 创建进度条占位容器（仅创建一次），并绑定刷新按钮事件
function ensureBar() {
    let holder = document.getElementById('WQSimulateBetween');
    if (!holder) {
        holder = document.createElement('div');
        holder.id = 'WQSimulateBetween';
        holder.className = 'wq-simulate-between';
        const bar = document.createElement('div');
        bar.className = 'wq-rate-limit';
        bar.innerHTML = '<div class="wq-rate-title">Rate Limit</div><div class="wq-rate-track"><div class="wq-rate-fill" style="width:0%"></div><div class="wq-rate-text"></div><span class="wq-rate-refresh" title="刷新"><span class="wq-rate-refresh-icon"><span class="wq-glyph">⟳</span><span class="wq-spinner"></span></span></span></div>';
        holder.appendChild(bar);
    }
    const btn = holder.querySelector('.wq-rate-refresh');
    if (btn) btn.onclick = () => { doSimRequest(); };
    return holder;
}

// 插入进度条到最佳位置（按钮与模拟块之间），避免重复移动
function insertBetweenBar() {
    const container = findContainer();
    if (!container) return;
    const simulateBlock = container.querySelector(simulateBlockSelector);
    const buttonBlock = container.querySelector(buttonContainerSelector);
    const holder = ensureBar();
    if (holder.parentElement === container) return;
    if (simulateBlock && buttonBlock) {
        container.insertBefore(holder, simulateBlock);
    } else if (buttonBlock) {
        buttonBlock.insertAdjacentElement('afterend', holder);
    } else if (simulateBlock) {
        container.insertBefore(holder, simulateBlock);
    } else {
        container.appendChild(holder);
    }
}

// 监听 DOM：当进度条被重绘移除时，延时重插并恢复显示
let reinsertionScheduled = false;
function watchAndInsert() {
    insertBetweenBar();
    initFromStorage();
    const obs = new MutationObserver(() => {
        const exists = !!document.getElementById('WQSimulateBetween');
        if (!exists && !reinsertionScheduled) {
            reinsertionScheduled = true;
            setTimeout(() => {
                insertBetweenBar();
                initFromStorage();
                reinsertionScheduled = false;
            }, 200);
        }
    });
    obs.observe(document.body, { childList: true, subtree: true });
}

// 工具：响应头数组转为小写键字典，便于读取配额头
function parseHeaders(headers) {
    const map = {};
    (headers || []).forEach(h => { if (h && h.name) map[h.name.toLowerCase()] = h.value; });
    return map;
}

// 工具：安全转整，非法返回 0
function toInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
}

// 更新配额 UI：填充进度与文本；0/0 时不覆盖；成功后写入存储
function updateRateBar(limit, remaining) {
    if (limit === 0 && remaining === 0) return;
    const holder = document.getElementById('WQSimulateBetween');
    if (!holder) return;
    const fill = holder.querySelector('.wq-rate-fill');
    const text = holder.querySelector('.wq-rate-text');
    const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round(remaining / limit * 100))) : 0;
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = remaining + ' / ' + limit;
    try {
        chrome.storage?.local?.set({ [storageKey]: { limit, remaining, updatedAt: Date.now() } });
    } catch (_) { }
}

// 后台事件监听：当 /simulations 完成时基于响应头更新配额（不做删除）
try {
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'REQ_MONITOR_NEW') {
            const d = msg.data || {};
            if (d.type === 'completed' && typeof d.url === 'string' && d.url.includes('/simulations')) {
                const h = parseHeaders(d.responseHeaders);
                const limit = toInt(h['x-ratelimit-limit']);
                const remaining = toInt(h['x-ratelimit-remaining']);
                updateRateBar(limit, remaining);
            }
        }
    });
} catch (_) { }

// 初始化显示：从本地存储恢复配额，避免初始空白
function initFromStorage() {
    try {
        chrome.storage?.local?.get(storageKey, (obj) => {
            if (obj && obj[storageKey]) {
                const s = obj[storageKey];
                updateRateBar(toInt(s.limit), toInt(s.remaining));
            }
        });
    } catch (_) { }
}

// 启动：插入进度条、恢复显示、监听 DOM
watchAndInsert();

// 刷新场景控制：只在我们主动刷新时创建并随后删除该次模拟
let autoPostedOnce = false;
const pendingDelete = new Set();

// 刷新按钮：检查并消费刷新额度，触发一次模拟，仅删除本次刷新
function doSimRequest() {
    hasRemainingRefreshQuota().then(async (ok) => {
        if (!ok) { showHint('每10分钟最多刷新5次'); return; }
        const reserved = await consumeRefreshQuota();
        if (!reserved) { showHint('每10分钟最多刷新5次'); return; }
        setRefreshState('spinning');
        const payload = {
            type: 'REGULAR',
            settings: {
                maxTrade: 'ON',
                nanHandling: 'ON',
                instrumentType: 'EQUITY',
                delay: 1,
                universe: 'TOP3000',
                truncation: 0.08,
                unitHandling: 'VERIFY',
                testPeriod: 'P0D',
                pasteurization: 'ON',
                region: 'USA',
                language: 'FASTEXPR',
                decay: 0,
                neutralization: 'SUBINDUSTRY',
                visualization: false
            },
            regular: 'close'
        };

        const opts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json;version=2.0',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            body: JSON.stringify(payload),
            credentials: 'include'
        };
        try {
            fetch('https://api.worldquantbrain.com/simulations', opts).then((res) => {
                const loc = res.headers?.get('Location');
                if (loc) {
                    deleteSimOnce(loc);
                }
                setRefreshState('idle');
            }).catch((e) => {
                setRefreshState('idle');
            });
        } catch (e) {
            setRefreshState('idle');
        }
    });
}

// 删除一次模拟（幂等）：用于清理“刷新用”模拟
async function deleteSimOnce(url) {
    if (pendingDelete.has(url)) return;
    pendingDelete.add(url);
    try {
        await fetch(url, { method: 'DELETE', headers: { 'Accept': 'application/json;version=2.0' }, credentials: 'include' });
    } catch (_) { }
    pendingDelete.delete(url);
}

// 刷新限流：是否仍有余量（10 分钟滑窗内 < 5 次）
function hasRemainingRefreshQuota() {
    return new Promise((resolve) => {
        try {
            chrome.storage?.local?.get(refreshQuotaKey, (obj) => {
                const now = Date.now();
                let arr = [];
                if (obj && obj[refreshQuotaKey] && Array.isArray(obj[refreshQuotaKey].times)) {
                    arr = obj[refreshQuotaKey].times;
                }
                arr = arr.filter(ts => now - ts < 600000);
                resolve(arr.length < 5);
            });
        } catch (_) {
            resolve(false);
        }
    });
}

// 刷新限流：消费一次并写回存储（超限返回 false）
function consumeRefreshQuota() {
    return new Promise((resolve) => {
        try {
            chrome.storage?.local?.get(refreshQuotaKey, (obj) => {
                const now = Date.now();
                let arr = [];
                if (obj && obj[refreshQuotaKey] && Array.isArray(obj[refreshQuotaKey].times)) {
                    arr = obj[refreshQuotaKey].times;
                }
                arr = arr.filter(ts => now - ts < 600000);
                if (arr.length >= 5) {
                    chrome.storage?.local?.set({ [refreshQuotaKey]: { times: arr } }, () => resolve(false));
                    return;
                }
                arr.push(now);
                chrome.storage?.local?.set({ [refreshQuotaKey]: { times: arr } }, () => resolve(true));
            });
        } catch (_) {
            resolve(false);
        }
    });
}

// 在进度条中展示 2 秒提示
function showHint(text) {
    const holder = document.getElementById('WQSimulateBetween');
    if (!holder) return;
    const track = holder.querySelector('.wq-rate-track');
    if (!track) return;
    const prev = holder.querySelector('.wq-rate-hint');
    if (prev) prev.remove();
    const hint = document.createElement('div');
    hint.className = 'wq-rate-hint';
    hint.textContent = text;
    track.appendChild(hint);
    setTimeout(() => { hint.remove(); }, 2000);
}

// 刷新按钮的 loading/idle 状态切换
function setRefreshState(state) {
    const holder = document.getElementById('WQSimulateBetween');
    if (!holder) return;
    const btn = holder.querySelector('.wq-rate-refresh');
    if (!btn) return;
    btn.classList.remove('spinning', 'disabled');
    if (state === 'spinning') { btn.classList.add('spinning', 'disabled'); }
}

// 页面加载后自动刷新一次（只触发一次），尽快拿到配额显示
function autoCreateAndDeleteSim() {
    if (autoPostedOnce) return;
    autoPostedOnce = true;
    doSimRequest();
}

autoCreateAndDeleteSim();
