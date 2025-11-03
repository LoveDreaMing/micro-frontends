import {
  WUJIE_SCRIPT_ID,
  WUJIE_TIPS_NO_URL,
  WUJIE_APP_ID,
  WUJIE_TIPS_STOP_APP,
  WUJIE_TIPS_STOP_APP_DETAIL
} from './constant'; // 导入常量（用于标记、提示信息等）
import { plugin, cacheOptions } from './index'; // 导入类型定义（插件与缓存选项类型）

export function toArray<T>(array: T | T[]): T[] {
  return Array.isArray(array) ? array : [array]; // 将单值转换为数组，若已是数组则原样返回
}

export function isFunction(value: any): boolean {
  return typeof value === 'function'; // 判断是否为函数
}

export function isHijackingTag(tagName?: string) {
  return (
    tagName?.toUpperCase() === 'LINK' ||
    tagName?.toUpperCase() === 'STYLE' ||
    tagName?.toUpperCase() === 'SCRIPT' ||
    tagName?.toUpperCase() === 'IFRAME'
  ); // 判定某标签名是否为需要被劫持处理的资源相关标签（link/style/script/iframe）
}

export const wujieSupport = window.Proxy && window.CustomElementRegistry; // 检测运行环境是否支持 Proxy 与 自定义元素注册（用于能力判断）

/**
 * in safari
 * typeof document.all === 'undefined' // true
 * typeof document.all === 'function' // true
 * We need to discriminate safari for better performance
 */
const naughtySafari =
  typeof document.all === 'function' && typeof document.all === 'undefined'; // safari 特殊判断（document.all 的怪异 typeof 行为）
const callableFnCacheMap = new WeakMap<CallableFunction, boolean>(); // 缓存函数可调用性的 WeakMap，避免重复计算

export const isCallable = (fn: any) => {
  if (callableFnCacheMap.has(fn)) {
    return true; // 若缓存存在直接返回 true（意味着之前判断为可调用）
  }

  const callable = naughtySafari
    ? typeof fn === 'function' && typeof fn !== 'undefined'
    : typeof fn === 'function'; // 在 safari 环境做特殊判断
  if (callable) {
    callableFnCacheMap.set(fn, callable); // 将判断结果缓存起来
  }
  return callable; // 返回是否可调用
};

const boundedMap = new WeakMap<CallableFunction, boolean>(); // 缓存“已绑定函数”判断结果
export function isBoundedFunction(fn: CallableFunction) {
  if (boundedMap.has(fn)) {
    return boundedMap.get(fn); // 如果缓存则直接返回
  }
  const bounded =
    fn.name.indexOf('bound ') === 0 && !fn.hasOwnProperty('prototype'); // 判断函数名以 "bound " 开头且无 prototype 属性 => 被 bind 过
  boundedMap.set(fn, bounded); // 缓存判断结果
  return bounded; // 返回是否为绑定函数
}

const fnRegexCheckCacheMap = new WeakMap<any | FunctionConstructor, boolean>(); // 缓存构造函数/类检查的结果
export function isConstructable(fn: () => any | FunctionConstructor) {
  const hasPrototypeMethods =
    fn.prototype &&
    fn.prototype.constructor === fn &&
    Object.getOwnPropertyNames(fn.prototype).length > 1; // 判断 prototype 上是否有除 constructor 以外的方法（表明可作为构造函数）

  if (hasPrototypeMethods) return true; // 如果有 prototype 方法直接认为可构造

  if (fnRegexCheckCacheMap.has(fn)) {
    return fnRegexCheckCacheMap.get(fn); // 若缓存存在直接返回缓存结果
  }

  let constructable = hasPrototypeMethods; // 初始化标记
  if (!constructable) {
    const fnString = fn.toString(); // 将函数转换为字符串以做正则检测
    const constructableFunctionRegex = /^function\b\s[A-Z].*/; // 普通函数（以大写字母命名）可能是构造函数
    const classRegex = /^class\b/; // class 关键字表示可构造
    constructable =
      constructableFunctionRegex.test(fnString) || classRegex.test(fnString); // 通过正则判断是否可构造
  }

  fnRegexCheckCacheMap.set(fn, constructable); // 缓存判断结果
  return constructable; // 返回是否为构造函数/类
}

