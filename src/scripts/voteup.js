// voteup.js: 点赞帖子和评论的脚本
console.log("voteup.js script loaded");

let csrfToken = null;
let upCount = 0;
let upCountFromCache = 0; // 用于缓存上次点赞数量
let quarterStartTime = getStartTime();
const COMMUNITY_PER_PAGE = 30; // 论坛每页评论数量（用于增量抓取）
const COMMUNITY_CONCURRENCY = 10;  // 正文抓取并发上限


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

async function fetchRetry(url, options = {}) {
    const {
        tries = 3,           // 最大重试次数
        retryDelay = 500,    // 初始等待(ms)
        factor = 2,          // 指数退避因子
        jitter = true,       // 抖动
        init                 // fetch 的可选 init 参数
    } = options;

    let attempt = 0;
    let lastError;
    while (attempt < tries) {
        try {
            const response = await fetch(url, init);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const parser = new DOMParser();
            return parser.parseFromString(html, 'text/html');
        } catch (err) {
            lastError = err;
            attempt += 1;
            if (attempt >= tries) break;
            let delay = retryDelay * Math.pow(factor, attempt - 1);
            if (jitter) delay = delay * (0.8 + Math.random() * 0.4);
            await new Promise(r => setTimeout(r, Math.round(delay)));
        }
    }
    console.error('fetchRetry 失败:', url, lastError);
    throw lastError;
}

// ############################## 点赞单个Post的函数 ##############################
async function upVoteSinglePost() {
    await fetchCsrfToken();
    setButtonState("upVoteSinglePostButton", "正在点赞...", 'load');
    // const buttons = document.querySelectorAll('button[aria-pressed="false"][aria-label="This post was helpful"]');
    await upVoteSinglePostBody(document, window.location.href);
    await upVoteSinglePostComment(document, window.location.href);
    let nextLink = document.querySelector('a.pagination-next-link');
    if (nextLink) {
        await fetchNextCommentPage(nextLink.href, 1);  // Recursively call the function for the next page
    }
    setButtonState("upVoteSinglePostButton", "开始点赞该条帖子", 'enable');
}

