import { getLocalValue, removeLocalValue, setLocalValue } from './storageService.js';

const API_BASE = 'https://api.worldquantbrain.com';
const SUPPORT_BASE = 'https://support.worldquantbrain.com';
const LIKED_IDS_KEY = 'WQP_LikedIds';
const DEFAULT_MAX_PAGES = 60;
const ZENDESK_API_PAGE_SIZE = 100;
const ZENDESK_RATE_LIMIT_MAX_RETRIES = 6;
const ZENDESK_RATE_LIMIT_BASE_DELAY_MS = 2000;
const ZENDESK_RATE_LIMIT_MAX_DELAY_MS = 90000;
const ZENDESK_REQUEST_MIN_INTERVAL_MS = 300;
const POST_DETAIL_CONCURRENCY = 4;
const RECENT_POST_CONCURRENCY = 3;
const SECTION_CONCURRENCY = 2;
const ARTICLE_CONCURRENCY = 3;

let csrfToken = null;
let supportReadyPromise = null;
let communityStateSaveQueue = Promise.resolve();
let zendeskRequestQueue = Promise.resolve();
let lastZendeskRequestAt = 0;

function progress(ctx, message, data = {}) {
    if (ctx && typeof ctx.progress === 'function') {
        ctx.progress(message, data);
    }
}

function progressBar(ctx, message, current, total, label, id = 'overall') {
    progress(ctx, message, {
        progress: {
            id,
            current,
            total,
            label,
        },
    });
}

function progressScope(payload, key, fallback) {
    const value = String(payload?.[key] || '').trim();
    return value || fallback;
}

function createVoteStats() {
    return {
        total: 0,
        fromCache: 0,
        liked: 0,
        skipped: 0,
        failed: 0,
        targets: 0,
    };
}

function resetVoteStats(ctx = {}) {
    ctx.voteStats = createVoteStats();
    progress(ctx, '本次已点赞 0 个 (来自缓存 0 个)', { voteStats: ctx.voteStats });
}

function updateVoteStats(ctx = {}, delta = {}) {
    if (!ctx.voteStats) ctx.voteStats = createVoteStats();
    ctx.voteStats.liked += Number(delta.liked || 0);
    ctx.voteStats.skipped += Number(delta.skipped || 0);
    ctx.voteStats.failed += Number(delta.failed || 0);
    ctx.voteStats.targets += Number(delta.targets || 0);
    ctx.voteStats.fromCache = ctx.voteStats.skipped;
    ctx.voteStats.total = ctx.voteStats.liked + ctx.voteStats.skipped;
    return { ...ctx.voteStats };
}

function progressVote(ctx, message, delta) {
    progress(ctx, message, { voteStats: updateVoteStats(ctx, delta) });
}

function maskDisplayName(name) {
    const text = String(name || '').trim();
    if (!text) return '';
    return `${text[0]}${'*'.repeat(Math.max(text.length - 1, 0))}`;
}

function withCredentials(init = {}) {
    return {
        ...init,
        credentials: 'include',
        headers: {
            ...(init.headers || {}),
        },
    };
}

function getCookies(url) {
    return new Promise((resolve, reject) => {
        chrome.cookies.getAll({ url }, (cookies) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve(Array.isArray(cookies) ? cookies : []);
        });
    });
}

async function hasUsableCookie(url) {
    const cookies = await getCookies(url);
    return cookies.some((cookie) => !cookie.expirationDate || cookie.expirationDate * 1000 > Date.now());
}

function parseHelpCenterUser(html) {
    const match = String(html || '').match(/HelpCenter\.user\s*=\s*({[\s\S]*?});/);
    if (!match?.[1]) return null;
    try {
        return JSON.parse(match[1]);
    } catch (_) {
        return null;
    }
}