// 修复多个子应用启动，拿到的全局对象都是第一个子应用全局对象的bug：https://github.com/Tencent/wujie/issues/770
const setFnCacheMap = new WeakMap<
  Window | Document | ShadowRoot | Location,
  WeakMap<CallableFunction, CallableFunction>
>(); // 双层 WeakMap：外层 key 为目标对象（window/document 等），内层映射原函数 -> 绑定/缓存后的函数

export function checkProxyFunction(
  target: Window | Document | ShadowRoot | Location,
  value: any
) {
  if (
    isCallable(value) &&
    !isBoundedFunction(value) &&
    !isConstructable(value)
  ) {
    if (!setFnCacheMap.has(target)) {
      setFnCacheMap.set(target, new WeakMap()); // 若外层 map 不存在则创建新的内层 WeakMap
      setFnCacheMap.get(target).set(value, value); // 将原函数映射到自身（占位，稍后可能放绑定函数）
    } else if (!setFnCacheMap.get(target).has(value)) {
      setFnCacheMap.get(target).set(value, value); // 若内层 map 不含该函数则添加映射
    }
  }
} // 检查并记录可调用但未绑定的函数，避免不同子应用互相污染全局函数

/**
 * 获取目标对象的某个属性值，并且对可调用但未绑定的函数做 bind 绑定到目标对象上
 * @param target 目标对象
 * @param p 属性名
 * @returns 属性值（可能是绑定后的函数）
 */
export function getTargetValue(target: any, p: any): any {
  const value = target[p]; // 读取目标属性值
  if (setFnCacheMap.has(target) && setFnCacheMap.get(target).has(value)) {
    return setFnCacheMap.get(target).get(value); // 若已缓存绑定函数则直接返回绑定/缓存后的函数
  }
  if (
    isCallable(value) &&
    !isBoundedFunction(value) &&
    !isConstructable(value)
  ) {
    const boundValue = Function.prototype.bind.call(value, target); // 对函数做 bind，绑定到 target 上，避免 this 指向问题
    if (setFnCacheMap.has(target)) {
      setFnCacheMap.get(target).set(value, boundValue); // 将原函数 -> 绑定函数 缓存
    } else {
      setFnCacheMap.set(target, new WeakMap()); // 若无内层 map 则创建
      setFnCacheMap.get(target).set(value, boundValue); // 缓存映射
    }
    for (const key in value) {
      boundValue[key] = value[key]; // 复制原函数上的可枚举属性到绑定函数上，保持属性一致性
    }
    if (
      value.hasOwnProperty('prototype') &&
      !boundValue.hasOwnProperty('prototype')
    ) {
      // https://github.com/kuitos/kuitos.github.io/issues/47
      Object.defineProperty(boundValue, 'prototype', {
        value: value.prototype,
        enumerable: false,
        writable: true
      }); // 若原函数有 prototype，则为绑定函数补上 prototype，防止构造相关问题
    }
    return boundValue; // 返回绑定后的函数
  }
  return value; // 非函数或不需要绑定，直接返回原值
}

export function getDegradeIframe(id: string): HTMLIFrameElement {
  return window.document.querySelector(`iframe[${WUJIE_APP_ID}="${id}"]`); // 根据 data-wujie-id 查询已降级的 iframe 元素
}

export function setAttrsToElement(
  element: HTMLElement,
  attrs: { [key: string]: any }
) {
  Object.keys(attrs).forEach((name) => {
    element.setAttribute(name, attrs[name]); // 批量设置元素属性（用于设置 iframe attrs/degradeAttrs）
  });
}

export function appRouteParse(url: string): {
  urlElement: HTMLAnchorElement;
  appHostPath: string;
  appRoutePath: string;
} {
  if (!url) {
    error(WUJIE_TIPS_NO_URL); // 若 url 为空记录错误
    throw new Error(); // 抛出异常终止后续处理
  }
  const urlElement = anchorElementGenerator(url); // 通过 a 标签解析 url（利用浏览器的 URL 解析）
  const appHostPath = urlElement.protocol + '//' + urlElement.host; // 解析出 host（协议 + 主机）
  let appRoutePath = urlElement.pathname + urlElement.search + urlElement.hash; // 拼接 path + search + hash 为子应用路由路径
  if (!appRoutePath.startsWith('/')) appRoutePath = '/' + appRoutePath; // hack ie：确保以 / 开头
  return { urlElement, appHostPath, appRoutePath }; // 返回解析结果
}