async function fetchNextCommentPage(url, reNum = 0) {
    try {
        // Fetch the next page of comments with retry
        let newDoc = await fetchRetry(url);
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
    setButtonState("upVoteSingleUserButton", "正在点赞...", 'load');
    // await upVoteSingleUserPosts(document, window.location.href);
    // await upVoteSingleUserComments(document, window.location.href);
    let urlPath = window.location.pathname; // 获取路径部分
    let userTag = urlPath.substring(urlPath.lastIndexOf('/') + 1); // 获取最后一段
    console.log(userTag);
    await _upVoteSingleUser(userTag);

    setButtonState("upVoteSingleUserButton", "开始点赞该用户", 'enable');
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
        setButtonState("upVoteMultiUserButton", `正在点赞(${idx}/${Object.keys(data).length} user)... ` + displayName, 'load');
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

    setButtonState("upVoteMultiUserButton", `批量点赞用户完成(共${Object.keys(data).length} user)`, 'enable');
}

async function _upVoteSingleUser(userTag) {
    let userPostUrl = "https://support.worldquantbrain.com/hc/en-us/profiles/" + userTag + "?sort_by=recent_user_activity&filter_by=posts";
    await upVoteSingleUserPosts(userPostUrl);

    let userCommentUrl = "https://support.worldquantbrain.com/hc/en-us/profiles/" + userTag + "?sort_by=recent_user_activity&filter_by=comments";
    await upVoteSingleUserComments(userCommentUrl);
}

async function upVoteSingleUserPosts(url) {
    nextTag = true;
    let newDoc = await fetchRetry(url)
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
    let newDoc = await fetchRetry(url);
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

// ############################## 抓取所有文档 ##############################
async function getCommunity() {
    await fetchCsrfToken();
    let response = await fetch("https://support.worldquantbrain.com/hc/en-us/community/topics");
    let html = await response.text();  // Await for the response text
    let parser = new DOMParser();
    let newDoc = parser.parseFromString(html, 'text/html');
    // 获取 #main-content 下的 ul 元素
    const mainUl = newDoc.querySelector('#main-content> ul');
    // 如果找到该元素
    if (mainUl) {
        // 获取所有 a 标签
        const links = mainUl.querySelectorAll('a.blocks-item-link');
        // 存储结果的数组
        const result = [];
        // 遍历每个 a 标签
        links.forEach(link => {
            // 提取标题
            const titleElem = link.querySelector('.blocks-item-title');
            const title = titleElem ? titleElem.textContent.trim() : '';
            // 提取 URL
            const href = link.getAttribute('href') || '';
            const url = href ? new URL(href, response.url).href : '';
            // 提取论坛的id（从 /topics/<id>-slug 中解析）
            const extractTopicId = (fullUrl, baseUrl) => {
                try {
                    const u = new URL(fullUrl || href, baseUrl || response.url);
                    const m = u.pathname.match(/\/topics\/(\d+)/);
                    return m ? m[1] : '';
                } catch (e) {
                    return '';
                }
            };
            const id = extractTopicId(url, response.url);

            // 提取帖子数量和关注者数量
            const metaItems = link.querySelectorAll('.meta-group .meta-data');
            const postsText = metaItems[0] ? metaItems[0].textContent.trim() : '';
            const followersText = metaItems[1] ? metaItems[1].textContent.trim() : '';
            // 从文本中提取纯数字（支持千分位，如 1,234）
            const extractNumber = (s) => {
                if (!s) return 0;
                const m = s.match(/\d[\d,]*/);
                return m ? parseInt(m[0].replace(/,/g, ''), 10) : 0;
            };
            const posts = extractNumber(postsText);
            const followers = extractNumber(followersText);
            // 添加到结果数组
            result.push({
                title,
                url,
                id,
                posts,
                followers
            });
        });
        console.log("抓取到的社区列表:", result);
        return result;
    } else {
        console.log(' 未找到 #main-content > ul 元素 ');
    }
}

async function getTopics(url) {
    let newDoc = await fetchRetry(url);
    // 获取#main-content元素
    const mainContent = newDoc.getElementById('main-content');

    if (mainContent) {
        // 获取#main-content下所有的section元素
        const sections = mainContent.querySelectorAll('section');

        // 存储所有section提取信息的数组
        const sectionData = [];

        // 遍历每个section并提取指定信息
        sections.forEach((section) => {
            // 获取a标签元素
            const aElement = section.querySelector('.striped-list-title');

            // 获取元数据元素
            const metaDataElements = section.querySelectorAll('.meta-data');

            // 获取投票数和评论数
            const countElements = section.querySelectorAll('.striped-list-number');

            // 提取信息（处理可能的null值）
            const hrefRaw = aElement ? aElement.getAttribute('href') : null;
            const absoluteUrl = hrefRaw ? new URL(hrefRaw, url).href : null;
            // 尽量从 URL 中解析帖子 ID
            let id = null;
            if (absoluteUrl) {
                const m = new URL(absoluteUrl).pathname.match(/\/posts\/(\d+)/);
                if (m) id = m[1];
            }
            if (!id && aElement && aElement.id) {
                const parts = aElement.id.split('-');
                id = parts.length > 1 ? parts[1] : aElement.id;
            }
            const title = aElement ? aElement.textContent.trim() : null;
            const author = metaDataElements[0] ? metaDataElements[0].textContent.trim() : null;
            const datetime = section.querySelector('time') ? section.querySelector('time').getAttribute('datetime') : null;
            const voteNum = countElements[0] ? parseInt(countElements[0].textContent, 10) : 0;
            const commentNum = countElements[1] ? parseInt(countElements[1].textContent, 10) : 0;

            // 将提取的信息存入数组
            sectionData.push({
                id,
                url: absoluteUrl,
                title,
                author,
                datetime,
                voteNum,
                commentNum
            });
        });

        // 初始化href变量为空
        let nextUrl = '';
        const paginationNext = newDoc.querySelector('li.pagination-next');
        // 检查元素是否存在，并且其中包含a标签
        if (paginationNext) {
            const link = paginationNext.querySelector('a');
            // 如果a标签存在，获取其href属性值
            if (link) {
                nextUrl = new URL(link.getAttribute('href'), url).href;
            }
        }

        // 输出结果
        console.log('提取到的section信息:', sectionData);
        console.log('下一页', nextUrl);
        // 正确返回数据对象
        return { topics: sectionData, nextUrl };

        // 也可以将结果转换为JSON字符串
        // console.log(JSON.stringify(sectionData, null, 2));
    } else {
        console.log('未找到#main-content元素');
        return { topics: [], nextUrl: '' };
    }
}


async function _getPost(url) {
    let newDoc = await fetchRetry(url);

    const postContent = newDoc.querySelector('div.post-content').outerHTML;

    // 1. 定位目标根元素 #comments
    const commentsContainer = newDoc.getElementById('comments');

    if (commentsContainer) {
        // 2. 获取 #comments 下所有 ul 元素（避免遗漏多组评论列表）
        const commentUlList = commentsContainer.querySelectorAll('li.comment');
        // 3. 存储所有提取的评论数据
        const allCommentsData = [];
        // 4. 遍历每个 ul，处理内部的评论 li
        commentUlList.forEach((li, ulIndex) => {
            // 获取当前 ul 下所有评论 li（匹配 class="comment" 的 li）

            // -------------------------- 提取核心字段 --------------------------
            // ① 评论 li 自身的 ID（如 community_comment_33439329930903）
            const id = li.id ? li.id.split('_')[2] : null;

            // ② 作者信息（名称、链接）
            const authorLink = li.querySelector('.comment-author .community-badge a');
            const author = authorLink ? authorLink.textContent.trim() : null;

            // ④ 评论时间（time 标签的 datetime 属性）
            const commentTime = li.querySelector('.meta-data time');
            const commentTimeDatetime = commentTime ? commentTime.getAttribute('datetime') : null;

            // ⑤ 评论内容（comment-body 内的文本，保留换行格式）
            const commentBody = li.querySelector('.comment-body');
            const commentContent = commentBody ? commentBody.innerHTML : null;

            // ⑥ 评论投票数（vote-sum 文本，转为数字）
            const voteSumElement = li.querySelector('.vote-sum');
            const voteNum = voteSumElement ? parseInt(voteSumElement.textContent.trim(), 10) : 0;

            // -------------------------- 整理数据结构 --------------------------
            allCommentsData.push({
                id,
                author,
                commentTimeDatetime,   // 评论时间（原始datetime）
                commentContent,        // 评论内容
                voteNum                // 投票数
            });
        });

        // 5. 输出结果（可根据需求选择格式）
        console.log('✅ 提取到的所有评论数据：', allCommentsData);
        return { postContent, allCommentsData };
    } else {
        console.error('❌ 未找到 #comments 元素，请检查选择器是否正确');
    }
}

async function getPost(url, commentNum) {
    // 计算总页数（每页30条），至少抓取第一页以获取 postContent
    const totalPages = Math.max(1, Math.ceil((Number(commentNum) || 0) / 30));

    let postContent = null;
    const commentContent = [];

    for (let page = 1; page <= totalPages; page++) {
        // 构造分页 URL：?page=N#comments，兼容相对/绝对 URL 与已有查询
        const pageUrl = new URL(url);
        pageUrl.searchParams.set('page', String(page));
        pageUrl.hash = 'comments';

        try {
            const data = await _getPost(pageUrl.href);
            if (!data) continue;
            if (page === 1) {
                postContent = data.postContent || postContent;
            }
            if (Array.isArray(data.allCommentsData)) {
                for (const c of data.allCommentsData) {
                    commentContent.push(c);
                }
            }
        } catch (e) {
            console.error('getPost 页面抓取失败:', pageUrl.href, e);
        }
    }

    return {
        postContent,
        commentContent
    };
}

// 刷新正文并同时抓取第一页评论（用于避免重复抓取与提升命中率）
async function refreshPostBodyAndFirstPage(postUrl) {
    try {
        const url = new URL(postUrl);
        url.searchParams.set('page', '1');
        url.hash = 'comments';
        const data = await _getPost(url.href);
        return {
            postContent: data?.postContent || null,
            firstPageComments: Array.isArray(data?.allCommentsData) ? data.allCommentsData : []
        };
    } catch (e) {
        console.error('refreshPostBodyAndFirstPage 失败:', postUrl, e);
        return { postContent: null, firstPageComments: [] };
    }
}

// 刷新单帖的正文与评论（全量）
async function refreshPostBodyAndComments(postUrl, commentNum) {
    try {
        const detail = await getPost(postUrl, commentNum);
        return {
            postContent: detail ? detail.postContent : null,
            comments: detail ? detail.commentContent : []
        };
    } catch (e) {
        console.error('refreshPostBodyAndComments 失败:', postUrl, e);
        return { postContent: null, comments: [] };
    }
}

// 简单的进度输出到页面（单行状态，不累计）
function updateProgress(text) {
    try {
        const el = document.getElementById('egg_setting_info');
        if (!el) return;
        el.innerText = text || '';
    } catch (_) { }
}

// 进度条更新工具
function setProgressBar(barId, labelId, current, total, labelPrefix) {
    const bar = document.getElementById(barId);
    const label = document.getElementById(labelId);
    const t = Number(total) || 0;
    const c = Math.min(Number(current) || 0, t);
    const pct = t > 0 ? Math.round((c / t) * 100) : 0;
    if (bar) bar.style.width = pct + '%';
    if (label) label.innerText = `${labelPrefix} ${c}/${t} (${pct}%)`;
}

function setOverallProgress(current, total) {
    setProgressBar('overallProgressBar', 'overallProgressLabel', current, total, '社区进度');
}

function setCommunityProgress(current, total) {
    setProgressBar('communityProgressBar', 'communityProgressLabel', current, total, '当前社区新增');
}


// 读取本地存储的工具函数
function getFromStorage(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (res) => resolve(res[key]));
    });
}

