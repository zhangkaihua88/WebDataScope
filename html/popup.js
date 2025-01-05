

// 获取 HTML 元素
const dbAddressInput = document.getElementById('dbAddress');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('status');

// 加载已保存的 API 地址
function loadApiAddress() {
  chrome.storage.sync.get(['apiAddress'], (result) => {
    if (result.apiAddress) {
      dbAddressInput.value = result.apiAddress; // 将值显示在输入框中
    }
  });
}

// 保存 API 地址
function saveApiAddress() {
  const apiAddress = dbAddressInput.value.trim();
  if (apiAddress) {
    chrome.storage.local.set({ apiAddress }, () => {
      statusText.textContent = '地址已保存！';
      setTimeout(() => {
        statusText.textContent = '';
      }, 2000);
    });
  } else {
    statusText.textContent = '请输入有效的地址！';
    setTimeout(() => {
      statusText.textContent = '';
    }, 2000);
  }
}

// 事件绑定
saveBtn.addEventListener('click', saveApiAddress);

// 页面加载时初始化
loadApiAddress();