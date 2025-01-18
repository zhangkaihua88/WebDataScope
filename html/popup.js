

// 获取 HTML 元素
const dbAddressInput = document.getElementById('dbAddress');
const hiddenFeatureCheckbox = document.getElementById('hiddenFeature');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('status');

function loadSettings() {
    chrome.storage.local.get(['WQPApiAddress', 'WQPHiddenFeatureEnabled'], (result) => {
        console.log(result);
        if (result.WQPApiAddress) {
            dbAddressInput.value = result.WQPApiAddress;
        }
        hiddenFeatureCheckbox.checked = result.WQPHiddenFeatureEnabled || false;
    });
}

function saveSettings() {
    const WQPApiAddress = dbAddressInput.value.trim();
    const WQPHiddenFeatureEnabled = hiddenFeatureCheckbox.checked;
    console.log(WQPApiAddress, WQPHiddenFeatureEnabled);

    if (WQPApiAddress) {
        chrome.storage.local.set({ WQPApiAddress, WQPHiddenFeatureEnabled }, () => {
            statusText.textContent = '设置已保存！';
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
saveBtn.addEventListener('click', saveSettings);

// 页面加载时初始化
loadSettings();