export function anchorElementGenerator(url: string): HTMLAnchorElement {
  const element = window.document.createElement('a'); // 创建 a 标签用于解析
  element.href = url; // 设置 href
  element.href = element.href; // hack ie：重新赋值以规范 href（触发浏览器解析）
  return element; // 返回解析后的 a 元素
}

export function getAnchorElementQueryMap(anchorElement: HTMLAnchorElement): {
  [key: string]: string;
} {
  const queryString = anchorElement.search || ''; // 获取 search 部分（例如 ?a=b&c=d）
  return [...new URLSearchParams(queryString).entries()].reduce((p, c) => {
    p[c[0]] = c[1]; // 将查询参数转为键值对象
    return p;
  }, {} as Record<string, string>);
}

/**
 * 当前url的查询参数中是否有给定的id
 */
export function isMatchSyncQueryById(id: string): boolean {
  const queryMap = getAnchorElementQueryMap(
    anchorElementGenerator(window.location.href)
  ); // 解析当前地址的查询参数
  return Object.keys(queryMap).includes(id); // 判断 key 列表中是否包含目标 id
}

/**
 * 劫持元素原型对相对地址的赋值转绝对地址
 * @param iframeWindow
 */
export function fixElementCtrSrcOrHref(
  iframeWindow: Window,
  elementCtr:
    | typeof HTMLImageElement
    | typeof HTMLAnchorElement
    | typeof HTMLSourceElement
    | typeof HTMLLinkElement
    | typeof HTMLScriptElement
    | typeof HTMLMediaElement,
  attr
): void {
  // patch setAttribute
  const rawElementSetAttribute = iframeWindow.Element.prototype.setAttribute; // 保存原始 setAttribute
  elementCtr.prototype.setAttribute = function (
    name: string,
    value: string
  ): void {
    let targetValue = value;
    if (name === attr)
      targetValue = getAbsolutePath(value, this.baseURI || '', true); // 若设置的是目标属性（src/href），转换为绝对路径
    rawElementSetAttribute.call(this, name, targetValue); // 调用原始 setAttribute 设置属性
  };
  // patch href get and set
  const rawAnchorElementHrefDescriptor = Object.getOwnPropertyDescriptor(
    elementCtr.prototype,
    attr
  ); // 获取原有属性描述符（get/set）
  const { enumerable, configurable, get, set } = rawAnchorElementHrefDescriptor; // 解构出可枚举、可配置、getter、setter
  Object.defineProperty(elementCtr.prototype, attr, {
    enumerable,
    configurable,
    get: function () {
      return get.call(this); // 通过原 getter 返回值（保持行为一致）
    },
    set: function (href) {
      set.call(this, getAbsolutePath(href, this.baseURI, true)); // setter 时将 href 转为绝对路径再设置
    }
  });
  // TODO: innerHTML的处理
}

export function getCurUrl(proxyLocation: Object): string {
  const location = proxyLocation as Location; // 将 proxyLocation 视为 Location
  return location.protocol + '//' + location.host + location.pathname; // 返回协议+主机+路径作为当前 URL（不含 search/hash）
}

export function getAbsolutePath(
  url: string,
  base: string,
  hash?: boolean
): string {
  try {
    // 为空值无需处理
    if (url) {
      // 需要处理hash的场景
      if (hash && url.startsWith('#')) return url; // 若只处理 hash 且 url 是 hash，则直接返回原 hash
      return new URL(url, base).href; // 使用 URL 构造器将相对地址解析为绝对地址并返回 href
    } else return url; // 若 url 为空直接返回（无需解析）
  } catch {
    return url; // 出现异常（例如非法 URL）时返回原始 url，避免抛错中断流程
  }
}
/**
 * 获取需要同步的url
 */
