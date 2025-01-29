// search.js: 用于支持中文搜索功能的脚本
console.log('search.js loaded');

// 获取查询字符串中的 `query` 参数
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 获取 `query` 参数值
const queryValue = getQueryParam('query');

// 检查是否存在 `query` 参数
if (queryValue) {
    // 创建一个按钮
    const button = document.createElement('button');
    button.innerText = '中文搜索: ' + queryValue;
    button.style.padding = '10px';
    button.style.backgroundColor = '#4CAF50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.marginTop = '20px'; // 增加上方间距
    button.style.marginBottom = '20px'; // 增加下方间距
    button.style.display = 'block'; // 使按钮成为块级元素
    button.style.marginLeft = 'auto'; // 左右自动居中
    button.style.marginRight = 'auto'; // 左右自动居中

    // 定位到 h3 元素
    const h3Element = document.querySelector('body main div div aside section h3');

    // 检查是否找到了 h3 元素
    if (h3Element) {
        // 在 h3 元素后插入按钮
        h3Element.insertAdjacentElement('afterend', button);
    }
    // 鼠标悬停时改变按钮颜色
    button.addEventListener('mouseover', function () {
        button.style.backgroundColor = '#45a049'; // 改变为更深的绿色
    });

    button.addEventListener('mouseout', function () {
        button.style.backgroundColor = '#4CAF50'; // 恢复原来的颜色
    });

    // 按钮点击事件
    button.addEventListener('click', function () {
        button.innerText = '加载中...';
        button.disabled = true; // 禁用按钮，防止多次点击
        // 获取存储的 API 地址
        chrome.storage.local.get(['WQPSettings'], ({ WQPSettings }) => {
            const WQPApiAddress = WQPSettings.apiAddress;
            if (WQPApiAddress) {
                // 拼接请求 URL
                const url = `${WQPApiAddress}/search?q=${queryValue}`;

                // 发出请求
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        console.log('请求成功:', data);
                        button.innerText = '请求成功';
                        // 在这里你可以处理返回的数据
                        if (data.results.length === 0) {
                            button.innerText = '没有找到';
                            return;
                        }
                        // 创建h1元素
                        const h1Element = document.createElement('h1');
                        h1Element.className = 'search-results-subheading';
                        h1Element.innerText = `${data.results.length} results for "${queryValue}" in 中文论坛`;
                        // 创建ul元素
                        const ulElement = document.createElement('ul');
                        ulElement.className = 'search-results-list';

                        // 循环遍历结果
                        for (const result of data.results) {
                            const listItemHTML = `
                            <li class="search-result-list-item result-community_post">
                                <h2 class="search-result-title">
                                    <a href="${result.url}" class="results-list-item-link" pcked="1">${result.title}</a>
                                </h2>
                                <article>
                                    <ul class="meta-group">
                                        <li>
                                            <ol class="breadcrumbs search-result-breadcrumbs">
                                                <li title="WorldQuant BRAIN">WorldQuant BRAIN</li>
                                                <li title="Community">Community</li>
                                                <li title="${result.topic}">${result.topic}</li>
                                            </ol>
                                        </li>
                                    </ul>
                                    <div class="search-results-description">${result.context}</div>
                                </article>
                            </li>
                        `;



                            ulElement.innerHTML += listItemHTML;
                        }
                        const pElement = document.createElement('p'); // 空段落
                        pElement.style.marginTop = '200px';  // 上间距
                        // 定位到//*[@id="main-content"]元素
                        const mainContent = document.getElementById('main-content');
                        const firstChild = mainContent.firstChild;
                        mainContent.insertBefore(h1Element, firstChild);
                        mainContent.insertBefore(ulElement, firstChild);
                        mainContent.insertBefore(pElement, firstChild);
                    })
                    .catch(error => {
                        console.error('请求失败:', error);
                        button.innerText = '请求失败';
                    });
            } else {
                console.error('没有找到API地址');
                button.innerText = '没有找到API地址';
                button.disabled = false;
            }
        });
    });
}





