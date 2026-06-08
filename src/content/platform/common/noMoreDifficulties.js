/*
脚本功能：
 为https://api.worldquantbrain.com/的GET请求添加重试机制，避免回测时出现"WorldQuant BRAIN is experiencing some difficulties"而中断。
 （由于提交回测、修改因子属性等操作不是GET请求，可能还会遇到这样的报错，可以经用户确认手动重试解决，或自行修改下面的函数）

原理：
WQ前端自定义fetch函数以实现请求功能，但该函数在网络请求失败时会抛出错误，导致页面出现"WorldQuant BRAIN is experiencing some difficulties"。
本脚本在该函数基础上添加失败重试机制，并将其替换为修改后的fetch函数。

替换的原理：
    WQ前端替换了window.fetch函数，本脚本在其他程序访问window.fetch时，替换为修改版本的fetch函数（通过Object.defineProperty）。

难点：
    WQ前端自定义的fetch函数使用了JavaScript闭包中的其他函数与变量，正常情况下，在外部无法访问这些变量。
    但本脚本在其基础上修改fetch函数，为了让函数逻辑尽可能与原来相同，需要访问这些变量。
    解决方法：通过在加载原始JS代码时注入新代码，将这些变量保存在全局window中，使这些变量暴露出来。


注意：该脚本仅修改网页前端以实现GET请求出错时重试，不会修改WQ服务端的任何数据，不会对WQ服务器造成任何影响！
Note: This script only modifies the front end of the web page to implement retries when a GET request fails.
      It will not modify any data on the WQ server and will not have any impact on the WQ server!
*/
(function() {
    'use strict';

    // string where WQ frontend modifies the fetch function
    const TARGET_STRING =
          `(0,i.hl)(l,"fetch",(function(t){`;

    // inject code to expose functions and variables that we need
    // STRING_TO_INJECT would be inserted right after where the TARGET_STRING ends
    /* eslint-disable no-undef */
    const STRING_TO_INJECT = '(' + (function() {
        var expose_scope={};
        expose_scope.z=z;
        expose_scope.O=O;
        expose_scope.t=t;
        expose_scope.l=l;
        expose_scope.M=M;
        expose_scope.u=u;
        expose_scope.p=p;
        window.expose_scope=expose_scope;
        console.log('inject success. scope expose done. it will use our modified version of fetch.');
    }

                                   ).toString() + '());';
    /* eslint-enable no-undef */

    // patch the dom to load inject code
    async function patchScript(node) {
        node.remove();

        let scriptCode = await (await fetch(node.src)).text();

        const newNode = document.createElement('script');
        const targetIndex = scriptCode.indexOf(TARGET_STRING);

        if (targetIndex === -1) {
            // alert('Failed to inject! The WQ probably was updated');
            // console.warn('Failed to inject! The WQ probably was updated');
        } else {
            scriptCode =
                scriptCode.substring(0, targetIndex + TARGET_STRING.length) +
                STRING_TO_INJECT +
                scriptCode.substring(targetIndex + TARGET_STRING.length);
        }

        newNode.innerHTML = scriptCode;

        document.body.appendChild(newNode);
    }

    // watch the dom to patch
    new MutationObserver((mutationsList, obs) => {
        mutationsList.forEach((mutationRecord) => {
            for (const node of mutationRecord.addedNodes) {
                // if (node.src?.endsWith('6151.38f262e8.js')) { // this js filename often changes, try to patch all js files
                //if (node.src?.endsWith('.js')) {
                if (node.src?.startsWith('https://platform.worldquantbrain.com/static/js/')&&node.src?.endsWith('.js')) {
                    //obs.disconnect();
                    patchScript(node);
                    break;
                }
            }
        });
    }).observe(document, { childList: true, subtree: true });

    // our modified version of fetch. retry when net errors happen
    function ModifiedFetch(...e) {
        let expose_scope = window.expose_scope;
        let z = expose_scope.z;
        let O = expose_scope.O;
        let t = expose_scope.t;
        let l = expose_scope.l;
        let M = expose_scope.M;
        let u = expose_scope.u;
        let p = expose_scope.p;

        console.log('发起请求: ' + z(e) + ' ' + O(e));
        const n = {
            args: e,
            fetchData: {
                method: z(e),
                url: O(e)
            },
            startTimestamp: Date.now()
        };

        // 检查是否为需要重试的请求
        // 未将POST请求也纳入重试范围的原因是，重试这类请求，可能会造成潜在的副作用
        const isTargetRequest =
              z(e).toUpperCase() === "GET" &&
              O(e).startsWith("https://api.worldquantbrain.com/");

        // 重试机制 - 仅对目标请求启用
        let retryCount = 0;
        const maxRetries = 10;
        const retryStatuses = [429, 500, 502, 503, 504];

        // 修改点：在attemptFetch中添加对网络错误的处理
        const attemptFetch = () => {
            return t.apply(l, e)
                .then(response => {
                // 对目标请求检查状态码重试条件
                if (isTargetRequest &&
                    retryStatuses.includes(response.status) &&
                    retryCount < maxRetries) {

                    retryCount++;
                    console.log(`请求失败，状态码: ${response.status}，第${retryCount}次重试，URL: ${O(e)}`);

                    // 线性退避策略
                    const delay = retryCount * 500;
                    return new Promise(resolve =>
                                       setTimeout(resolve, delay)
                                      ).then(attemptFetch);
                }
                return response;
            })
                .catch(error => {
                // 新增：对目标请求检查网络错误重试条件
                if (isTargetRequest &&
                    retryCount < maxRetries &&
                    error.message &&
                    error.message.includes("Failed to fetch")) {

                    retryCount++;
                    console.log(`请求遇到网络错误: ${error.message}，第${retryCount}次重试，URL: ${O(e)}`);

                    // 线性退避策略
                    const delay = retryCount * 500;
                    return new Promise(resolve =>
                                       setTimeout(resolve, delay)
                                      ).then(attemptFetch);
                }
                // 非目标错误或超过重试次数则直接抛出
                throw error;
            });
        };

        M("fetch", u({}, n));

        // 仅对目标请求使用重试逻辑
        const fetchPromise = isTargetRequest ?
              attemptFetch() :
        t.apply(l, e);

        return fetchPromise
            .then(t => {
                M("fetch", p(u({}, n), {
                    endTimestamp: Date.now(),
                    response: t
                }));
                return t;
            })
            .catch(t => {
                M("fetch", p(u({}, n), {
                    endTimestamp: Date.now(),
                    error: t
                }));
                // 修复：防止未捕获异常导致页面崩溃，增加全局提示
                if (isTargetRequest && retryCount >= maxRetries) {
                    alert('多次重试后依然失败，请检查网络或稍后再试！');
                }
                throw t;
            });
    }

    // when not patched, return the fetch function as it programms (dont change anything)
    const originalFetch = window.fetch;
    let nowFetch=originalFetch;

    Object.defineProperty(window, 'fetch', {
        configurable: false,
        enumerable: true,
        set(newVal){
            console.log('fetch set by WQ frontend: ');
            console.log(newVal);
            nowFetch=newVal;
        },
        get() {
            // if patched, return our version of fetch
            if (typeof window.expose_scope !== 'undefined')
                return ModifiedFetch;
            else
                return nowFetch;
        }
    });
})();