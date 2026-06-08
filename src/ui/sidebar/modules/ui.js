export function setStatus(message, mode = '') {
    const el = document.getElementById('globalStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = mode || '';
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatNow() {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function downloadBytes(filename, bytes, mime = 'application/octet-stream') {
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

export function downloadText(filename, text) {
    downloadBytes(filename, text, 'application/json;charset=utf-8');
}

export function bindTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panels = Array.from(document.querySelectorAll('.panel'));
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const key = tab.dataset.tab;
            tabs.forEach((item) => item.classList.toggle('is-active', item === tab));
            panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === key));
        });
    });
}
