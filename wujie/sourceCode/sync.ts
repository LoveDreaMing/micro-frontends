import {
  anchorElementGenerator,
  getAnchorElementQueryMap,
  getSyncUrl,
  appRouteParse,
  getDegradeIframe
} from './utils'; // 导入工具函数，用于处理 URL、子应用路径解析以及获取降级 iframe
import { renderIframeReplaceApp, patchEventTimeStamp } from './iframe'; // 导入 iframe 渲染和事件时间戳 patch 方法
import {
  renderElementToContainer,
  initRenderIframeAndContainer
} from './shadow'; // 导入 shadow DOM 渲染相关方法
import { getWujieById, rawDocumentQuerySelector } from './common'; // 导入获取子应用实例和原生 querySelector 方法

/**
 * 同步子应用路由到主应用路由
 */
export function syncUrlToWindow(iframeWindow: Window): void {
  const { sync, id, prefix } = iframeWindow.__WUJIE; // 解构子应用 WUJIE 实例属性，获取是否同步、子应用 ID 和路径前缀映射
  let winUrlElement = anchorElementGenerator(window.location.href); // 将当前主应用 URL 转为 <a> 元素方便操作
  const queryMap = getAnchorElementQueryMap(winUrlElement); // 获取 URL 查询参数映射对象
  // 非同步且 url 上没有当前 id 的查询参数，则直接返回，不做同步
  if (!sync && !queryMap[id]) return (winUrlElement = null);
  const curUrl =
    iframeWindow.location.pathname +
    iframeWindow.location.search +
    iframeWindow.location.hash; // 获取子应用完整路径（pathname + search + hash）
  let validShortPath = ''; // 存储匹配到的短路径占位符
  // 处理短路径映射
  if (prefix) {
    Object.keys(prefix).forEach((shortPath) => {
      const longPath = prefix[shortPath]; // 获取对应长路径
      // 找出最长匹配路径
      if (
        curUrl.startsWith(longPath) &&
        (!validShortPath || longPath.length > prefix[validShortPath].length)
      ) {
        validShortPath = shortPath; // 记录最长匹配的短路径
      }
    });
  }
  // 根据 sync 标记进行 URL 同步或清理
  if (sync) {
    queryMap[id] = window.encodeURIComponent(
      validShortPath
        ? curUrl.replace(prefix[validShortPath], `{${validShortPath}}`)
        : curUrl
    ); // 同步子应用路径到主应用 URL 查询参数
  } else {
    delete queryMap[id]; // 不同步则清理当前子应用的参数
  }
  const newQuery =
    '?' +
    Object.keys(queryMap)
      .map((key) => key + '=' + queryMap[key])
      .join('&'); // 重新拼接查询参数字符串
  winUrlElement.search = newQuery; // 更新 <a> 元素的 search 属性
  if (winUrlElement.href !== window.location.href) {
    window.history.replaceState(null, '', winUrlElement.href); // 更新主应用浏览器 URL，但不触发页面刷新
  }
  winUrlElement = null; // 清理临时变量
}

/**
 * 同步主应用路由到子应用
 */
export function syncUrlToIframe(iframeWindow: Window): void {
  // 获取子应用当前路径信息
  const { pathname, search, hash } = iframeWindow.location;
  const { id, url, sync, execFlag, prefix, inject } = iframeWindow.__WUJIE; // 解构子应用属性
  // 只在首次加载或浏览器刷新时同步路径
  const idUrl = sync && !execFlag ? getSyncUrl(id, prefix) : url; // 获取同步 URL 或默认 URL
  const syncUrl = (/^http/.test(idUrl) ? null : idUrl) || url; // 排除 http/https 完整 URL，只处理相对或内部路径
  const { appRoutePath } = appRouteParse(syncUrl); // 解析出应用内部路由路径
  const preAppRoutePath = pathname + search + hash; // 当前子应用路径
  if (preAppRoutePath !== appRoutePath) {
    iframeWindow.history.replaceState(
      null,
      '',
      inject.mainHostPath + appRoutePath
    ); // 同步路径到子应用历史记录
  }
}

/**
 * 清理非激活态的子应用同步参数
 * 主应用采用 hash 模式时，切换子应用后已销毁的子应用同步参数还存在需要手动清理
 */