// 按页抓取评论（用于增量抓取，从 startPage 到 endPage）
async function fetchCommentsRange(postUrl, startPage, endPage) {
    // 改为并发抓取每一页评论，使用并发池限制上限
    const s = Math.max(1, Number(startPage) || 1);
    const e = Math.max(s, Number(endPage) || s);
    const pages = [];
    for (let p = s; p <= e; p++) pages.push(p);

    const tasks = pages.map((page) => {
        return async () => {
            const pageUrl = new URL(postUrl);
            pageUrl.searchParams.set('page', String(page));
            pageUrl.hash = 'comments';
            try {
                const data = await _getPost(pageUrl.href);
                return Array.isArray(data?.allCommentsData) ? data.allCommentsData : [];
            } catch (err) {
                console.error('fetchCommentsRange 抓取失败:', pageUrl.href, err);
                return [];
            }
        };
    });

    const limit = Math.min(COMMUNITY_CONCURRENCY, tasks.length);
    const results = await runWithConcurrency(tasks, limit);

    // 合并并按 id 去重
    const seen = new Set();
    const all = [];
    for (const list of results) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const key = item && item.id != null ? String(item.id) : null;
            if (!key) continue;
            if (!seen.has(key)) {
                seen.add(key);
                all.push(item);
            }
        }
    }
    return all;
}

