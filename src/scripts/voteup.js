// voteup.js: 点赞帖子和评论的脚本
console.log("voteup.js script loaded");

let csrfToken = null;
let upCount = 0;
let upCountFromCache = 0; // 用于缓存上次点赞数量
let quarterStartTime = getStartTime();

// ############################## 通用函数 ##############################

async function getLikedIds() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['WQPLikedIds'], function ({ WQPLikedIds }) {
            resolve(WQPLikedIds || []);
        });
    });
}
async function saveLikedId(id) {
    let WQPLikedIds = await getLikedIds();
    if (!WQPLikedIds.includes(id)) {
        WQPLikedIds.push(id);
        await chrome.storage.local.set({ WQPLikedIds });
    }
}

function getStartTime() {
    const now = new Date();
    const options = { timeZone: 'America/New_York' };
    const easternDate = new Date(now.toLocaleString('en-US', options));

    // 获取当前年份和月份 (世界时)
    const year = easternDate.getUTCFullYear();
    const month = easternDate.getUTCMonth(); // 0 = January, 1 = February, ...

    // 计算当前季度的开始时间 (UTC)
    const quarterStartMonth = Math.floor(month / 3) * 3; // 0 (Q1), 3 (Q2), 6 (Q3), 9 (Q4)
    const quarterStartTime = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0)); // UTC 开始时间

    return quarterStartTime;
}

function logCount() {
    // log the upCount
    document.getElementById("logCount").innerHTML = `本次已点赞 ${upCount} 个 (来自缓存 ${upCountFromCache} 个)`;
}

