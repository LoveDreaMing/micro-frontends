import Wujie from "./sandbox"; // 导入 Wujie 沙箱类，用于类型声明和实例引用
import { cacheOptions } from "./index"; // 导入缓存选项类型定义，来自 index.ts 的导出

export interface SandboxCache {
  wujie?: Wujie; // 可选：存放对应的 Wujie 实例
  options?: cacheOptions; // 可选：存放对应的配置项
}

export type appAddEventListenerOptions = AddEventListenerOptions & { targetWindow?: Window }; // 扩展浏览器 AddEventListenerOptions，增加 targetWindow 字段用于指定事件应该挂载到哪个 window

// 全部无界实例和配置存储map
// 除了挂载到WuJie实例上，还挂载到全局__WUJIE_INJECT变量上，防止重复创建
export const idToSandboxCacheMap = (() => {
  if (window.__WUJIE_INJECT?.idToSandboxMap) return window.__WUJIE_INJECT.idToSandboxMap; // 如果全局 __WUJIE_INJECT 已有 idToSandboxMap，则直接复用它
  else {
    const cacheMap = window.__POWERED_BY_WUJIE__ // 检查是否在无界环境中运行（主应用注入的标识）
      ? window.__WUJIE.inject.idToSandboxMap // 如果是主应用场景，从主应用注入的 __WUJIE 对象里取已有的 map
      : new Map<String, SandboxCache>(); // 否则新建一个 Map 用来缓存 id -> SandboxCache
    window.__WUJIE_INJECT = { ...window.__WUJIE_INJECT, idToSandboxMap: cacheMap }; // 把 cacheMap 挂到全局 __WUJIE_INJECT，避免后续重复创建
    return cacheMap; // 返回创建或获取到的 map
  }
})();

export function getWujieById(id: String): Wujie | null {
  return idToSandboxCacheMap.get(id)?.wujie || null; // 从缓存 map 中取出对应 id 的 wujie 实例，找不到则返回 null
}

export function getOptionsById(id: String): cacheOptions | null {
  return idToSandboxCacheMap.get(id)?.options || null; // 从缓存 map 中取出对应 id 的 options 配置，找不到则返回 null
}

export function addSandboxCacheWithWujie(id: string, sandbox: Wujie): void {
  const wujieCache = idToSandboxCacheMap.get(id); // 先尝试读取已有的缓存条目
  if (wujieCache) idToSandboxCacheMap.set(id, { ...wujieCache, wujie: sandbox }); // 如果存在则合并并更新 wujie 字段
  else idToSandboxCacheMap.set(id, { wujie: sandbox }); // 否则新建条目只包含 wujie
}

export function deleteWujieById(id: string) {
  const wujieCache = idToSandboxCacheMap.get(id); // 读取当前缓存条目
  if (wujieCache?.options) idToSandboxCacheMap.set(id, { options: wujieCache.options }); // 如果存在 options，则保留 options（只删除 wujie）
  idToSandboxCacheMap.delete(id); // 从 map 中删除该 id 的缓存记录（最终移除该键）
}

export function addSandboxCacheWithOptions(id: string, options: cacheOptions): void {
  const wujieCache = idToSandboxCacheMap.get(id); // 读取已有缓存
  if (wujieCache) idToSandboxCacheMap.set(id, { ...wujieCache, options }); // 存在则合并更新 options 字段
  else idToSandboxCacheMap.set(id, { options }); // 不存在则新建条目只包含 options
}

