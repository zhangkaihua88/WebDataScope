// simulate.js: 在 WQ Simulate 页面底部工具栏中插入速率限制进度条，并根据
// https://api.worldquantbrain.com/simulations 响应头实时更新。
// 设计要点：
// 1) 容器容错：页面类名可能变化或尚未渲染，使用主选择器 + 备用选择器查找容器。
// 2) 插入位置：优先插入在 editor-button-container 与 simulate 区块之间；若一端缺失，择优插入同级位置；皆不可用则附加到容器末尾。
// 3) 防抖与防卡顿：插入后避免重复移动同一元素；监听 DOM 变化，当元素被 React 重绘移除后，延时重插并从存储恢复。
// 4) 数据来源：后台脚本广播完整响应记录（含 responseHeaders）；仅在 /simulations 完成事件上解析 x-ratelimit-* 并更新；缺头时不覆盖为 0/0。
// 5) 持久化与初始化：每次更新写入 chrome.storage.local；页面加载或重插后从存储初始化 UI。
console.log('simulate.js loaded');

// 主容器选择器（完整类名）：定位底部工具栏左侧区域
const containerSelector = '.editor-bottom-bar-left-monaco.editor-bottom-bar-left-monaco--isConsultant.editor-bottom-bar-left-monaco--is-code';
// 备用容器选择器（简化类名）：当完整类名不可用时使用
const fallbackContainerSelector = '.editor-bottom-bar-left-monaco';
// 模拟区域块选择器：用于确定插入位置（目标是插在它前面）
const simulateBlockSelector = '.editor-simulate.editor-simulate--isConsultant.editor-simulate--is-code';
// 左侧按钮容器选择器：用于插在它后面
const buttonContainerSelector = '.editor-button-container';
// 本地存储键：保存速率限制状态
const storageKey = 'WQ_SIM_RATE_LIMIT';
const refreshQuotaKey = 'WQ_SIM_REFRESH_QUOTA';

// 查找底部左侧容器，优先完整类名；若失败则使用简化类名
function findContainer() {
    return document.querySelector(containerSelector) || document.querySelector(fallbackContainerSelector) || null;
}

// 创建或返回进度条占位容器及内部结构（仅创建一次）
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

// 将进度条插入到合适位置：
// - 优先：在 simulateBlock 前（位于按钮容器与模拟块之间）
// - 次优：按钮容器后
// - 次优：simulateBlock 前
// - 兜底：容器末尾
// 已在容器下则不重复移动，避免触发多次 Mutation
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

// 观察 DOM 变化，若占位容器被 React 重绘移除，则延时补插并恢复上次值
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

// 将响应头数组转为小写键的 Map，便于读取 x-ratelimit-*
function parseHeaders(headers) {
    const map = {};
    (headers || []).forEach(h => { if (h && h.name) map[h.name.toLowerCase()] = h.value; });
    return map;
}

// 安全转整：缺失或非数字时返回 0
function toInt(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
}

// 更新进度条：
// - 百分比 = remaining / limit
// - 文本 = "remaining / limit"
// - reset 支持两种语义：绝对 epoch 秒或相对秒数
// - 缺失头（0/0）时不覆盖当前显示
// - 每次成功更新写入存储
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

// 监听后台广播的新请求记录，仅处理 /simulations 完成事件
// 注意：后台脚本已将 responseHeaders 透传至页面
try {
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'REQ_MONITOR_NEW') {
            const d = msg.data || {};
            if (d.type === 'completed' && typeof d.url === 'string' && d.url.includes('/simulations')) {
                const h = parseHeaders(d.responseHeaders);
                const limit = toInt(h['x-ratelimit-limit']);
                const remaining = toInt(h['x-ratelimit-remaining']);
                updateRateBar(limit, remaining);
                const loc = h['location'];
                if (autoDeleteWait && d.method === 'POST' && loc && /^https?:\/\//.test(loc)) {
                    autoDeleteWait = false;
                    deleteSimOnce(loc);
                }
            }
        }
    });
} catch (_) { }

// 初始化：从本地存储读取上次配额，避免初始空白
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

// 启动：插入进度条并开始观察
watchAndInsert();


let autoPostedOnce = false;
let autoDeleteWait = false;
const pendingDelete = new Set();
function doSimRequest() {
    hasRemainingRefreshQuota().then(async (ok) => {
        if (!ok) { showHint('每10分钟最多刷新5次'); return; }
        const reserved = await consumeRefreshQuota();
        if (!reserved) { showHint('每10分钟最多刷新5次'); return; }
        setRefreshState('spinning');
        autoDeleteWait = true;
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
                    autoDeleteWait = false;
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

async function deleteSimOnce(url) {
    if (pendingDelete.has(url)) return;
    pendingDelete.add(url);
    try {
        await fetch(url, { method: 'DELETE', headers: { 'Accept': 'application/json;version=2.0' }, credentials: 'include' });
    } catch (_) { }
    pendingDelete.delete(url);
}


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

function setRefreshState(state) {
    const holder = document.getElementById('WQSimulateBetween');
    if (!holder) return;
    const btn = holder.querySelector('.wq-rate-refresh');
    if (!btn) return;
    btn.classList.remove('spinning', 'disabled');
    if (state === 'spinning') { btn.classList.add('spinning', 'disabled'); }
}

function autoCreateAndDeleteSim() {
    if (autoPostedOnce) return;
    autoPostedOnce = true;
    doSimRequest();
}

autoCreateAndDeleteSim();