export function clearInactiveAppUrl(): void {
  let winUrlElement = anchorElementGenerator(window.location.href); // 获取主应用 URL <a> 元素
  const queryMap = getAnchorElementQueryMap(winUrlElement); // 获取查询参数映射
  Object.keys(queryMap).forEach((id) => {
    const sandbox = getWujieById(id); // 获取对应子应用实例
    if (!sandbox) return; // 子应用不存在则跳过
    // 仅清理执行过、已失活、非 href 跳转的子应用参数
    if (
      sandbox.execFlag &&
      sandbox.sync &&
      !sandbox.hrefFlag &&
      !sandbox.activeFlag
    ) {
      delete queryMap[id]; // 删除对应查询参数
    }
  });
  const newQuery =
    '?' +
    Object.keys(queryMap)
      .map((key) => key + '=' + window.decodeURIComponent(queryMap[key]))
      .join('&'); // 重新拼接查询参数
  winUrlElement.search = newQuery; // 更新 <a> 元素
  if (winUrlElement.href !== window.location.href) {
    window.history.replaceState(null, '', winUrlElement.href); // 更新主应用 URL
  }
  winUrlElement = null; // 清理临时变量
}

/**
 * 推送指定url到主应用路由
 */
export function pushUrlToWindow(id: string, url: string): void {
  let winUrlElement = anchorElementGenerator(window.location.href); // 将主应用 URL 转为 <a> 元素
  const queryMap = getAnchorElementQueryMap(winUrlElement); // 获取查询参数映射
  queryMap[id] = window.encodeURIComponent(url); // 设置子应用路径到查询参数
  const newQuery =
    '?' +
    Object.keys(queryMap)
      .map((key) => key + '=' + queryMap[key])
      .join('&'); // 拼接查询参数字符串
  winUrlElement.search = newQuery; // 更新 <a> 元素 search 属性
  window.history.pushState(null, '', winUrlElement.href); // 推送新 URL 到浏览器历史记录
  winUrlElement = null; // 清理临时变量
}

/**
 * 应用跳转(window.location.href)情况路由处理
 */
export function processAppForHrefJump(): void {
  window.addEventListener('popstate', () => {
    // 监听浏览器前进/后退事件
    let winUrlElement = anchorElementGenerator(window.location.href); // 将主应用 URL 转为 <a> 元素
    const queryMap = getAnchorElementQueryMap(winUrlElement); // 获取查询参数映射
    winUrlElement = null; // 清理临时变量
    Object.keys(queryMap)
      .map((id) => getWujieById(id)) // 获取每个子应用实例
      .filter((sandbox) => sandbox) // 过滤掉不存在的子应用
      .forEach((sandbox) => {
        const url = queryMap[sandbox.id]; // 获取对应子应用 URL
        const iframeBody = rawDocumentQuerySelector.call(
          sandbox.iframe.contentDocument,
          'body'
        ); // 获取子应用 iframe body
        // 前进 href 情况
        if (/http/.test(url)) {
          if (sandbox.degrade) {
            // 降级模式处理
            renderElementToContainer(
              sandbox.document.documentElement,
              iframeBody
            ); // 渲染主文档内容到 iframe
            renderIframeReplaceApp(
              window.decodeURIComponent(url),
              getDegradeIframe(sandbox.id).parentElement,
              sandbox.degradeAttrs
            ); // 渲染降级 iframe 应用
          } // 非降级模式
          else
            renderIframeReplaceApp(
              window.decodeURIComponent(url),
              sandbox.shadowRoot.host.parentElement,
              sandbox.degradeAttrs
            ); // 渲染子应用到 shadowRoot 容器
          sandbox.hrefFlag = true; // 标记 href 已处理
          // href 后退情况
        } else if (sandbox.hrefFlag) {
          if (sandbox.degrade) {
            // 降级模式回退处理
            const { iframe } = initRenderIframeAndContainer(
              sandbox.id,
              sandbox.el,
              sandbox.degradeAttrs
            ); // 重新初始化 iframe 容器
            patchEventTimeStamp(
              iframe.contentWindow,
              sandbox.iframe.contentWindow
            ); // 修复事件时间戳
            iframe.contentWindow.onunload = () => {
              sandbox.unmount(); // iframe 卸载时销毁子应用
            };
            iframe.contentDocument.appendChild(iframeBody.firstElementChild); // 恢复子应用 DOM
            sandbox.document = iframe.contentDocument; // 更新 document 引用
          } else renderElementToContainer(sandbox.shadowRoot.host, sandbox.el); // 非降级模式回退渲染到宿主容器
          sandbox.hrefFlag = false; // 重置 href 标记
        }
      });
  });
}