// 分类document上需要处理的属性，不同类型会进入不同的处理逻辑
export const documentProxyProperties = {
  // 降级场景下需要本地特殊处理的属性
  modifyLocalProperties: [
    "createElement", // 需要重写 createElement 以便在降级（iframe/shadow 不可用）时正确创建元素
    "createTextNode", // 需要重写 createTextNode 来保持文本节点行为一致
    "documentURI", // 需要修正 documentURI 以反映子应用上下文
    "URL", // 需要修正 document.URL 或类似字段
    "getElementsByTagName", // 需要重写查询方法以限制作用域或返回正确结果
    "getElementById", // 需要重写 getElementById 以避免返回宿主全局元素
  ],

  // 子应用需要手动修正的属性方法
  modifyProperties: [
    "createElement", // 同上 —— 在非降级场景也可能需要处理 createElement
    "createTextNode", // 同上 —— 文本节点创建的拦截
    "documentURI", // 同上
    "URL", // 同上
    "getElementsByTagName", // 同上
    "getElementsByClassName", // 查询类名的节点集合需要作用域化
    "getElementsByName", // 按 name 查询的行为可能需作用域化
    "getElementById", // 同上 —— id 查询需要限定子应用范围
    "querySelector", // CSS 选择器查询需要作用域修正
    "querySelectorAll", // 同上，为所有返回结果做作用域限定
    "documentElement", // documentElement 可能需要指向子应用的根节点
    "scrollingElement", // 滚动元素行为需要被隔离或代理
    "forms", // forms 集合需要按子应用作用域返回
    "images", // images 集合同样需要按子应用过滤
    "links", // links（比如 <link> 列表）应当返回子应用对应的条目
  ],

  // 需要从shadowRoot中获取的属性
  shadowProperties: [
    "activeElement", // activeElement 在 shadow 下应返回 shadow 内的活动元素
    "childElementCount", // 子元素计数需基于 shadow root
    "children", // children 列表需从 shadow root 获取
    "firstElementChild", // firstElementChild 需定位到 shadow 内第一个元素
    "firstChild", // firstChild 同理
    "fullscreenElement", // 全屏元素在 shadow 场景下需正确返回
    "lastElementChild", // lastElementChild 同理
    "pictureInPictureElement", // PiP 相关元素需在 shadow 场景中正确反映
    "pointerLockElement", // pointer lock 状态应以子应用上下文判断
    "styleSheets", // styleSheets 需要从 shadow root 聚合子应用样式表
  ],

  // 需要从shadowRoot中获取的方法
  shadowMethods: [
    "append", // append 方法在 shadow 中应当操作 shadow root
    "contains", // contains 在 shadow 范围内判断节点包含关系
    "getSelection", // 选择相关的方法要基于 shadow 范围
    "elementFromPoint", // 基于坐标的元素查找要支持 shadow 场景
    "elementsFromPoint", // 同上，返回位于坐标点的元素数组
    "getAnimations", // 动画查询在 shadow 内应返回对应元素动画
    "replaceChildren", // 替换子节点需要操作 shadow root
  ],

  // 需要从主应用document中获取的属性
  documentProperties: [
    "characterSet", // 文档字符集属于主应用级信息，直接取主 document
    "compatMode", // 文档兼容模式取主应用值
    "contentType", // 内容类型使用主 document 的值
    "designMode", // designMode 属于主 document 特性
    "dir", // 文档方向（ltr/rtl）取主 document
    "doctype", // doctype 是主文档全局概念
    "embeds", // embeds 集合属于主文档
    "fullscreenEnabled", // 是否允许全屏是主文档能力
    "hidden", // 文档是否隐藏（visibility）以主 document 为准
    "implementation", // DOMImplementation 来自主 document
    "lastModified", // 最后修改时间使用主 document 信息
    "pictureInPictureEnabled", // PiP 能力以主 document 为准
    "plugins", // 插件列表属于主 document
    "readyState", // 文档加载状态以主 document 为准
    "referrer", // 引用来源使用主 document 信息
    "visibilityState", // 可见性状态属于主 document
    "fonts", // 字体集合从主 document 获取
  ],

  // 需要从主应用document中获取的方法
  documentMethods: [
    "execCommand", // 编辑命令等方法以主 document 实现为准
    "caretPositionFromPoint", // 光标相关方法使用主文档行为
    "createRange", // Range 的创建以主 document 为源
    "exitFullscreen", // 退出全屏应由主 document 执行
    "exitPictureInPicture", // 退出 PiP 同理
    "getElementsByTagNameNS", // 命名空间下的查询使用主 document 实现
    "hasFocus", // 是否获得焦点属于主 document 状态
    "prepend", // prepend 等 DOM 操作在某些场景需委托给主 document
  ],

  // 需要从主应用document中获取的事件
  documentEvents: [
    "onpointerlockchange", // pointer lock 状态变化由主 document 触发
    "onpointerlockerror", // pointer lock 错误事件由主 document 触发
    "onbeforecopy", // 复制相关的钩子使用主 document
    "onbeforecut", // 剪切相关的钩子使用主 document
    "onbeforepaste", // 粘贴相关的钩子使用主 document
    "onfreeze", // 浏览器 freeze/resume 事件以主 document 为准
    "onresume", // resume 事件同上
    "onsearch", // 搜索相关事件由主 document 处理
    "onfullscreenchange", // 全屏变化事件主文档触发
    "onfullscreenerror", // 全屏错误事件主文档触发
    "onsecuritypolicyviolation", // CSP 违规事件在主 document 上触发
    "onvisibilitychange", // visibilitychange 在主 document 上触发
  ],

  // 无需修改原型的属性
  ownerProperties: ["head", "body"], // head 和 body 可以直接从宿主 document 使用，无需修改原型
};