async function validateSupportSession(ctx = {}) {
    progress(ctx, '正在验证 Support Cookie...');
    const { response, text } = await fetchText(`${SUPPORT_BASE}/hc/en-us/community/topics`, {
        method: 'GET',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    if (!response.url.startsWith(SUPPORT_BASE) || response.url.includes('/access/login')) {
        progress(ctx, `Support Cookie 不可用：跳转到 ${response.url}`);
        return false;
    }

    const user = parseHelpCenterUser(text);
    if (user?.role === 'anonymous') {
        progress(ctx, 'Support Cookie 不可用：当前是匿名用户。');
        return false;
    }

    if (!user) {
        progress(ctx, 'Support 页面未暴露 HelpCenter.user，继续用 CSRF 检查。');
    } else {
        progress(ctx, `Support Cookie 可用：${user.name || user.email || user.identifier || user.role || '已登录'}`);
    }

    await getCsrfToken(ctx);
    return true;
}

async function fetchText(url, init = {}) {
    const response = await fetch(url, withCredentials(init));
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return { response, text };
}

async function fetchJson(url, init = {}) {
    const response = await fetch(url, withCredentials(init));
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.json();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parseRetryAfterMs(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const time = Date.parse(raw);
    return Number.isNaN(time) ? 0 : Math.max(0, time - Date.now());
}

function retryDelayMs(response, attempt) {
    const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
    if (retryAfter > 0) return Math.min(retryAfter, ZENDESK_RATE_LIMIT_MAX_DELAY_MS);
    const exponential = ZENDESK_RATE_LIMIT_BASE_DELAY_MS * (2 ** attempt);
    const jitter = Math.floor(Math.random() * 1000);
    return Math.min(exponential + jitter, ZENDESK_RATE_LIMIT_MAX_DELAY_MS);
}

async function waitForZendeskRequestSlot() {
    const run = zendeskRequestQueue
        .catch(() => {})
        .then(async () => {
            const elapsed = Date.now() - lastZendeskRequestAt;
            if (elapsed < ZENDESK_REQUEST_MIN_INTERVAL_MS) {
                await sleep(ZENDESK_REQUEST_MIN_INTERVAL_MS - elapsed);
            }
            lastZendeskRequestAt = Date.now();
        });
    zendeskRequestQueue = run;
    return run;
}

function shortApiPath(url) {
    try {
        const parsed = new URL(url, SUPPORT_BASE);
        const params = new URLSearchParams(parsed.search);
        if (params.has('page[after]')) params.set('page[after]', '...');
        if (params.has('page[before]')) params.set('page[before]', '...');
        const query = params.toString();
        return `${parsed.pathname}${query ? `?${query}` : ''}`;
    } catch (_) {
        return String(url || '');
    }
}

function buildZendeskApiUrl(pathOrUrl, params = {}) {
    const url = new URL(pathOrUrl, SUPPORT_BASE);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        url.searchParams.set(key, String(value));
    });
    return url.href;
}

async function fetchZendeskJson(pathOrUrl, params = {}, ctx = {}) {
    const url = buildZendeskApiUrl(pathOrUrl, params);
    for (let attempt = 0; attempt <= ZENDESK_RATE_LIMIT_MAX_RETRIES; attempt += 1) {
        await waitForZendeskRequestSlot();
        const response = await fetch(url, withCredentials({
            method: 'GET',
            headers: { Accept: 'application/json' },
        }));
        if (response.ok) {
            return response.json();
        }

        if (response.status === 429 && attempt < ZENDESK_RATE_LIMIT_MAX_RETRIES) {
            const delay = retryDelayMs(response, attempt);
            progress(ctx, `Zendesk API 触发 429 限流，等待 ${Math.ceil(delay / 1000)} 秒后重试 (${attempt + 1}/${ZENDESK_RATE_LIMIT_MAX_RETRIES})：${shortApiPath(url)}`);
            await sleep(delay);
            continue;
        }

        const preview = await response.text().catch(() => '');
        const retryAfter = response.headers.get('Retry-After');
        const retryText = retryAfter ? ` Retry-After=${retryAfter}.` : '';
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}.${retryText}${preview ? ` ${preview.slice(0, 300)}` : ''}`);
    }
    throw new Error(`HTTP 429 Too Many Requests for ${url}`);
}

function nextZendeskPageUrl(data) {
    if (data?.meta?.has_more === false) return '';
    const next = data?.links?.next || data?.next_page || '';
    return next ? absoluteUrl(next, SUPPORT_BASE) : '';
}

async function fetchZendeskItems(pathOrUrl, itemKey, params = {}, options = {}) {
    const items = [];
    const pageSize = Number(options.pageSize || ZENDESK_API_PAGE_SIZE);
    const maxPages = Number(options.maxPages || 0);
    const ctx = options.ctx || {};
    const firstParams = { ...params };
    if (!Object.prototype.hasOwnProperty.call(firstParams, 'page[size]')) {
        firstParams['page[size]'] = pageSize;
    }
    let pageUrl = buildZendeskApiUrl(pathOrUrl, firstParams);
    let page = 0;
    while (pageUrl) {
        page += 1;
        const data = await fetchZendeskJson(pageUrl, {}, ctx);
        const pageItems = Array.isArray(data?.[itemKey]) ? data[itemKey] : [];
        items.push(...pageItems);
        if (maxPages > 0 && page >= maxPages) break;
        pageUrl = nextZendeskPageUrl(data);
    }
    return items;
}

function absoluteUrl(href, baseUrl = SUPPORT_BASE) {
    try {
        return new URL(href, baseUrl).href;
    } catch (_) {
        return '';
    }
}

function normalizeSupportUrl(url) {
    const parsed = new URL(url, SUPPORT_BASE);
    return `${parsed.origin}${parsed.pathname}`;
}

function parseProfileId(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('profileId is required');
    const match = raw.match(/\/profiles\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : raw;
}

function isSupportProfileUrl(value) {
    return /\/profiles\/[^/?#]+/.test(String(value || ''));
}

function looksLikeSupportProfileId(value) {
    return /^\d{4,}$/.test(String(value || '').trim());
}

function profileUrl(profileId) {
    return `${SUPPORT_BASE}/hc/en-us/profiles/${encodeURIComponent(profileId)}`;
}

async function queryMentionProfileId(query, ctx = {}) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;
    const url = `${SUPPORT_BASE}/hc/api/internal/communities/mentions.json?query=${encodeURIComponent(cleanQuery)}`;
    const data = await fetchJson(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });
    if (Array.isArray(data) && data[0]?.id) {
        return String(data[0].id);
    }
    progress(ctx, `${cleanQuery}: mentions 接口未返回 profile id。`);
    return null;
}

async function resolveProfileRef(input, ctx = {}, options = {}) {
    const raw = String(input || '').trim();
    const label = String(options.label || raw).trim();
    const fallback = String(options.fallback || '').trim();
    if (!raw && !fallback) {
        throw new Error('profile input is required');
    }

    let profileId = '';
    let source = '';
    if (isSupportProfileUrl(raw) || looksLikeSupportProfileId(raw)) {
        profileId = parseProfileId(raw);
        source = isSupportProfileUrl(raw) ? 'profile-url' : 'profile-id';
    } else if (raw) {
        await ensureSupportReady({}, ctx);
        profileId = await queryMentionProfileId(raw, ctx);
        source = 'mention-query';
    }

    if (!profileId && fallback) {
        if (isSupportProfileUrl(fallback) || looksLikeSupportProfileId(fallback)) {
            profileId = parseProfileId(fallback);
            source = isSupportProfileUrl(fallback) ? 'fallback-profile-url' : 'fallback-profile-id';
        } else {
            await ensureSupportReady({}, ctx);
            profileId = await queryMentionProfileId(fallback, ctx);
            source = 'fallback-mention-query';
        }
    }

    if (!profileId) {
        throw new Error(`Unable to resolve profile id for ${label || raw || fallback}`);
    }

    const resolved = {
        input: raw || fallback,
        label: label || raw || fallback,
        profileId,
        profileUrl: profileUrl(profileId),
        source,
    };
    return resolved;
}

function getQuarterStartTime() {
    const now = new Date();
    const easternDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const year = easternDate.getUTCFullYear();
    const month = easternDate.getUTCMonth();
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0));
}

function formatBeijingTime(date = new Date()) {
    return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
    });
}

async function getCurrentWqUserId() {
    const data = await fetchJson(`${API_BASE}/users/self/consultant/summary`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });
    return data?.leaderboard?.user || data?.user || data?.id || '';
}

async function getBatchRunLabel(ctx = {}) {
    const beijingTime = formatBeijingTime();
    try {
        const userId = await getCurrentWqUserId();
        return `${userId || 'UNKNOWN'}: ${beijingTime}`;
    } catch (error) {
        progress(ctx, `获取当前 WQ ID 失败：${error.message}`);
        return `UNKNOWN: ${beijingTime}`;
    }
}

function findNextPageUrl(html, baseUrl) {
    const patterns = [
        /<a\b[^>]*class=["'][^"']*pagination-next-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i,
        /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*pagination-next-link[^"']*["'][^>]*>/i,
        /<li\b[^>]*class=["'][^"']*pagination-next[^"']*["'][\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>/i,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return absoluteUrl(match[1], baseUrl);
    }
    return '';
}

function extractCommentIds(html) {
    const ids = new Set();
    const regex = /community_comment_(\d+)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        if (match[1]) ids.add(match[1]);
    }
    return Array.from(ids);
}

function extractBlocks(html, className) {
    const blocks = [];
    const regex = /<(li|div|section|article)\b[^>]*>[\s\S]*?<\/\1>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const block = match[0];
        if (block.includes(className)) blocks.push(block);
    }
    return blocks;
}

function extractHref(block, predicate) {
    const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = regex.exec(block)) !== null) {
        const href = match[1] || '';
        if (!predicate || predicate(href, match[0])) return href;
    }
    return '';
}

function extractDatetime(block) {
    const match = block.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
    return match?.[1] || '';
}

function parseProfilePostEntries(html, baseUrl) {
    const blocks = extractBlocks(html, 'profile-contribution');
    const entries = [];
    for (const block of blocks) {
        const href = extractHref(block, (value) => value.includes('/community/posts/'));
        if (!href) continue;
        const datetime = extractDatetime(block);
        entries.push({
            url: normalizeSupportUrl(absoluteUrl(href, baseUrl)),
            datetime,
        });
    }
    return entries;
}

function parseProfileCommentEntries(html, baseUrl) {
    const blocks = extractBlocks(html, 'comment-link');
    const entries = [];
    for (const block of blocks) {
        const href = extractHref(block, (value, tag) => {
            return value.includes('/community/posts/') || tag.includes('comment-link');
        });
        if (!href) continue;
        const datetime = extractDatetime(block);
        entries.push({
            url: normalizeSupportUrl(absoluteUrl(href, baseUrl)),
            datetime,
        });
    }
    return entries;
}

function createVoteSummary() {
    return {
        targets: 0,
        liked: 0,
        skipped: 0,
        failed: 0,
        profiles: [],
    };
}

function mergeSummary(target, source) {
    target.targets += source.targets || 0;
    target.liked += source.liked || 0;
    target.skipped += source.skipped || 0;
    target.failed += source.failed || 0;
    if (Array.isArray(source.profiles) && source.profiles.length) {
        target.profiles.push(...source.profiles);
    }
    return target;
}

function createCrawlSummary() {
    return {
        communities: 0,
        topics: 0,
        comments: 0,
        articles: 0,
        updated: 0,
    };
}

function mergeCrawlSummary(target, source) {
    ['communities', 'topics', 'comments', 'articles', 'updated'].forEach((key) => {
        target[key] += Number(source?.[key] || 0);
    });
    return target;
}

function extractIdFromPath(url, type) {
    try {
        const pattern = new RegExp(`/${type}/(\\d+)`);
        const match = new URL(url, SUPPORT_BASE).pathname.match(pattern);
        return match?.[1] || '';
    } catch (_) {
        return '';
    }
}

function communityTopicUrl(topicId) {
    return `${SUPPORT_BASE}/hc/en-us/community/topics/${encodeURIComponent(topicId)}`;
}

function communityPostUrl(postId) {
    return `${SUPPORT_BASE}/hc/en-us/community/posts/${encodeURIComponent(postId)}`;
}

function categoryUrl(categoryId) {
    return `${SUPPORT_BASE}/hc/en-us/categories/${encodeURIComponent(categoryId)}`;
}

function sectionUrl(sectionId) {
    return `${SUPPORT_BASE}/hc/en-us/sections/${encodeURIComponent(sectionId)}`;
}

function articleUrl(articleId) {
    return `${SUPPORT_BASE}/hc/en-us/articles/${encodeURIComponent(articleId)}`;
}

function parseApiId(value, pathType, label) {
    if (value && typeof value === 'object' && value.id != null) return String(value.id);
    const raw = String(value || '').trim();
    if (!raw) throw new Error(`${label} is required`);
    const fromPath = extractIdFromPath(raw, pathType);
    if (fromPath) return fromPath;
    if (/^\d+$/.test(raw)) return raw;
    throw new Error(`Unable to parse ${label}: ${raw}`);
}

function numberField(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function authorName(item) {
    return item?.author?.name || item?.user?.name || item?.created_by?.name || '';
}

function normalizeCommunityTopic(topic = {}) {
    const id = String(topic.id || '');
    return {
        id,
        url: topic.html_url || communityTopicUrl(id),
        title: topic.name || topic.title || '',
        description: topic.description || '',
        posts: numberField(topic.post_count ?? topic.posts_count ?? topic.posts),
        followers: numberField(topic.follower_count ?? topic.followers_count ?? topic.followers),
        apiUrl: topic.url || '',
    };
}

function normalizeCommunityPost(post = {}, fallbackTopicId = '') {
    const id = String(post.id || '');
    const topicId = String(post.topic_id || fallbackTopicId || '');
    const updatedAt = post.updated_at || '';
    const createdAt = post.created_at || '';
    return {
        id,
        url: post.html_url || communityPostUrl(id),
        title: post.title || '',
        author: authorName(post) || String(post.author_id || ''),
        authorId: post.author_id || '',
        datetime: updatedAt || createdAt,
        createdAt,
        updatedAt,
        voteNum: numberField(post.vote_sum ?? post.vote_count),
        commentNum: numberField(post.comment_count ?? post.comments_count ?? (Array.isArray(post.comments) ? post.comments.length : 0)),
        topicId,
        postContent: post.details || post.body || post.content || '',
        status: post.status || '',
        apiUrl: post.url || '',
    };
}

function normalizePostComment(comment = {}, postId = '') {
    const id = String(comment.id || '');
    const resolvedPostId = String(comment.post_id || comment.post?.id || postId || '');
    const updatedAt = comment.updated_at || '';
    const createdAt = comment.created_at || '';
    return {
        id,
        postId: resolvedPostId,
        url: comment.html_url || (resolvedPostId ? `${communityPostUrl(resolvedPostId)}/comments/${encodeURIComponent(id)}` : ''),
        author: authorName(comment) || String(comment.author_id || ''),
        authorId: comment.author_id || '',
        commentTimeDatetime: updatedAt || createdAt,
        createdAt,
        updatedAt,
        commentContent: comment.body || comment.details || comment.content || '',
        voteNum: numberField(comment.vote_sum ?? comment.vote_count),
        apiUrl: comment.url || '',
    };
}

function normalizeCategory(category = {}) {
    const id = String(category.id || '');
    return {
        id,
        url: category.html_url || categoryUrl(id),
        title: category.name || category.title || '',
        description: category.description || '',
        apiUrl: category.url || '',
    };
}

function normalizeSection(section = {}, fallbackCategoryId = '') {
    const id = String(section.id || '');
    return {
        id,
        url: section.html_url || sectionUrl(id),
        title: section.name || section.title || '',
        categoryId: String(section.category_id || fallbackCategoryId || ''),
        parentSectionId: section.parent_section_id ? String(section.parent_section_id) : '',
        description: section.description || '',
        apiUrl: section.url || '',
    };
}

function normalizeArticle(article = {}) {
    const id = String(article.id || '');
    const updatedAt = article.updated_at || '';
    const createdAt = article.created_at || '';
    return {
        id,
        url: article.html_url || articleUrl(id),
        title: article.title || article.name || '',
        author: authorName(article) || String(article.author_id || ''),
        authorId: article.author_id || '',
        datetime: updatedAt || createdAt,
        createdAt,
        updatedAt,
        sectionId: article.section_id ? String(article.section_id) : '',
        categoryId: article.category_id ? String(article.category_id) : '',
        voteNum: numberField(article.vote_sum ?? article.vote_count),
        commentNum: numberField(article.comment_count ?? article.comments_count),
        articleContent: article.body || article.details || article.content || '',
        apiUrl: article.url || '',
        lastCrawledAt: new Date().toISOString(),
    };
}

function commentsCount(map) {
    return map && typeof map === 'object' ? Object.keys(map).length : 0;
}

function postCommentsAreCurrent(existing, topic) {
    if (!existing || !topic) return false;
    const existingComments = existing.comments && typeof existing.comments === 'object' ? existing.comments : {};
    const expectedCommentCount = Number(topic.commentNum || 0);
    const storedCommentCount = commentsCount(existingComments);
    return storedCommentCount === expectedCommentCount;
}

async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let index = 0;
    const workers = new Array(Math.min(Math.max(limit || 1, 1), tasks.length || 1)).fill(0).map(async () => {
        while (index < tasks.length) {
            const current = index;
            index += 1;
            try {
                results[current] = await tasks[current]();
            } catch (error) {
                results[current] = { error };
            }
        }
    });
    await Promise.all(workers);
    return results;
}

async function getCommunityState() {
    const state = await getLocalValue('WQP_CommunityState');
    return state && typeof state === 'object' ? state : {};
}

async function saveCommunityStatePatch(patch) {
    const run = communityStateSaveQueue
        .catch(() => {})
        .then(async () => {
            const current = await getCommunityState();
            await setLocalValue('WQP_CommunityState', { ...current, ...patch });
        });
    communityStateSaveQueue = run;
    return run;
}

async function fetchPostComments(postRef, ctx = {}) {
    const postId = parseApiId(postRef, 'posts', 'postId');
    const postHint = postRef && typeof postRef === 'object'
        ? normalizeCommunityPost(postRef, postRef.topicId)
        : null;
    const commentItems = await fetchZendeskItems(`/api/v2/community/posts/${encodeURIComponent(postId)}/comments.json`, 'comments', {}, { ctx });
    const post = postHint || normalizeCommunityPost({ id: postId });
    const comments = {};
    commentItems.forEach((comment) => {
        const item = normalizePostComment(comment, postId);
        if (item.id) comments[item.id] = item;
    });
    return {
        postContent: post.postContent || postHint?.postContent || '',
        post,
        comments,
    };
}

async function getLikedIds() {
    const ids = await getLocalValue(LIKED_IDS_KEY);
    return Array.isArray(ids) ? ids : [];
}

async function saveLikedId(url) {
    const ids = await getLikedIds();
    if (!ids.includes(url)) {
        ids.push(url);
        await setLocalValue(LIKED_IDS_KEY, ids);
    }
}

export async function clearLikedIds() {
    await removeLocalValue(LIKED_IDS_KEY);
    return createVoteSummary();
}

export async function authenticateSupport(payload = {}, ctx = {}) {
    const hasSupportCookie = await hasUsableCookie(SUPPORT_BASE);
    if (hasSupportCookie) {
        csrfToken = null;
        try {
            const supportSessionValid = await validateSupportSession(ctx);
            if (supportSessionValid) {
                return {
                    targets: 1,
                    liked: 0,
                    skipped: 0,
                    failed: 0,
                    status: 200,
                    finalUrl: SUPPORT_BASE,
                    authMode: 'support-cookie',
                };
            }
        } catch (error) {
            progress(ctx, `Support Cookie 验证失败，继续尝试 WQ 链式登录：${error.message}`);
            csrfToken = null;
        }
    }

    const hasWqCookie = await hasUsableCookie(API_BASE);
    if (hasWqCookie) {
        progress(ctx, '检测到 WQ API Cookie，尝试链式换取 Support 登录态。');
    } else {
        throw new Error('未检测到 Support Cookie 或 WQ API Cookie。请先在浏览器登录 WorldQuant BRAIN 或 Support。');
    }

    progress(ctx, '正在连接 Support 会话...');
    const returnTo = encodeURIComponent(`${SUPPORT_BASE}/hc/en-us/community/topics`);
    const response = await fetch(`${API_BASE}/authentication/support?return_to=${returnTo}`, withCredentials({
        method: 'GET',
        redirect: 'follow',
        headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    }));
    const text = await response.text();
    csrfToken = null;
    const connected = response.url.startsWith(SUPPORT_BASE) || text.includes('HelpCenter') || text.includes('/hc/en-us/community');
    const user = parseHelpCenterUser(text);

    progress(ctx, `Support 连接返回：${response.status}`);
    if (!response.ok || !connected || user?.role === 'anonymous') {
        throw new Error(`Support 登录态不可用：HTTP ${response.status}, finalUrl=${response.url}`);
    }
    await getCsrfToken(ctx);

    return {
        targets: 1,
        liked: 0,
        skipped: 0,
        failed: 0,
        status: response.status,
        finalUrl: response.url,
        authMode: 'wq-cookie-chain',
        htmlPreview: text.slice(0, 300),
    };
}

async function getCsrfToken(ctx = {}) {
    if (csrfToken) return csrfToken;
    progress(ctx, '正在获取 Support CSRF token...');
    const data = await fetchZendeskJson('/api/v2/help_center/sessions.json', {}, ctx);
    csrfToken = data?.current_session?.csrf_token;
    if (!csrfToken) {
        throw new Error('Unable to get Support CSRF token');
    }
    return csrfToken;
}

async function ensureSupportReady(payload = {}, ctx = {}) {
    if (!supportReadyPromise) {
        supportReadyPromise = (async () => {
            try {
                await getCsrfToken(ctx);
            } catch (_) {
                await authenticateSupport(payload, ctx);
                await getCsrfToken(ctx);
            }
        })();
    }
    try {
        await supportReadyPromise;
    } finally {
        supportReadyPromise = null;
    }
}

async function upVoteUrl(rawUrl, payload = {}, ctx = {}) {
    const summary = createVoteSummary();
    const url = normalizeSupportUrl(rawUrl);
    summary.targets = 1;

    const likedIds = await getLikedIds();
    if (likedIds.includes(url)) {
        summary.skipped = 1;
        progressVote(ctx, `跳过已点赞：${url}`, summary);
        return summary;
    }

    await ensureSupportReady(payload, ctx);
    try {
        const response = await fetch(`${url}/vote`, withCredentials({
            method: 'POST',
            headers: {
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: 'value=up',
        }));
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.value === 'up') {
            await saveLikedId(url);
            summary.liked = 1;
            progressVote(ctx, `点赞成功：${url}`, summary);
        } else {
            summary.failed = 1;
            progressVote(ctx, `点赞失败：${url} (${response.status})`, summary);
        }
    } catch (error) {
        summary.failed = 1;
        progressVote(ctx, `点赞失败：${url} (${error.message})`, summary);
    }
    return summary;
}

async function collectPostVoteTargets(postUrl, ctx = {}, maxPages = DEFAULT_MAX_PAGES) {
    const basePostUrl = normalizeSupportUrl(postUrl);
    const targets = new Set([basePostUrl]);
    const visited = new Set();
    let pageUrl = basePostUrl;
    let page = 0;

    while (pageUrl && page < maxPages && !visited.has(pageUrl)) {
        page += 1;
        visited.add(pageUrl);
        progress(ctx, `抓取帖子评论页 ${page}: ${pageUrl}`);
        const { text } = await fetchText(pageUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        for (const commentId of extractCommentIds(text)) {
            targets.add(`${basePostUrl}/comments/${commentId}`);
        }
        pageUrl = findNextPageUrl(text, pageUrl);
    }

    return Array.from(targets);
}

export async function upVotePost(payload = {}, ctx = {}) {
    if (!payload.postUrl) throw new Error('postUrl is required');
    await ensureSupportReady(payload, ctx);
    const targets = await collectPostVoteTargets(payload.postUrl, ctx, payload.maxPages || DEFAULT_MAX_PAGES);
    progress(ctx, `共发现 ${targets.length} 个点赞目标。`);
    const summary = createVoteSummary();
    for (const target of targets) {
        mergeSummary(summary, await upVoteUrl(target, payload, ctx));
    }
    return summary;
}

async function collectProfileTargets(profileIdValue, kind, ctx = {}, maxPages = DEFAULT_MAX_PAGES) {
    const profileId = parseProfileId(profileIdValue);
    const quarterStart = getQuarterStartTime();
    const filter = kind === 'comments' ? 'comments' : 'posts';
    const startUrl = `${SUPPORT_BASE}/hc/en-us/profiles/${encodeURIComponent(profileId)}?sort_by=recent_user_activity&filter_by=${filter}`;
    const targets = [];
    const visited = new Set();
    let pageUrl = startUrl;
    let page = 0;
    let reachedOldEntries = false;

    while (pageUrl && page < maxPages && !visited.has(pageUrl) && !reachedOldEntries) {
        page += 1;
        visited.add(pageUrl);
        progress(ctx, `抓取用户 ${profileId} ${filter} 第 ${page} 页`);
        const { text } = await fetchText(pageUrl, {
            method: 'GET',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const entries = kind === 'comments'
            ? parseProfileCommentEntries(text, pageUrl)
            : parseProfilePostEntries(text, pageUrl);

        for (const entry of entries) {
            const time = entry.datetime ? new Date(entry.datetime) : null;
            if (time && time < quarterStart) {
                reachedOldEntries = true;
                break;
            }
            if (entry.url) targets.push(entry.url);
        }
        pageUrl = findNextPageUrl(text, pageUrl);
    }

    return targets;
}

export async function upVoteUser(payload = {}, ctx = {}) {
    const profileInput = payload.profileId || payload.profileInput;
    if (!profileInput) throw new Error('profileId is required');
    await ensureSupportReady(payload, ctx);
    const resolvedProfile = await resolveProfileRef(profileInput, ctx);
    const profileId = resolvedProfile.profileId;
    const postTargets = await collectProfileTargets(profileId, 'posts', ctx, payload.maxPages || DEFAULT_MAX_PAGES);
    const commentTargets = await collectProfileTargets(profileId, 'comments', ctx, payload.maxPages || DEFAULT_MAX_PAGES);
    const targets = Array.from(new Set([...postTargets, ...commentTargets]));
    progress(ctx, `用户 ${profileId} 本季度共发现 ${targets.length} 个点赞目标。`);

    const summary = createVoteSummary();
    summary.profiles.push(resolvedProfile);
    for (const target of targets) {
        mergeSummary(summary, await upVoteUrl(target, payload, ctx));
    }
    return summary;
}

export async function resolveProfileOnly(payload = {}, ctx = {}) {
    const input = payload.profileId || payload.profileInput || payload.input;
    const resolvedProfile = await resolveProfileRef(input, ctx, {
        label: payload.label,
        fallback: payload.fallback,
    });
    return {
        targets: 0,
        liked: 0,
        skipped: 0,
        failed: 0,
        profiles: [resolvedProfile],
    };
}

export async function upVoteUsers(payload = {}, ctx = {}) {
    const users = payload.users;
    if (!users || typeof users !== 'object') {
        throw new Error('users must be a JSON object or array');
    }

    const entries = Array.isArray(users)
        ? users.map((item) => [String(item), ''])
        : Object.entries(users);
    const summary = createVoteSummary();
    summary.batchUserResults = [];
    summary.batchRunLabel = await getBatchRunLabel(ctx);
    progress(ctx, summary.batchRunLabel, { batchRunLabel: summary.batchRunLabel });
    for (let index = 0; index < entries.length; index += 1) {
        const [name, profileValue] = entries[index];
        const resolvedProfile = await resolveProfileRef(name, ctx, {
            label: name,
            fallback: profileValue,
        });
        progress(ctx, `(${index + 1}/${entries.length}) 开始点赞用户：${name}`);
        const userSummary = await upVoteUser({ ...payload, profileId: resolvedProfile.profileId }, ctx);
        userSummary.profiles = [
            resolvedProfile,
            ...userSummary.profiles.filter((item) => item.profileId !== resolvedProfile.profileId),
        ];
        mergeSummary(summary, userSummary);
        const batchUserResult = {
            name,
            maskedName: maskDisplayName(name),
            profileId: resolvedProfile.profileId,
            profileUrl: resolvedProfile.profileUrl,
            total: Number(userSummary.liked || 0) + Number(userSummary.skipped || 0),
            liked: Number(userSummary.liked || 0),
            skipped: Number(userSummary.skipped || 0),
            failed: Number(userSummary.failed || 0),
            index: index + 1,
            count: entries.length,
        };
        summary.batchUserResults.push(batchUserResult);
        progress(ctx, `${batchUserResult.maskedName || name}: ${batchUserResult.total}`, { batchUserResult });
    }
    return summary;
}

export async function crawlCommunityFullAll(payload = {}, ctx = {}) {
    await ensureSupportReady(payload, ctx);
    const summary = createCrawlSummary();
    const state = await getCommunityState();
    state.byCommunity = state.byCommunity && typeof state.byCommunity === 'object' ? state.byCommunity : {};
    const mainProgressId = progressScope(payload, 'progressScope', 'overall');
    const detailProgressId = progressScope(payload, 'detailProgressScope', 'detail');

    progress(ctx, '开始通过 API 抓取社区列表...');
    const communities = (await fetchZendeskItems('/api/v2/community/topics.json', 'topics', {}, { ctx }))
        .map(normalizeCommunityTopic)
        .filter((community) => community.id);
    summary.communities = communities.length;
    progressBar(ctx, `共发现 ${communities.length} 个社区。`, 0, communities.length, '社区进度', mainProgressId);

    for (let index = 0; index < communities.length; index += 1) {
        const community = communities[index];
        const commId = String(community.id);
        const commState = {
            ...(state.byCommunity[commId] || {}),
            ...community,
            id: commId,
            topics: state.byCommunity[commId]?.topics || {},
        };
        state.byCommunity[commId] = commState;

        let pageUrl = buildZendeskApiUrl(`/api/v2/community/topics/${encodeURIComponent(commId)}/posts.json`, {
            'page[size]': ZENDESK_API_PAGE_SIZE,
        });
        let page = 0;
        let finishedCommunityTopics = 0;
        let knownCommunityTopics = 0;
        progressBar(ctx, `(${index + 1}/${communities.length}) 社区：${community.title}`, index, communities.length, '社区进度', mainProgressId);
        while (pageUrl) {
            page += 1;
            const pageData = await fetchZendeskJson(pageUrl, {}, ctx);
            const topics = (Array.isArray(pageData?.posts) ? pageData.posts : [])
                .map((post) => normalizeCommunityPost(post, commId))
                .filter((post) => post.id);
            knownCommunityTopics += topics.length;
            progressBar(ctx, `${community.title} API 第 ${page} 页：新增 ${topics.length} 个帖子。`, finishedCommunityTopics, knownCommunityTopics, `当前社区：${community.title}`, detailProgressId);

            const topicTasks = topics.map((topic, topicIndex) => async () => {
                const topicId = String(topic.id);
                const existing = commState.topics[topicId];
                if (postCommentsAreCurrent(existing, topic)) {
                    finishedCommunityTopics += 1;
                    progressBar(ctx, `跳过未变化帖子 (${finishedCommunityTopics}/${knownCommunityTopics})：${topic.title || topicId}`, finishedCommunityTopics, knownCommunityTopics, `当前社区：${community.title}`, detailProgressId);
                    return {
                        topicId,
                        topic,
                        existing,
                        skipped: true,
                    };
                }
                progressBar(ctx, `抓取帖子 (${topicIndex + 1}/${topics.length})：${topic.title || topicId}`, finishedCommunityTopics, knownCommunityTopics, `当前社区：${community.title}`, detailProgressId);
                const detail = await fetchPostComments(topic, ctx);
                finishedCommunityTopics += 1;
                progressBar(ctx, `已抓取帖子 (${finishedCommunityTopics}/${knownCommunityTopics})：${topic.title || topicId}`, finishedCommunityTopics, knownCommunityTopics, `当前社区：${community.title}`, detailProgressId);
                return {
                    topicId,
                    topic,
                    existing,
                    detail,
                    comments: commentsCount(detail.comments),
                };
            });
            const topicResults = await runWithConcurrency(topicTasks, Math.min(POST_DETAIL_CONCURRENCY, topics.length || 1));
            topicResults.forEach((result) => {
                if (!result) return;
                if (result.error) {
                    progress(ctx, `帖子抓取失败：${result.error.message || String(result.error)}`);
                    return;
                }
                if (result.skipped) {
                    commState.topics[result.topicId] = {
                        ...(result.existing || {}),
                        ...result.topic,
                        comments: result.existing?.comments || {},
                        lastCrawledAt: new Date().toISOString(),
                    };
                    return;
                }
                commState.topics[result.topicId] = {
                    ...(result.existing || {}),
                    ...result.topic,
                    ...(result.detail.post || {}),
                    postContent: result.detail.postContent || result.topic.postContent || '',
                    comments: result.detail.comments,
                    lastCrawledAt: new Date().toISOString(),
                };
                summary.topics += 1;
                summary.comments += result.comments;
                summary.updated += 1;
            });

            state.byCommunity[commId] = commState;
            state.byCommunityTime = new Date().toISOString();
            await saveCommunityStatePatch({
                byCommunity: state.byCommunity,
                byCommunityTime: state.byCommunityTime,
            });
            pageUrl = nextZendeskPageUrl(pageData);
        }
        progressBar(ctx, `${community.title} 完成。`, index + 1, communities.length, '社区进度', mainProgressId);
    }

    state.byCommunityTime = new Date().toISOString();
    await saveCommunityStatePatch({
        byCommunity: state.byCommunity,
        byCommunityTime: state.byCommunityTime,
    });
    progress(ctx, `社区帖子/评论抓取完成：更新 ${summary.updated} 帖。`);
    return summary;
}

export async function crawlRecentActivitiesIncremental(payload = {}, ctx = {}) {
    await ensureSupportReady(payload, ctx);
    const summary = createCrawlSummary();
    const state = await getCommunityState();
    state.byCommunity = state.byCommunity && typeof state.byCommunity === 'object' ? state.byCommunity : {};

    const perPage = Number(payload.perPage || ZENDESK_API_PAGE_SIZE);
    const prevTime = state.byCommunityTime ? new Date(state.byCommunityTime) : null;
    const cutoff = prevTime ? new Date(prevTime.getTime() - 2 * 3600 * 1000) : new Date(Date.now() - 2 * 3600 * 1000);
    const topicsMap = new Map();
    let pageUrl = buildZendeskApiUrl('/api/v2/community/posts.json', {
        'page[size]': perPage,
        sort_by: 'updated_at',
        sort_order: 'desc',
    });
    let page = 0;
    let stop = false;

    progress(ctx, '开始通过 API 增量更新最近帖子...');
    while (pageUrl && !stop) {
        page += 1;
        const data = await fetchZendeskJson(pageUrl, {}, ctx);
        const posts = Array.isArray(data?.posts) ? data.posts : [];
        if (!posts.length) break;

        for (const rawPost of posts) {
            const post = normalizeCommunityPost(rawPost);
            if (!post.id) continue;
            const timestamp = post.updatedAt || post.createdAt || post.datetime
                ? new Date(post.updatedAt || post.createdAt || post.datetime)
                : null;
            if (timestamp && timestamp < cutoff) {
                stop = true;
                break;
            }
            topicsMap.set(post.id, {
                topicId: post.id,
                commId: post.topicId || 'unknown',
                post,
            });
        }

        if (stop) break;
        pageUrl = nextZendeskPageUrl(data);
    }

    const topics = Array.from(topicsMap.values());
    summary.communities = new Set(topics.map((item) => String(item.commId || 'unknown'))).size;
    progressBar(ctx, `最近活动需要更新 ${topics.length} 个帖子。`, 0, topics.length, '最近活动增量', 'overall');
    let finishedTopics = 0;
    const updateTasks = topics.map((item, index) => async () => {
        const commId = String(item.commId || 'unknown');
        const commState = state.byCommunity[commId] || { id: commId, topics: {} };
        commState.topics = commState.topics || {};
        const existing = commState.topics[item.topicId];
        if (postCommentsAreCurrent(existing, item.post)) {
            finishedTopics += 1;
            progressBar(ctx, `最近活动跳过未变化 (${finishedTopics}/${topics.length})：${item.topicId}`, finishedTopics, topics.length, '最近活动增量', 'overall');
            return {
                item,
                commId,
                existing,
                skipped: true,
            };
        }
        progressBar(ctx, `最近活动抓取 (${index + 1}/${topics.length})：${item.topicId}`, finishedTopics, topics.length, '最近活动增量', 'overall');
        const detail = await fetchPostComments(item.post, ctx);
        finishedTopics += 1;
        progressBar(ctx, `最近活动已抓取 (${finishedTopics}/${topics.length})：${item.topicId}`, finishedTopics, topics.length, '最近活动增量', 'overall');
        return {
            item,
            commId,
            existing,
            detail,
        };
    });
    const updateResults = await runWithConcurrency(updateTasks, Math.min(RECENT_POST_CONCURRENCY, topics.length || 1));
    updateResults.forEach((result) => {
        if (!result) return;
        if (result.error) {
            progress(ctx, `最近活动帖子抓取失败：${result.error.message || String(result.error)}`);
            return;
        }
        const { item, commId, existing, detail } = result;
        const commState = state.byCommunity[commId] || { id: commId, topics: {} };
        commState.topics = commState.topics || {};
        if (result.skipped) {
            commState.topics[item.topicId] = {
                ...(existing || {}),
                ...(item.post || {}),
                comments: existing?.comments || {},
                lastCrawledAt: new Date().toISOString(),
            };
            state.byCommunity[commId] = commState;
            return;
        }
        commState.topics[item.topicId] = {
            ...(existing || {}),
            ...(item.post || {}),
            ...(detail.post || {}),
            id: item.topicId,
            commentNum: Math.max(Number(item.post?.commentNum || 0), commentsCount(detail.comments)),
            postContent: detail.postContent || item.post?.postContent || existing?.postContent || '',
            comments: detail.comments,
            lastCrawledAt: new Date().toISOString(),
        };
        state.byCommunity[commId] = commState;
        summary.topics += 1;
        summary.comments += commentsCount(detail.comments);
        summary.updated += 1;
    });

    state.byCommunityTime = new Date().toISOString();
    await saveCommunityStatePatch({
        byCommunity: state.byCommunity,
        byCommunityTime: state.byCommunityTime,
    });
    progress(ctx, `最近活动增量完成：更新 ${summary.updated} 帖。`);
    return summary;
}

async function fetchArticleDetailFromApi(article, ctx = {}) {
    const normalized = normalizeArticle(article);
    if (normalized.articleContent) return normalized;
    const articleId = parseApiId(article, 'articles', 'articleId');
    const data = await fetchZendeskJson(`/api/v2/help_center/en-us/articles/${encodeURIComponent(articleId)}.json`, {}, ctx);
    return normalizeArticle({ ...article, ...(data?.article || {}) });
}

export async function crawlCategoryFullAll(payload = {}, ctx = {}) {
    await ensureSupportReady(payload, ctx);
    const summary = createCrawlSummary();
    const state = await getCommunityState();
    state.byCategory = {};
    const mainProgressId = progressScope(payload, 'progressScope', 'overall');
    const detailProgressId = progressScope(payload, 'detailProgressScope', 'detail');

    progress(ctx, '开始通过 API 抓取分类/文章...');
    const [rawCategories, rawSections] = await Promise.all([
        fetchZendeskItems('/api/v2/help_center/en-us/categories.json', 'categories', {}, { ctx }),
        fetchZendeskItems('/api/v2/help_center/en-us/sections.json', 'sections', {}, { ctx }),
    ]);
    const categories = rawCategories
        .map(normalizeCategory)
        .filter((category) => category.id);
    const sectionsByCategory = new Map();
    rawSections
        .map((section) => normalizeSection(section))
        .filter((section) => section.id && section.categoryId)
        .forEach((section) => {
            const categoryId = String(section.categoryId);
            if (!sectionsByCategory.has(categoryId)) sectionsByCategory.set(categoryId, []);
            sectionsByCategory.get(categoryId).push(section);
        });
    progressBar(ctx, `共发现 ${categories.length} 个分类。`, 0, categories.length, '分类进度', mainProgressId);

    for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
        const category = categories[categoryIndex];
        const catId = String(category.id);
        const catState = {
            id: catId,
            url: category.url,
            title: category.title,
            description: category.description || '',
            sections: {},
        };
        progressBar(ctx, `(${categoryIndex + 1}/${categories.length}) 分类：${category.title}`, categoryIndex, categories.length, '分类进度', mainProgressId);

        let sections = sectionsByCategory.get(catId) || [];
        if (!sections.length) {
            sections = [{ id: 'root', url: category.url, title: `${category.title} (root)`, categoryId: catId }];
        }

        progressBar(ctx, `${category.title} 共 ${sections.length} 个子分类。`, 0, sections.length, `当前分类：${category.title}`, detailProgressId);
        let finishedSections = 0;
        const sectionTasks = sections.map((section, sectionIndex) => async () => {
            const secId = String(section.id || section.url);
            const secState = {
                id: secId,
                url: section.url,
                title: section.title,
                categoryId: section.categoryId || catId,
                parentSectionId: section.parentSectionId || '',
                description: section.description || '',
                articles: {},
            };
            progressBar(ctx, `抓取子分类 (${sectionIndex + 1}/${sections.length})：${section.title}`, finishedSections, sections.length, `当前分类：${category.title}`, detailProgressId);
            const articlesPath = secId === 'root'
                ? `/api/v2/help_center/en-us/categories/${encodeURIComponent(catId)}/articles.json`
                : `/api/v2/help_center/en-us/sections/${encodeURIComponent(secId)}/articles.json`;
            const articles = await fetchZendeskItems(articlesPath, 'articles', {}, { ctx });
            const tasks = articles.map((article) => async () => fetchArticleDetailFromApi(article, ctx));
            const details = await runWithConcurrency(tasks, Math.min(ARTICLE_CONCURRENCY, tasks.length || 1));
            details.forEach((detail) => {
                if (!detail || detail.error) return;
                secState.articles[String(detail.id)] = detail;
            });
            finishedSections += 1;
            progressBar(ctx, `${section.title} 完成：${Object.keys(secState.articles).length} 篇文章。`, finishedSections, sections.length, `当前分类：${category.title}`, detailProgressId);
            return {
                secId,
                secState,
                articles: Object.keys(secState.articles).length,
            };
        });
        const sectionResults = await runWithConcurrency(sectionTasks, Math.min(SECTION_CONCURRENCY, sections.length || 1));
        sectionResults.forEach((result) => {
            if (!result) return;
            if (result.error) {
                progress(ctx, `子分类抓取失败：${result.error.message || String(result.error)}`);
                return;
            }
            catState.sections[result.secId] = result.secState;
            summary.articles += result.articles;
            summary.updated += result.articles;
        });

        state.byCategory[catId] = catState;
        state.byCategoryTime = new Date().toISOString();
        await saveCommunityStatePatch({
            byCategory: state.byCategory,
            byCategoryTime: state.byCategoryTime,
        });
        summary.communities += 1;
        progressBar(ctx, `${category.title} 完成。`, categoryIndex + 1, categories.length, '分类进度', mainProgressId);
    }

    state.byCategoryTime = new Date().toISOString();
    await saveCommunityStatePatch({
        byCategory: state.byCategory,
        byCategoryTime: state.byCategoryTime,
    });
    progress(ctx, `分类/文章抓取完成：${summary.articles} 篇文章。`);
    return summary;
}

export async function crawlFullAll(payload = {}, ctx = {}) {
    const summary = createCrawlSummary();
    progress(ctx, '开始全量抓取帖子评论和文章...', {
        progress: [
            { id: 'overall', current: 0, total: 2, label: '全量抓取' },
            { id: 'community-main', current: 0, total: 0, label: '帖子评论' },
            { id: 'community-detail', current: 0, total: 0, label: '当前社区' },
            { id: 'category-main', current: 0, total: 0, label: '分类文章' },
            { id: 'category-detail', current: 0, total: 0, label: '当前分类' },
        ],
    });
    let finishedStages = 0;
    const stageTasks = [
        async () => {
            const stageSummary = await crawlCommunityFullAll({
                ...payload,
                progressScope: 'community-main',
                detailProgressScope: 'community-detail',
            }, ctx);
            finishedStages += 1;
            progressBar(ctx, '帖子和评论抓取完成。', finishedStages, 2, '全量抓取', 'overall');
            return stageSummary;
        },
        async () => {
            const stageSummary = await crawlCategoryFullAll({
                ...payload,
                progressScope: 'category-main',
                detailProgressScope: 'category-detail',
            }, ctx);
            finishedStages += 1;
            progressBar(ctx, '分类和文章抓取完成。', finishedStages, 2, '全量抓取', 'overall');
            return stageSummary;
        },
    ];
    const stageResults = [];
    for (const runStage of stageTasks) {
        try {
            stageResults.push(await runStage());
        } catch (error) {
            stageResults.push({ error });
        }
    }
    const errors = [];
    stageResults.forEach((stageSummary) => {
        if (stageSummary?.error) {
            errors.push(stageSummary.error.message || String(stageSummary.error));
            return;
        }
        mergeCrawlSummary(summary, stageSummary);
    });
    if (errors.length) {
        throw new Error(`全量抓取部分失败：${errors.join('；')}`);
    }
    progressBar(ctx, `全量抓取完成：更新 ${summary.updated} 项。`, 2, 2, '全量抓取', 'overall');
    return summary;
}

export async function runCommunityAction(action, payload = {}, ctx = {}) {
    if (['UPVOTE_POST', 'UPVOTE_USER', 'UPVOTE_USERS'].includes(action)) {
        resetVoteStats(ctx);
    }
    switch (action) {
        case 'AUTH_SUPPORT':
            return authenticateSupport(payload, ctx);
        case 'UPVOTE_POST':
            return upVotePost(payload, ctx);
        case 'UPVOTE_USER':
            return upVoteUser(payload, ctx);
        case 'UPVOTE_USERS':
            return upVoteUsers(payload, ctx);
        case 'RESOLVE_PROFILE':
            return resolveProfileOnly(payload, ctx);
        case 'CRAWL_FULL_ALL':
            return crawlFullAll(payload, ctx);
        case 'CRAWL_COMMUNITY_FULL':
            return crawlCommunityFullAll(payload, ctx);
        case 'CRAWL_RECENT_INCREMENTAL':
            return crawlRecentActivitiesIncremental(payload, ctx);
        case 'CRAWL_CATEGORY_FULL':
            return crawlCategoryFullAll(payload, ctx);
        case 'CLEAR_LIKED_IDS':
            return clearLikedIds();
        default:
            throw new Error(`Unsupported community action: ${action}`);
    }
}