// 简易并发池，按上限执行任务数组（每个任务是返回 Promise 的函数）
async function runWithConcurrency(tasks, limit) {
    const n = tasks.length;
    if (n === 0) return [];
    const results = new Array(n);
    let idx = 0;
    const workers = new Array(Math.min(limit, n)).fill(0).map(async () => {
        while (true) {
            const cur = idx++;
            if (cur >= n) break;
            try {
                results[cur] = await tasks[cur]();
            } catch (e) {
                results[cur] = { error: e };
            }
        }
    });
    await Promise.all(workers);
    return results;
}

// 评论存储为以 id 为键的对象，以下是帮助函数
function toCommentsMap(src) {
    const map = {};
    if (!src) return map;
    if (Array.isArray(src)) {
        for (const item of src) {
            const key = item && item.id != null ? String(item.id) : null;
            if (key) map[key] = item;
        }
    } else if (typeof src === 'object') {
        for (const [k, v] of Object.entries(src)) {
            if (v && v.id != null) map[String(k)] = v;
        }
    }
    return map;
}
function commentsCount(map) {
    if (!map || typeof map !== 'object') return 0;
    return Object.keys(map).length;
}
function mergeComments(map, list) {
    const out = { ...(map || {}) };
    if (!Array.isArray(list)) return out;
    for (const item of list) {
        const key = item && item.id != null ? String(item.id) : null;
        if (key) out[key] = item;
    }
    return out;
}