// 需要挂载到子应用iframe document上的事件
export const appDocumentAddEventListenerEvents = ["DOMContentLoaded", "readystatechange"]; // 这类事件应该在子应用 document 上注册，以保证子应用可以接收到自己的加载状态事件
export const appDocumentOnEvents = ["onreadystatechange"]; // 需要复制到子应用 document 的 onXXX 事件属性列表
// 需要挂载到主应用document上的事件
export const mainDocumentAddEventListenerEvents = [
  "fullscreenchange", // 全屏相关事件需要挂载到主应用 document
  "fullscreenerror", // 全屏错误事件同上
  "selectionchange", // 文本选择变化事件应在主 document 处理
  "visibilitychange", // 可见性变化挂载到主 document
  "wheel", // 滚轮事件通常在主 document 上监听以避免冲突
  "keydown", // 键盘事件在主 document 上监听来统一处理
  "keypress", // 键盘按键事件同上
  "keyup", // 键盘释放事件同上
];

// 需要同时挂载到主应用document和shadow上的事件（互斥）
export const mainAndAppAddEventListenerEvents = ["gotpointercapture", "lostpointercapture"]; // 这些指针捕获事件在主应用和子应用之间需要特殊处理以避免冲突

// 子应用window监听需要挂载到iframe沙箱上的事件
export const appWindowAddEventListenerEvents = [
  "hashchange", // URL hash 变化事件应在子应用 window 上监听
  "popstate", // history popstate 事件同样属于子应用 window
  "DOMContentLoaded", // DOMContentLoaded 也可能需要在子应用 window 上触发
  "load", // load 事件在 window 层触发
  "beforeunload", // 页面卸载前的钩子应由子应用 window 拥有
  "unload", // 卸载事件也应在子应用 window 上触发
  "message", // postMessage 通信事件应在子应用 window 上监听
  "error", // 全局错误事件在子应用 window 上监听有助于隔离错误来源
  "unhandledrejection", // 未处理的 promise 拒绝事件同理
];

// 子应用window.onXXX需要挂载到iframe沙箱上的事件
export const appWindowOnEvent = ["onload", "onbeforeunload", "onunload", "onerror", "onunhandledrejection"]; // 这些 onX 属性需要从主环境复制到子应用 window（或 iframe 的 window）上以保持行为一致

// 相对路径问题元素的tag和attr的map
export const relativeElementTagAttrMap = {
  IMG: "src", // <img> 的相对路径应处理其 src 属性
  A: "href", // <a> 的相对路径应处理其 href 属性
  SOURCE: "src", // <source> 元素的 src 也需要做相对路径处理
};

// 需要单独处理的window属性
export const windowProxyProperties = ["getComputedStyle", "visualViewport", "matchMedia", "DOMParser"]; // 这些 API 在不同 window 上的实现或行为需单独代理或转发

// window白名单
export const windowRegWhiteList = [
  /animationFrame$/i, // 以 animationFrame 结尾的属性允许通过（如 requestAnimationFrame）
  /resizeObserver$|mutationObserver$|intersectionObserver$/i, // 观察器类 API 允许通过
  /height$|width$|left$/i, // 与尺寸/位置相关的属性允许通过
  /^screen/i, // screen 相关属性允许读取
  /CSSStyleSheet$/i, // CSSStyleSheet 相关允许透传
  /X$|Y$/, // 以 X 或 Y 结尾的属性允许（如 scrollX/scrollY）
];

// 保存原型方法
// 子应用的Document.prototype已经被改写了
export const rawElementAppendChild = HTMLElement.prototype.appendChild; // 保存原始 HTMLElement.prototype.appendChild 以便在被篡改时仍可调用原始方法
export const rawElementRemoveChild = HTMLElement.prototype.removeChild; // 保存原始 removeChild
export const rawElementContains = HTMLElement.prototype.contains; // 保存原始 contains
export const rawHeadInsertBefore = HTMLHeadElement.prototype.insertBefore; // 保存 head 的 insertBefore（用于注入样式等场景）
export const rawBodyInsertBefore = HTMLBodyElement.prototype.insertBefore; // 保存 body 的 insertBefore
export const rawInsertAdjacentElement = HTMLStyleElement.prototype.insertAdjacentElement; // 保存 style 元素的 insertAdjacentElement
export const rawAddEventListener = Node.prototype.addEventListener; // 保存 Node.prototype.addEventListener 原始实现
export const rawRemoveEventListener = Node.prototype.removeEventListener; // 保存 Node.prototype.removeEventListener 原始实现
export const rawWindowAddEventListener = window.addEventListener; // 保存 window.addEventListener 的原始引用
export const rawWindowRemoveEventListener = window.removeEventListener; // 保存 window.removeEventListener 的原始引用
export const rawAppendChild = Node.prototype.appendChild; // 保存 Node.prototype.appendChild（通用节点插入）
export const rawDocumentQuerySelector = window.__POWERED_BY_WUJIE__ // 如果在无界主应用环境中，使用主应用注入的原始 querySelector，否则使用 Document.prototype.querySelector 原始实现
  ? window.__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__ // 主应用注入的原始 querySelector（用于恢复未被改写的方法）
  : Document.prototype.querySelector; // 否则直接引用标准 Document.prototype.querySelector