export function getSyncUrl(
  id: string,
  prefix: { [key: string]: string }
): string {
  let winUrlElement = anchorElementGenerator(window.location.href); // 解析当前窗口地址
  const queryMap = getAnchorElementQueryMap(winUrlElement); // 获取查询参数映射
  winUrlElement = null; // 释放本地引用（提示 GC）
  const syncUrl = queryMap[id] || ''; // 从查询参数中读取 id 对应的短路径（如 {a}/path）
  const validShortPath = syncUrl.match(/^{([^}]*)}/)?.[1]; // 匹配 {key} 模式提取 key
  if (prefix && validShortPath) {
    return syncUrl.replace(`{${validShortPath}}`, prefix[validShortPath]); // 若提供 prefix，则用 prefix 映射替换短路径占位符
  }
  return syncUrl; // 返回最终的同步地址（可能为空字符串）
}
// @ts-ignore
export const requestIdleCallback =
  window.requestIdleCallback || ((cb: Function) => setTimeout(cb, 1)); // 在不支持 requestIdleCallback 的环境下回退为 setTimeout

export function getContainer(container: string | HTMLElement): HTMLElement {
  return typeof container === 'string'
    ? (document.querySelector(container) as HTMLElement)
    : container; // 支持传入选择器字符串或元素本身，返回 HTMLElement
}

export function warn(msg: string, data?: any): void {
  console?.warn(`[wujie warn]: ${msg}`, data); // 封装警告输出，带前缀
}

export function error(msg: string, data?: any): void {
  console?.error(`[wujie error]: ${msg}`, data); // 封装错误输出，带前缀
}

export function getInlineCode(match) {
  const start = match.indexOf('>') + 1; // 找到第一个 > 的位置，脚本内容开始
  const end = match.lastIndexOf('<'); // 找到最后一个 < 的位置，脚本内容结束
  return match.substring(start, end); // 返回标签内的内联代码
}

export function defaultGetPublicPath(entry) {
  if (typeof entry === 'object') {
    return '/'; // entry 为对象（例如多入口）时默认返回根路径
  }
  try {
    const { origin, pathname } = new URL(entry, location.href); // 使用 URL 解析 entry
    const paths = pathname.split('/'); // 将路径拆分为数组
    // 移除最后一个元素
    paths.pop(); // 去掉最后一段（通常是入口文件名），以得到公共路径
    return `${origin}${paths.join('/')}/`; // 拼接 origin + 目录路径 并以 / 结尾
  } catch (e) {
    console.warn(e); // 解析失败时打印警告
    return ''; // 返回空字符串作为兜底
  }
}

/** [f1, f2, f3, f4] => f4(f3(f2(f1))) 函数柯里化 */
export function compose(
  fnList: Array<Function>
): (...args: Array<string>) => string {
  return function (code: string, ...args: Array<any>) {
    return fnList.reduce(
      (newCode, fn) => (isFunction(fn) ? fn(newCode, ...args) : newCode),
      code || ''
    ); // 按顺序将 code 通过函数链处理并返回最终结果
  };
}

// 微任务
export function nextTick(cb: () => any): void {
  Promise.resolve().then(cb); // 在微任务队列中延迟执行回调（类似 Vue.nextTick）
}

//执行钩子函数
export function execHooks(
  plugins: Array<plugin>,
  hookName: string,
  ...args: Array<any>
): void {
  try {
    if (plugins && plugins.length > 0) {
      plugins
        .map((plugin) => plugin[hookName]) // 取出每个插件对应 hook 函数
        .filter((hook) => isFunction(hook)) // 过滤出实际存在的函数
        .forEach((hook) => hook(...args)); // 逐个执行 hook，参数透传
    }
  } catch (e) {
    error(e); // 捕获插件执行异常并记录错误，避免抛出影响主流程
  }
}

export function isScriptElement(element: HTMLElement): boolean {
  return element.tagName?.toUpperCase() === 'SCRIPT'; // 判断元素是否为 script 标签
}

let count = 1; // 内部计数器，用于给 script 打 tag
export function setTagToScript(element: HTMLScriptElement, tag?: string): void {
  if (isScriptElement(element)) {
    const scriptTag = tag || String(count++); // 若未传 tag 则使用自增计数生成唯一 tag
    element.setAttribute(WUJIE_SCRIPT_ID, scriptTag); // 将 tag 写入脚本元素属性用于标识
  }
}

