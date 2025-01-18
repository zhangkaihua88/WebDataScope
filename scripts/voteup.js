let csrfToken = null;
let upCount = 0;

function logCount() {
    document.getElementById("logCount").innerHTML = "本次已点赞" + upCount + "个";
}
function updateButton(buttonId, buttonText) {
    let startButton = document.getElementById(buttonId);
    startButton.innerText = buttonText;
    startButton.style.cursor = "default";
    startButton.setAttribute("disabled", true);
}

function resetButton(buttonId, buttonText) {
    let startButton = document.getElementById(buttonId);
    startButton.innerText = buttonText;
    startButton.style.cursor = "pointer";
    startButton.removeAttribute("disabled");
}
async function _upVoteComment(commentId) {
    const response = await fetch(window.location.origin + window.location.pathname + "/comments/" + commentId + "/vote", {
        "headers": {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-csrf-token": csrfToken,
            "x-requested-with": "XMLHttpRequest"
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": "value=up",
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    });
    const data = await response.json();
    return data;
}
async function _upVotePost() {
    const response = await fetch(window.location.origin + window.location.pathname + "/vote", {
        "headers": {
            "accept": "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-csrf-token": csrfToken,
            "x-requested-with": "XMLHttpRequest"
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": "value=up",
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    });
    const data = await response.json();
    return data;
}


async function fetchCsrfToken() {
    // Fetch CSRF token
    try {
        const response = await fetch("https://support.worldquantbrain.com/hc/api/internal/csrf_token.json", {
            "referrerPolicy": "strict-origin-when-cross-origin",
            "body": null,
            "method": "GET",
            "mode": "cors",
            "credentials": "include"
        });
        if (!response.ok) {
            throw new Error("Network response was not ok");
        }
        const data = await response.json();
        csrfToken = data.current_session.csrf_token;  // 设置全局变量
        console.log("CSRF Token:", csrfToken);

        return csrfToken;
    } catch (error) {
        console.error("Fetch error:", error);
    }
}




// 菜单 menu
function createStartMenu() {
    let baseMenu = document.createElement("div");
    var baseInfo = "";
    baseInfo += "<form id=\"settingData\" class=\"egg_menu\" action=\"\" target=\"_blank\" onsubmit=\"return false\">"
    baseInfo += "<div class=\"egg_setting_box\">"
    // baseInfo += "<div class=\"egg_setting_item\"><label>Pin Shares      <\/label><input class=\"egg_setting_switch\" type=\"checkbox\" name=\"0\"" + 'checked' + "\/><\/div>"

    baseInfo += "<hr \/>"
    baseInfo += "<a style=\"text-decoration: none;\"><div style=\"color:#5F5F5F;font-size:14px;\" class=\"egg_setting_item\"><label style=\"cursor: default;\" id=\"logCount\">本次已点赞 0 个<\/label><\/div><\/a>"
    baseInfo += "<\/form>";
    baseMenu.innerHTML = baseInfo;
    let body = document.getElementsByTagName("body")[0];
    body.append(baseMenu)

    let startButton = document.createElement("button");
    startButton.setAttribute("id", "upVoteSinglePostButton");
    startButton.innerText = "开始点赞该条帖子";
    startButton.className = "egg_study_btn egg_menu";
    //添加事件监听
    startButton.addEventListener("click", upVoteSinglePost, false);
    //插入节点
    body.append(startButton)
}



async function upVoteSinglePost() {
    await fetchCsrfToken();
    updateButton("upVoteSinglePostButton", "正在点赞...");

    // const buttons = document.querySelectorAll('button[aria-pressed="false"][aria-label="This post was helpful"]');

    await upVoteSinglePostBody(document);
    await upVoteSinglePostComment(document);
    let nextLink = document.querySelector('a.pagination-next-link');
    if (nextLink) {
        await fetchNextCommentPage(nextLink.href);  // Recursively call the function for the next page
    }

    resetButton("upVoteSinglePostButton", "开始点赞该条帖子");
}

async function fetchNextCommentPage(url) {
    try {
        let response = await fetch(url);  // Use await with fetch
        let html = await response.text();  // Await for the response text

        let parser = new DOMParser();
        let newDoc = parser.parseFromString(html, 'text/html');
        console.log(newDoc);

        await upVoteSinglePostComment(newDoc);  // Use await to wait for this async function to finish

        let nextLink = newDoc.querySelector('a.pagination-next-link');
        if (nextLink) {
            await fetchNextCommentPage(nextLink.href);  // Recursively call the function for the next page
        }
    } catch (error) {
        console.error('Error fetching the page:', error);
    }
}

async function upVoteSinglePostBody(document) {
    let buttonList = document.querySelectorAll('button[aria-pressed="false"][aria-label="This post was helpful"]');
    for (let itemButton of buttonList) {
        let itemData = await _upVotePost();
        // 检查返回的值
        if (itemData["value"] === "up") {
            upCount += 1;
            console.log("点赞成功:", itemButton);
            logCount();
        }
    }
    console.log(upCount);  // 打印“up”状态的评论数量
}

async function upVoteSinglePostComment(document) {
    let buttonList = document.querySelectorAll('button[aria-pressed="false"][aria-label="This comment was helpful"]');
    for (let itemButton of buttonList) {
        let parentLi = itemButton.closest('li');
        if (parentLi) {
            let parentId = parentLi.id;
            if (parentId && parentId.startsWith('community_comment_')) {
                let commentId = parentId.split('comment_')[1];
                // 使用 await 调用异步函数
                let itemData = await _upVoteComment(commentId);
                // 检查返回的值
                if (itemData["value"] === "up") {
                    upCount += 1;
                    console.log("点赞成功:", commentId);
                    logCount();
                }
            }
        }
    }
    console.log(upCount);  // 打印“up”状态的评论数量
}



// Use MutationObserver to watch for DOM changes
function voteUpMain() {
    observer.disconnect();
    chrome.storage.local.get(['WQPHiddenFeatureEnabled'], (result) => {
        if (result.WQPHiddenFeatureEnabled) {
            // 如果为 true，则执行特定代码
            console.log('隐藏功能已启用');
            createStartMenu();
        }
    });

}

const observer = new MutationObserver(() => {
    if (document.querySelector("#user-nav > a:nth-child(2)")) {
        voteUpMain()
    }
});

// Configure the MutationObserver
observer.observe(document.body, { childList: true, subtree: true });