// 全量入口但按增量策略抓取：
// - 评论：根据 getTopics 的 commentNum 与已存储数量对比，仅补抓新增页并去重
// - 帖子正文：若时间(datetime)未变化则跳过刷新
async function crawlCommunityFullAll(opts = {}) {
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => { };

    // 1) 获取社区列表
    const communities = await getCommunity();
    if (!communities || communities.length === 0) {
        console.log('暂无社区数据');
        return;
    }

    // 2) 读取旧状态，若无则初始化
    const setToStorage = (obj) => new Promise(resolve => chrome.storage.local.set(obj, resolve));
    const prevState = await getFromStorage('WQPCommunityState');
    const state = prevState && typeof prevState === 'object' && prevState.byCommunity
        ? prevState
        : { byCommunity: {} };

    const totalCommunities = communities.length;
    setOverallProgress(0, totalCommunities);

    // 3) 逐社区抓取（增量）
    for (let idx = 0; idx < communities.length; idx++) {
        const c = communities[idx];
        const commId = String(c.id || '');
        if (!commId) continue;

        const header = `(${idx + 1}/${totalCommunities}) 社区: ${c.title} (ID=${commId})`;
        let commState = state.byCommunity[commId] || {topics: {} };
        // 合并 getCommunity 返回的元信息到社区状态对象中
        commState = {
            ...commState,
            // 展开 getCommunity 返回的全部字段，确保未来新增字段也会保留
            ...c,
            // 规范化关键字段
            id: commId,
            posts: Number(c.posts || 0),
            followers: Number(c.followers || 0)
        };

        let processed = 0;
        const expected = Number(c.posts || 0);
        onProgress(`${header} | 增量抓取: 0/${expected}`);
        setCommunityProgress(0, expected);
        setOverallProgress(idx, totalCommunities);

    let pageUrl = c.url;
    while (pageUrl) {
            try {
                const { topics, nextUrl } = await getTopics(pageUrl);
                // 3.1 并行刷新本页需要刷新的正文，并同时抓取第一页评论
                const bodyTasks = [];
                for (const t of topics) {
                    const topicId = String(t.id || '');
                    if (!topicId || !t.url) continue;
                    const existed = commState.topics[topicId];
                    const hasBody = !!(existed && existed.postContent);
                    const needRefreshBody = !existed || existed.datetime !== t.datetime || !hasBody;
                    if (needRefreshBody) {
                        bodyTasks.push(() =>
                            refreshPostBodyAndFirstPage(t.url)
                                .then(r => ({ topicId, postContent: r.postContent, firstPageComments: r.firstPageComments }))
                                .catch(e => {
                                    console.error('并行刷新正文+第一页评论失败:', t.url, e);
                                    return { topicId, postContent: null, firstPageComments: [] };
                                })
                        );
                    }
                }
                const bodyResults = await runWithConcurrency(bodyTasks, COMMUNITY_CONCURRENCY);
                const bodyMap = new Map();
                const firstPageMap = new Map();
                for (const r of bodyResults) {
                    if (r && r.topicId) {
                        bodyMap.set(r.topicId, r.postContent || null);
                        firstPageMap.set(r.topicId, Array.isArray(r.firstPageComments) ? r.firstPageComments : []);
                    }
                }

                // 3.2 基于已合并的第一页评论，计算所有剩余评论页的 URL，统一并发抓取，再按帖子合并
                const commentPageJobs = [];
                for (const t of topics) {
                    const topicId = String(t.id || '');
                    if (!topicId || !t.url) continue;
                    const existed = commState.topics[topicId];
                    const existedCommentsMap = toCommentsMap(existed?.comments);
                    const firstPage = firstPageMap.get(topicId) || [];
                    // 计算已知条数（已存在 + 第1页新抓的）
                    const existedIds = new Set(Object.keys(existedCommentsMap));
                    let mergedCount = commentsCount(existedCommentsMap);
                    for (const item of firstPage) {
                        const key = item && item.id != null ? String(item.id) : null;
                        if (key && !existedIds.has(key)) {
                            mergedCount += 1;
                            existedIds.add(key);
                        }
                    }
                    const totalCount = Math.max(0, Number(t.commentNum || 0));
                    if (totalCount > mergedCount) {
                        let startPage = Math.max(1, Math.floor(mergedCount / COMMUNITY_PER_PAGE) + 1);
                        if (firstPage.length > 0) startPage = Math.max(2, startPage); // 避免重复抓第一页
                        const endPage = Math.max(1, Math.ceil(totalCount / COMMUNITY_PER_PAGE));
                        for (let p = startPage; p <= endPage; p++) {
                            const u = new URL(t.url);
                            u.searchParams.set('page', String(p));
                            u.hash = 'comments';
                            commentPageJobs.push({ topicId, url: u.href });
                        }
                    }
                }

                // 将所有评论分页 URL 统一并发抓取
                const pageTasks = commentPageJobs.map(job => async () => {
                    try {
                        const data = await _getPost(job.url);
                        const list = Array.isArray(data?.allCommentsData) ? data.allCommentsData : [];
                        return { topicId: job.topicId, list };
                    } catch (e) {
                        console.error('并行抓取评论页失败:', job.url, e);
                        return { topicId: job.topicId, list: [] };
                    }
                });
                const pageResults = await runWithConcurrency(pageTasks, Math.min(COMMUNITY_CONCURRENCY, pageTasks.length || 0));

                // 合并为按 topicId 的 Map
                const commentsMap = new Map();
                for (const r of pageResults) {
                    if (!r || !r.topicId) continue;
                    const arr = commentsMap.get(r.topicId) || [];
                    if (Array.isArray(r.list) && r.list.length > 0) arr.push(...r.list);
                    commentsMap.set(r.topicId, arr);
                }

                // 3.3 合并正文/评论（包含第一页）结果并落盘（评论以 id 为键存储）
                for (const t of topics) {
                    const topicId = String(t.id || '');
                    if (!topicId || !t.url) continue;

                    const existed = commState.topics[topicId];
                    let postContent = bodyMap.has(topicId)
                        ? bodyMap.get(topicId)
                        : (existed?.postContent || null);
                    let commentsObj = toCommentsMap(existed?.comments);

                    // 先合并第一页评论（如有）
                    const firstPage = firstPageMap.get(topicId) || [];
                    if (firstPage.length > 0) {
                        commentsObj = mergeComments(commentsObj, firstPage);
                    }

                    // 再合并其余页的评论（如有）
                    const fetched = commentsMap.get(topicId);
                    if (Array.isArray(fetched) && fetched.length > 0) {
                        commentsObj = mergeComments(commentsObj, fetched);
                    }

                    commState.topics[topicId] = {
                        ...t,
                        postContent,
                        comments: commentsObj,
                        lastCrawledAt: new Date().toISOString()
                    };

                    processed += 1;
                    setCommunityProgress(processed, expected || processed);
                    onProgress(`${header} | 增量抓取: ${processed}/${expected || processed}`);
                }
                state.byCommunity[commId] = commState;
                await setToStorage({ WQPCommunityState: state });
                onProgress(`${header} | 已保存进度: ${processed}/${expected || processed}`);
                // 推进到下一页
                pageUrl = nextUrl;
            } catch (e) {
                console.error('分页抓取失败:', pageUrl, e);
                onProgress(`${header} | 分页抓取失败: ${String(e)}`);
                break;
            }
        }

        // 社区完成后保存
        state.byCommunity[commId] = commState;
        state.byCommunityTime = new Date().toISOString();
        await setToStorage({ WQPCommunityState: state });
        onProgress(`${header} | 完成：增量抓取 ${processed}/${expected || processed}`);
        setOverallProgress(idx + 1, totalCommunities);
    }

    onProgress('全部完成：增量抓取（帖子+评论）完成');
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

    // 全量抓取（帖子+评论）按钮（不做增量，直接完整抓取）
    let crawlFullAllBtn = document.createElement("button");
    crawlFullAllBtn.setAttribute("id", "crawlFullAllButton");
    crawlFullAllBtn.innerText = "开始全量抓取(帖子+评论)";
    crawlFullAllBtn.className = "egg_study_btn egg_menu";
    crawlFullAllBtn.addEventListener("click", async () => {
        try {
            setButtonState("crawlFullAllButton", "全量抓取(帖子+评论)...", 'load');
            updateProgress('开始全量抓取(帖子+评论)...');
            await crawlCommunityFullAll({
                onProgress: (msg) => updateProgress(msg, { append: true })
            });
        } finally {
            setButtonState("crawlFullAllButton", "开始全量抓取(帖子+评论)", 'enable');
        }
    }, false);
    baseButtons.append(crawlFullAllBtn);


    // 进度条容器（总体）
    const overallWrap = document.createElement('div');
    overallWrap.style.cssText = 'margin-top:8px; width:100%;';
    const overallLabel = document.createElement('div');
    overallLabel.setAttribute('id', 'overallProgressLabel');
    overallLabel.style.cssText = 'font-size:12px;color:#555;margin-bottom:4px;';
    overallLabel.innerText = '社区进度 0/0 (0%)';
    const overallBar = document.createElement('div');
    overallBar.style.cssText = 'width:100%;height:10px;background:#eee;border-radius:6px;overflow:hidden;';
    const overallInner = document.createElement('div');
    overallInner.setAttribute('id', 'overallProgressBar');
    overallInner.style.cssText = 'height:100%;width:0%;background:#4CAF50;transition:width .2s;';
    overallBar.appendChild(overallInner);
    overallWrap.appendChild(overallLabel);
    overallWrap.appendChild(overallBar);
    baseButtons.append(overallWrap);

    // 进度条容器（当前社区新增）
    const communityWrap = document.createElement('div');
    communityWrap.style.cssText = 'margin-top:8px; width:100%;';
    const communityLabel = document.createElement('div');
    communityLabel.setAttribute('id', 'communityProgressLabel');
    communityLabel.style.cssText = 'font-size:12px;color:#555;margin-bottom:4px;';
    communityLabel.innerText = '当前社区新增 0/0 (0%)';
    const communityBar = document.createElement('div');
    communityBar.style.cssText = 'width:100%;height:10px;background:#eee;border-radius:6px;overflow:hidden;';
    const communityInner = document.createElement('div');
    communityInner.setAttribute('id', 'communityProgressBar');
    communityInner.style.cssText = 'height:100%;width:0%;background:#2196F3;transition:width .2s;';
    communityBar.appendChild(communityInner);
    communityWrap.appendChild(communityLabel);
    communityWrap.appendChild(communityBar);
    baseButtons.append(communityWrap);

    // 单行状态文本
    let p = document.createElement("p");
    p.setAttribute("id", "egg_setting_info");
    p.style.cssText = "margin-top:8px; white-space: pre-wrap; border: 1px solid #ddd; padding: 6px; border-radius: 4px; background:#fafafa;";
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
