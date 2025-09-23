// requestMonitorUI.js: 在目标页面右下角展示匹配 api.worldquantbrain.com 的请求列表（会话级，非持久化）
(function () {
  // 仅注入一次
  if (window.__WQS_REQ_UI__) return;
  window.__WQS_REQ_UI__ = true;

  const MAX_ITEMS = 100;
  const container = document.createElement('div');
  container.id = 'wqs-request-monitor';
  container.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'right: 12px',
    'bottom: 12px',
    'width: 420px',
    'max-height: 50vh',
    'background: rgba(17, 24, 39, 0.92)',
    'color: #E5E7EB',
    'font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    'border: 1px solid rgba(255,255,255,0.1)',
    'border-radius: 8px',
    'box-shadow: 0 10px 30px rgba(0,0,0,0.35)',
    'overflow: hidden'
  ].join(';');

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(31,41,55,0.95);border-bottom:1px solid rgba(255,255,255,0.08)">
      <strong style="font-size:12px;color:#F3F4F6;">API 请求监视器 · api.worldquantbrain.com</strong>
      <span id="wqs-req-count" style="margin-left:auto;background:#374151;color:#E5E7EB;padding:2px 6px;border-radius:10px;">0</span>
      <button id="wqs-req-collapse" title="折叠/展开" style="background:#4B5563;color:#F9FAFB;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;">折叠</button>
      <button id="wqs-req-clear" title="清空" style="background:#DC2626;color:white;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;">清空</button>
    </div>
    <div id="wqs-req-list" style="max-height:calc(50vh - 42px);overflow:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead style="position:sticky;top:0;background:#111827">
          <tr style="text-align:left;color:#9CA3AF">
            <th style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);width:68px">状态</th>
            <th style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);width:54px">方法</th>
            <th style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);">URL</th>
            <th style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);width:100px">时间</th>
          </tr>
        </thead>
        <tbody id="wqs-req-tbody"></tbody>
      </table>
    </div>
  `;

  document.documentElement.appendChild(container);

  const tbody = container.querySelector('#wqs-req-tbody');
  const countTag = container.querySelector('#wqs-req-count');
  const btnClear = container.querySelector('#wqs-req-clear');
  const btnCollapse = container.querySelector('#wqs-req-collapse');
  const listWrap = container.querySelector('#wqs-req-list');

  let collapsed = false;
  let records = [];
  let EXCLUDED_PREFIXES = [];

  function formatTime(ts) {
    const d = new Date(ts);
    return [
      d.getHours().toString().padStart(2, '0'),
      d.getMinutes().toString().padStart(2, '0'),
      d.getSeconds().toString().padStart(2, '0')
    ].join(':');
  }

  function render() {
    countTag.textContent = String(records.length);
    tbody.innerHTML = '';
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px dashed rgba(255,255,255,0.06)';
      const statusColor = r.type === 'completed'
        ? (r.statusCode >= 200 && r.statusCode < 400 ? '#10B981' : '#F59E0B')
        : '#60A5FA';
      const hasBody = (r.method || '').toUpperCase() === 'POST' && typeof r.body === 'string' && r.body.length > 0;
      const bodyBtnHtml = hasBody
        ? `<button class="wqs-body-btn" data-body="${encodeURIComponent(r.body.slice(0, 4000))}" title="点击复制，悬浮预览" style="margin-left:6px;background:#374151;color:#E5E7EB;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">Body</button>`
        : '';

      tr.innerHTML = `
        <td style="padding:6px 10px;color:${statusColor}">${r.type === 'completed' ? r.statusCode : '→'}</td>
        <td style="padding:6px 10px;color:#E5E7EB">${r.method || ''}</td>
  <td style="padding:6px 10px;max-width:260px;word-break:break-all;color:#D1D5DB">${(r.url||'').replace(/^[a-z]+:\/\//i,'')}${r._dupCnt && r._dupCnt>1 ? (' <span class=\"wqs-dup\" style=\"color:#9CA3AF\">×'+r._dupCnt+'</span>') : ''}${bodyBtnHtml}</td>
        <td style="padding:6px 10px;color:#9CA3AF">${formatTime(r.time)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  btnClear.addEventListener('click', () => {
    records = [];
    render();
  });

  btnCollapse.addEventListener('click', () => {
    collapsed = !collapsed;
    listWrap.style.display = collapsed ? 'none' : 'block';
    btnCollapse.textContent = collapsed ? '展开' : '折叠';
  });

  function isExcluded(url) {
    if (!url) return false;
    return Array.isArray(EXCLUDED_PREFIXES) && EXCLUDED_PREFIXES.some(p => typeof p === 'string' && url.startsWith(p));
  }

  function pushRecord(rec) {
    if (!rec || !rec.url) return;
    if (isExcluded(rec.url)) return; // 双保险过滤
    // 根据 方法+完整URL 去重：同一链接同一方法视为同一条，不同方法分别统计
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (r.url === rec.url && (r.method || '') === (rec.method || '')) {
        r._dupCnt = (r._dupCnt || 1) + 1;
        // 如为 completed 则覆盖状态码与时间
        if (rec.type === 'completed') {
          r.type = rec.type;
          r.statusCode = rec.statusCode;
        }
        // 若为 POST，更新最新 body
        if ((rec.method || '').toUpperCase() === 'POST' && typeof rec.body === 'string') {
          r.body = rec.body;
        }
        r.time = rec.time;
        if (!collapsed) render();
        return;
      }
    }
    // 不存在则添加
  rec._dupCnt = 1;
    records.push(rec);
    if (records.length > MAX_ITEMS) records.shift();
    if (!collapsed) render();
  }

  // 获取最近的历史
  try {
    // 请求后台返回的排除列表（常量定义，仍保留接口以保持解耦）
    chrome.runtime.sendMessage({ type: 'REQ_MONITOR_GET_EXCLUDED' }, (r1) => {
      if (r1 && r1.ok && Array.isArray(r1.data)) EXCLUDED_PREFIXES = r1.data;
      chrome.runtime.sendMessage({ type: 'REQ_MONITOR_GET_RECENT' }, (resp) => {
        if (resp && resp.ok && Array.isArray(resp.data)) {
          records = [];
          for (const it of resp.data) pushRecord(it);
          render();
        }
      });
    });
  } catch (e) { /* ignore */ }

  // 监听新记录
  chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'REQ_MONITOR_NEW' && msg.data && String(msg.data.url).includes('api.worldquantbrain.com')) {
      pushRecord(msg.data);
    }
  });

  // 创建并管理悬浮预览气泡
  const tooltip = document.createElement('div');
  tooltip.id = 'wqs-body-tooltip';
  tooltip.style.cssText = [
    'position: fixed',
    'z-index: 2147483648',
    'display: none',
    'max-width: 520px',
    'max-height: 40vh',
    'overflow: auto',
    'background: rgba(17,24,39,0.98)',
    'color: #E5E7EB',
    'border: 1px solid rgba(255,255,255,0.12)',
    'border-radius: 8px',
    'box-shadow: 0 10px 30px rgba(0,0,0,0.45)',
    'padding: 10px',
    'white-space: pre-wrap',
    'font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  ].join(';');
  document.documentElement.appendChild(tooltip);

  function showTooltipNear(el, text) {
    tooltip.textContent = text || '';
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;
    // 简单防溢出
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    tooltip.style.display = 'block';
    // 临时显示后拿到尺寸
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    if (left + tw + 10 > vw) left = Math.max(10, vw - tw - 10);
    if (top + th + 10 > vh) top = Math.max(10, rect.top - th - margin);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  // 事件委托：悬浮预览 + 点击复制
  container.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('wqs-body-btn')) {
      try {
        const body = decodeURIComponent(t.getAttribute('data-body') || '');
        showTooltipNear(t, body);
      } catch (_) { /* ignore */ }
    }
  });
  container.addEventListener('mouseout', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('wqs-body-btn')) hideTooltip();
  });
  container.addEventListener('click', async (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('wqs-body-btn')) {
      try {
        const body = decodeURIComponent(t.getAttribute('data-body') || '');
        await navigator.clipboard.writeText(body);
        const old = t.textContent;
        t.textContent = '已复制';
        setTimeout(() => { t.textContent = old; }, 800);
      } catch (_) { /* ignore */ }
    }
  });
})();