async function _upVote(url) {
    // 获取 CSRF Token
    let authToken = await getAuth();
    let data;
    try {
        let WQPLikedIds = await getLikedIds();
        if (WQPLikedIds.includes(url)) {
            console.log("已点赞:", url);
            upCountFromCache += 1; // 增加缓存的点赞数量
            upCount += 1;
            logCount();
            return;
        }
        await saveLikedId(url);  // 保存已点赞的ID

        if (authToken) {
            const response = await fetch(url + "/vote", {
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
            data = await response.json();
        } else {
            data = { 'value': 'up' }
        }
        if (data["value"] === "up") {
            upCount += 1;
            console.log("点赞成功:", url);
            logCount();
        }
        return data;
    } catch (error) {
        console.error("点赞失败:", url, error);
        return { error: error.message || error };
    }
}
function _getUrl(url) {
    url = new URL(url);
    let currentUrl = url.origin + url.pathname;
    return currentUrl;
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

// ############################## 点赞单个Post的函数 ##############################
async function upVoteSinglePost() {
    await fetchCsrfToken();
    setButtonState("upVoteSinglePostButton", "正在点赞...",'load');
    // const buttons = document.querySelectorAll('button[aria-pressed="false"][aria-label="This post was helpful"]');
    await upVoteSinglePostBody(document, window.location.href);
    await upVoteSinglePostComment(document, window.location.href);
    let nextLink = document.querySelector('a.pagination-next-link');
    if (nextLink) {
        await fetchNextCommentPage(nextLink.href, 1);  // Recursively call the function for the next page
    }
    setButtonState("upVoteSinglePostButton", "开始点赞该条帖子",'enable');
}

async function fetchNextCommentPage(url, reNum = 0) {
    try {
        // Fetch the next page of comments
        let response = await fetch(url);  // Use await with fetch
        let html = await response.text();  // Await for the response text
        let parser = new DOMParser();
        let newDoc = parser.parseFromString(html, 'text/html');
        console.log(newDoc);

        // Upvote the comments on the page, if any
        // if reNum == 0, upvote the post body
        if (reNum == 0) {
            await upVoteSinglePostBody(newDoc, url);
        }
        await upVoteSinglePostComment(newDoc, url);  // Use await to wait for this async function to finish

        // Check if there is a next page
        let nextLink = newDoc.querySelector('a.pagination-next-link');
        if (nextLink) {
            await fetchNextCommentPage(nextLink.href, reNum + 1);  // Recursively call the function for the next page
        }
    } catch (error) {
        console.error('Error fetching the page:', error);
    }
}

async function upVoteSinglePostBody(document, url) {
    let buttonList = document.querySelectorAll('button[aria-pressed="false"][aria-label="This post was helpful"]');
    for (let itemButton of buttonList) {
        let itemData = await _upVote(_getUrl(url));
        // 检查返回的值
        if (itemData["value"] === "up") {
            console.log("点赞成功:", itemButton);
            logCount();
        }
    }
    console.log(upCount);  // 打印“up”状态的评论数量
}

async function upVoteSinglePostComment(document, url) {
    let buttonList = document.querySelectorAll('button[aria-pressed="false"][aria-label="This comment was helpful"]');
    for (let itemButton of buttonList) {
        let parentLi = itemButton.closest('li');
        if (parentLi) {
            let parentId = parentLi.id;
            if (parentId && parentId.startsWith('community_comment_')) {
                let commentId = parentId.split('comment_')[1];
                // 使用 await 调用异步函数
                let itemData = await _upVote(_getUrl(url) + "/comments/" + commentId);
                // 检查返回的值
                if (itemData["value"] === "up") {
                    console.log("点赞成功:", commentId);
                    logCount();
                }
            }
        }
    }
    console.log(upCount);  // 打印“up”状态的评论数量
}

// ############################## 点赞单个用户的所有帖子和评论 ##############################


async function upVoteSingleUser() {
    await fetchCsrfToken();
    setButtonState("upVoteSingleUserButton", "正在点赞...",'load');
    // await upVoteSingleUserPosts(document, window.location.href);
    // await upVoteSingleUserComments(document, window.location.href);
    let urlPath = window.location.pathname; // 获取路径部分
    let userTag = urlPath.substring(urlPath.lastIndexOf('/') + 1); // 获取最后一段
    console.log(userTag);
    await _upVoteSingleUser(userTag);

    setButtonState("upVoteSingleUserButton", "开始点赞该用户",'enable');
}

async function upVoteMultiUser() {
    await fetchCsrfToken();
    // userTags 上传用户标签
    // 输入的是一个dict，有键有值，键是名字，值是usertags
    let data = prompt("输入dict", "{}");
    data = JSON.parse(data);
    console.log(data);


    const scripts = document.getElementsByTagName('script');
    let helpCenterData = null;

    for (const script of scripts) {
        if (script.textContent.includes('HelpCenter')) {
            // 使用正则表达式匹配 HelpCenter.user 对象
            const regex = /HelpCenter\.user\s*=\s*({.*?});/s;
            const match = script.textContent.match(regex);
            if (match && match[1]) {
                try {
                    // 解析 JSON 数据
                    const userData = JSON.parse(match[1]);
                    const userName = userData.name;
                    console.log("解析的用户名:", userName);
                    helpCenterData = userName;
                    break;
                } catch (error) {
                    console.error("解析 JSON 失败:", error);
                }
            }
        }
    }

    let infoElem = document.getElementById("egg_setting_info");
    const now = new Date();
    const beijingTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const infoDiv = document.createElement("div");
    infoDiv.innerHTML = `<b>${helpCenterData}: ${beijingTime}</b>`;
    infoElem.parentNode.insertBefore(infoDiv, infoElem);

    for (let [idx, [name, userTag]] of Object.entries(Object.entries(data))) {
        let nameData = await getDataFromUrl(`https://support.worldquantbrain.com/hc/api/internal/communities/mentions.json?query=${name}`);
        if (nameData && nameData.length > 0) {
            if (String(nameData[0].id) === String(userTag)) {
                console.log(`用户 ${name} 的 userTag 已经是 ${userTag}，无需修改。`);
            } else {
                console.log(`用户 ${name} 的 userTag 已经是 ${userTag}，将其修改为 ${nameData[0].id}。`);
                userTag = String(nameData[0].id);  // 更新 userTag
            }
        }

        let displayName = name[0] + '*'.repeat(name.length - 1);
        before_upcont = upCount;
        setButtonState("upVoteMultiUserButton", `正在点赞(${idx}/${Object.keys(data).length} user)... ` + displayName,'load');
        await _upVoteSingleUser(userTag);
        console.log(name, upCount - before_upcont);

        // 多列显示：每5个用户换一行

        let lines = infoElem.innerText.split('\n').filter(Boolean);
        let lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
        if (lastLine.split(" | ").length >= 5) {
            // 新起一行
            lines.push(`${displayName}: ${upCount - before_upcont}`);
        } else if (lines.length === 0) {
            lines = [`${displayName}: ${upCount - before_upcont}`];
        } else {
            lines[lines.length - 1] += ` | ${displayName}: ${upCount - before_upcont}`;
        }
        infoElem.innerText = lines.join('\n');
    }

    setButtonState("upVoteMultiUserButton", `批量点赞用户完成(共${Object.keys(data).length} user)`,'enable');
}

async function _upVoteSingleUser(userTag) {
    let userPostUrl = "https://support.worldquantbrain.com/hc/en-us/profiles/" + userTag + "?sort_by=recent_user_activity&filter_by=posts";
    await upVoteSingleUserPosts(userPostUrl);

    let userCommentUrl = "https://support.worldquantbrain.com/hc/en-us/profiles/" + userTag + "?sort_by=recent_user_activity&filter_by=comments";
    await upVoteSingleUserComments(userCommentUrl);
}

async function upVoteSingleUserPosts(url) {
    nextTag = true;
    let response = await fetch(url);  // Use await with fetch
    let html = await response.text();  // Await for the response text
    let parser = new DOMParser();
    let newDoc = parser.parseFromString(html, 'text/html');
    console.log(newDoc);


    let postList = newDoc.querySelectorAll('.profile-contribution');
    for (let item of postList) {
        let href = item.querySelector('.profile-contribution-title>a').href;
        let postTime = new Date(item.querySelector('time').dateTime)
        if (postTime >= quarterStartTime) {
            await _upVote(href);
        } else {
            nextTag = false;
            break;
        }
    }
    let nextLink = newDoc.querySelector('a.pagination-next-link');
    if (nextLink && nextTag) {
        await upVoteSingleUserPosts(nextLink.href);  // Recursively call the function for the next page
    }
}

async function upVoteSingleUserComments(url) {
    nextTag = true;
    let response = await fetch(url);  // Use await with fetch
    let html = await response.text();  // Await for the response text
    let parser = new DOMParser();
    let newDoc = parser.parseFromString(html, 'text/html');
    console.log(newDoc);


    let commentList = newDoc.querySelectorAll('.comment-link');
    for (let item of commentList) {
        let parentLi = item.closest('li');
        let siblings = Array.from(parentLi.parentElement.children).filter(el => el !== parentLi);
        let siblingWithTime = siblings.find(sibling => sibling.querySelector('time'));
        let commentTime = new Date(siblingWithTime.querySelector('time').dateTime)
        if (commentTime >= quarterStartTime) {
            await _upVote(item.href);
        } else {
            nextTag = false;
            break;
        }
        // console.log(commentTime, quarterStartTime, commentTime >= quarterStartTime);
    }

    let nextLink = newDoc.querySelector('a.pagination-next-link');
    if (nextLink && nextTag) {
        await upVoteSingleUserComments(nextLink.href);  // Recursively call the function for the next page
    }
}

// ############################## 菜单 ##############################
function createStartMenu() {
    let baseMenu = document.createElement("div");
    baseMenu.classList.add("egg_setting_box");
    var baseInfo = "";
    baseInfo += "<form id=\"settingData\" class=\"egg_menu\" action=\"\" target=\"_blank\" onsubmit=\"return false\">"
    baseInfo += "<div>"
    // baseInfo += "<div class=\"egg_setting_item\"><label>Pin Shares      <\/label><input class=\"egg_setting_switch\" type=\"checkbox\" name=\"0\"" + 'checked' + "\/><\/div>"

    // baseInfo += "<hr \/>"
    baseInfo += "<a style=\"text-decoration: none;\"><div style=\"color:#5F5F5F;font-size:14px;\" class=\"egg_setting_item\"><label style=\"cursor: default;\" id=\"logCount\">本次已点赞 0 个<\/label><\/div><\/a>"
    baseInfo += "<\/form>";
    baseMenu.innerHTML = baseInfo;


    let baseButtons = document.createElement("div");
    baseButtons.classList.add("egg_button_container");

    let startButton = document.createElement("button");
    startButton.setAttribute("id", "upVoteSinglePostButton");
    startButton.innerText = "开始点赞该条帖子";
    startButton.className = "egg_study_btn egg_menu";
    //添加事件监听
    startButton.addEventListener("click", upVoteSinglePost, false);
    //插入节点
    baseButtons.append(startButton)




    startButton = document.createElement("button");
    startButton.setAttribute("id", "upVoteSingleUserButton");
    startButton.innerText = "开始点赞该用户";
    startButton.className = "egg_study_btn egg_menu";
    //添加事件监听
    startButton.addEventListener("click", upVoteSingleUser, false);
    //插入节点
    baseButtons.append(startButton)


    startButton = document.createElement("button");
    startButton.setAttribute("id", "upVoteMultiUserButton");
    startButton.innerText = "开始批量点赞用户";
    startButton.className = "egg_study_btn egg_menu";
    //添加事件监听
    startButton.addEventListener("click", upVoteMultiUser, false);
    //插入节点
    baseButtons.append(startButton)

    // 添加清空点赞记录按钮
    let clearButton = document.createElement("button");
    clearButton.setAttribute("id", "clearLikedIdsButton");
    clearButton.innerText = "清空点赞记录";
    clearButton.className = "egg_study_btn egg_menu";
    clearButton.addEventListener("click", clearLikedIds, false);
    baseButtons.append(clearButton);


    // 添加一个p标签可以通过id往里面插入内容
    let p = document.createElement("p");
    p.setAttribute("id", "egg_setting_info");
    p.innerText = "";
    baseButtons.append(p);



    baseMenu.append(baseButtons);
    let body = document.getElementsByTagName("body")[0];
    body.append(baseMenu)
}

// 清空点赞记录函数
function clearLikedIds() {
    if (confirm('确定要清空所有点赞记录吗？此操作不可恢复。')) {
        if (confirm('请再次确认，是否真的要清空所有点赞记录？')) {
            chrome.storage.local.remove('WQPLikedIds', function () {
                alert('点赞记录已清空！');
                upCount = 0;
                logCount();
            });
        }
    }
}

// Use MutationObserver to watch for DOM changes
function voteUpMain() {
    // observer.disconnect();
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        if (WQPSettings.hiddenFeatureEnabled) {
            // 如果为 true，则执行特定代码
            console.log('隐藏功能已启用');
            createStartMenu();
        }
    });

}
voteUpMain()
// const observer = new MutationObserver(() => {
//     if (document.querySelector("#user-nav > a:nth-child(2)")) {
//         voteUpMain()
//     }
// });

// // Configure the MutationObserver
// observer.observe(document.body, { childList: true, subtree: true });