export function getTagFromScript(element: HTMLScriptElement): string | null {
  if (isScriptElement(element)) {
    return element.getAttribute(WUJIE_SCRIPT_ID); // 从 script 元素读取之前设置的 tag
  }
  return null; // 非 script 元素返回 null
}

// 合并缓存
export function mergeOptions(
  options: cacheOptions,
  cacheOptions: cacheOptions
) {
  return {
    name: options.name, // name 必须提供
    el: options.el || cacheOptions?.el, // el 优先使用 options 的，fallback 到缓存
    url: options.url || cacheOptions?.url, // url 优先使用 options 的，fallback 到缓存
    html: options.html || cacheOptions?.html, // html 优先使用 options 的，fallback 到缓存
    exec: options.exec !== undefined ? options.exec : cacheOptions?.exec, // exec 优先 options，若未定义则使用缓存值
    replace: options.replace || cacheOptions?.replace, // replace 优先 options
    fetch: options.fetch || cacheOptions?.fetch, // fetch 优先 options
    props: options.props || cacheOptions?.props, // props 优先 options
    sync: options.sync !== undefined ? options.sync : cacheOptions?.sync, // sync 优先 options（允许 false）
    prefix: options.prefix || cacheOptions?.prefix, // prefix 优先 options
    loading: options.loading || cacheOptions?.loading, // loading 优先 options
    // 默认 {}
    attrs:
      options.attrs !== undefined ? options.attrs : cacheOptions?.attrs || {}, // attrs 若未定义则 fallback 到缓存或空对象
    degradeAttrs:
      options.degradeAttrs !== undefined
        ? options.degradeAttrs
        : cacheOptions?.degradeAttrs || {}, // degradeAttrs 合并策略同上
    // 默认 true
    fiber:
      options.fiber !== undefined
        ? options.fiber
        : cacheOptions?.fiber !== undefined
        ? cacheOptions?.fiber
        : true, // fiber 默认为 true，优先使用 options 的值
    alive: options.alive !== undefined ? options.alive : cacheOptions?.alive, // alive 优先 options
    degrade:
      options.degrade !== undefined ? options.degrade : cacheOptions?.degrade, // degrade 优先 options
    plugins: options.plugins || cacheOptions?.plugins, // plugins 优先 options
    iframeAddEventListeners:
      options.iframeAddEventListeners ||
      cacheOptions?.iframeAddEventListeners ||
      [], // iframeAddEventListeners 合并并默认空数组
    iframeOnEvents:
      options.iframeOnEvents || cacheOptions?.iframeOnEvents || [], // iframeOnEvents 合并并默认空数组
    lifecycles: {
      beforeLoad: options.beforeLoad || cacheOptions?.beforeLoad, // 生命周期钩子合并（优先 options）
      beforeMount: options.beforeMount || cacheOptions?.beforeMount,
      afterMount: options.afterMount || cacheOptions?.afterMount,
      beforeUnmount: options.beforeUnmount || cacheOptions?.beforeUnmount,
      afterUnmount: options.afterUnmount || cacheOptions?.afterUnmount,
      activated: options.activated || cacheOptions?.activated,
      deactivated: options.deactivated || cacheOptions?.deactivated,
      loadError: options.loadError || cacheOptions?.loadError
    }
  }; // 返回合并后的配置对象
}

/**
 * 事件触发器
 */
export function eventTrigger(
  el: HTMLElement | Window | Document,
  eventName: string,
  detail?: any
) {
  let event;
  if (typeof window.CustomEvent === 'function') {
    event = new CustomEvent(eventName, { detail }); // 使用标准 CustomEvent 构造器
  } else {
    event = document.createEvent('CustomEvent'); // 兼容旧浏览器的事件创建方式
    event.initCustomEvent(eventName, true, false, detail); // 初始化自定义事件
  }
  el.dispatchEvent(event); // 在指定元素/窗口上触发事件
}

export function stopMainAppRun() {
  warn(WUJIE_TIPS_STOP_APP_DETAIL); // 打印详细提示信息（指导开发者）
  throw new Error(WUJIE_TIPS_STOP_APP); // 抛出异常以强制终止主应用执行
}
