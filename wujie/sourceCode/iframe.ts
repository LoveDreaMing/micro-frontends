import WuJie from './sandbox'; // 导入子应用沙盒类 WuJie
import { ScriptObject } from './template'; // 导入 ScriptObject 类型
import { renderElementToContainer } from './shadow'; // 导入 Shadow DOM 渲染方法
import { syncUrlToWindow } from './sync'; // 导入路由同步方法
import {
  fixElementCtrSrcOrHref, // 修复元素 src 或 href
  isConstructable, // 判断函数是否可构造
  anchorElementGenerator, // 生成 a 标签辅助函数
  isMatchSyncQueryById, // 判断同步 queryId 是否匹配
  isFunction, // 判断是否函数
  warn, // 控制台 warn
  error, // 控制台 error
  execHooks, // 执行插件钩子函数
  getCurUrl, // 获取当前 url
  getAbsolutePath, // 获取绝对路径
  setAttrsToElement, // 设置元素属性
  setTagToScript, // 设置 script 对象
  getTagFromScript // 获取 script 对象
} from './utils';
import {
  documentProxyProperties, // document 代理属性白名单
  rawAddEventListener, // 原生 addEventListener
  rawRemoveEventListener, // 原生 removeEventListener
  rawDocumentQuerySelector, // 原生 querySelector
  mainDocumentAddEventListenerEvents, // 主应用 document addEventListener 事件列表
  mainAndAppAddEventListenerEvents, // 主应用和子应用 addEventListener 事件列表
  appDocumentAddEventListenerEvents, // 子应用 document addEventListener 事件列表
  appDocumentOnEvents, // 子应用 document onXXX 事件列表
  appWindowAddEventListenerEvents, // 子应用 window addEventListener 事件列表
  appWindowOnEvent, // 子应用 window onXXX 事件列表
  windowProxyProperties, // window 代理属性白名单
  windowRegWhiteList, // window 正则白名单
  rawWindowAddEventListener, // 原生 window addEventListener
  rawWindowRemoveEventListener // 原生 window removeEventListener
} from './common';
import type { appAddEventListenerOptions } from './common'; // 导入子应用 addEventListener options 类型
import { getJsLoader } from './plugin'; // 导入 JS 加载插件
import { WUJIE_TIPS_SCRIPT_ERROR_REQUESTED, WUJIE_DATA_FLAG } from './constant'; // 导入常量
import { ScriptObjectLoader } from './index'; // 导入 ScriptObjectLoader 类

declare global {
  interface Window {
    __POWERED_BY_WUJIE__?: boolean; // 是否存在无界标记
    __WUJIE_PUBLIC_PATH__: string; // 子应用公共路径
    __WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__: typeof Document.prototype.querySelector; // 原生 querySelector

    __WUJIE_RAW_DOCUMENT_CREATE_ELEMENT__: typeof Document.prototype.createElement; // 原生 createElement
    __WUJIE_RAW_DOCUMENT_CREATE_TEXT_NODE__: typeof Document.prototype.createTextNode; // 原生 createTextNode
    __WUJIE_RAW_DOCUMENT_HEAD__: typeof Document.prototype.head; // 原生 head
    __WUJIE_RAW_DOCUMENT_QUERY_SELECTOR_ALL__: typeof Document.prototype.querySelectorAll; // 原生 querySelectorAll
    __WUJIE_RAW_WINDOW__: Window; // 原生 window 对象
    __WUJIE: WuJie; // 子应用沙盒实例
    __WUJIE_INJECT: WuJie['inject']; // 子应用注入共享上下文
    __WUJIE_EVENTLISTENER__: Set<{
      listener: EventListenerOrEventListenerObject;
      type: string;
      options: any;
    }>; // 注册在主应用的事件集合
    __WUJIE_MOUNT: () => void; // 子应用 mount 函数
    __WUJIE_UNMOUNT: () => void | Promise<void>; // 子应用 unmount 函数
    Document: typeof Document; // document 构造函数
    HTMLImageElement: typeof HTMLImageElement; // img 构造函数
    Node: typeof Node; // Node 构造函数
    Element: typeof Element; // Element 构造函数
    HTMLElement: typeof HTMLElement; // HTMLElement 构造函数
    HTMLAnchorElement: typeof HTMLAnchorElement; // a 标签构造函数
    HTMLSourceElement: typeof HTMLSourceElement; // source 标签构造函数
    HTMLLinkElement: typeof HTMLLinkElement; // link 标签构造函数
    HTMLScriptElement: typeof HTMLScriptElement; // script 标签构造函数
    HTMLMediaElement: typeof HTMLMediaElement; // media 标签构造函数
    EventTarget: typeof EventTarget; // EventTarget 构造函数
    Event: typeof Event; // Event 构造函数
    ShadowRoot: typeof ShadowRoot; // ShadowRoot 构造函数
    $wujie: { [key: string]: any }; // 注入对象
  }
  interface HTMLHeadElement {
    _cacheListeners: Map<string, EventListenerOrEventListenerObject[]>; // head 元素事件缓存
  }
  interface HTMLBodyElement {
    _cacheListeners: Map<string, EventListenerOrEventListenerObject[]>; // body 元素事件缓存
  }
  interface Document {
    createTreeWalker(
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null,
      entityReferenceExpansion?: boolean
    ): TreeWalker; // treeWalker 方法
  }
}

/**
 * 修改 window 对象的事件监听，只有路由事件采用 iframe 的事件
 */
function patchIframeEvents(iframeWindow: Window) {
  // patch iframe window add/removeEventListener
  iframeWindow.__WUJIE_EVENTLISTENER__ =
    iframeWindow.__WUJIE_EVENTLISTENER__ || new Set(); // 初始化事件集合
  iframeWindow.addEventListener = function addEventListener<
    K extends keyof WindowEventMap
  >( // 重写 addEventListener
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | appAddEventListenerOptions
  ) {
    execHooks(
      iframeWindow.__WUJIE.plugins,
      'windowAddEventListenerHook',
      iframeWindow,
      type,
      listener,
      options
    ); // 执行插件钩子
    iframeWindow.__WUJIE_EVENTLISTENER__.add({ type, listener, options }); // 添加到事件集合
    if (
      appWindowAddEventListenerEvents
        .concat(iframeWindow.__WUJIE.iframeAddEventListeners)
        .includes(type) ||
      (typeof options === 'object' && options.targetWindow)
    ) {
      const targetWindow =
        typeof options === 'object' && options.targetWindow
          ? options?.targetWindow
          : iframeWindow; // 判断目标 window
      return rawWindowAddEventListener.call(
        targetWindow,
        type,
        listener,
        options
      ); // 调用原生 addEventListener
    }
    rawWindowAddEventListener.call(
      window.__WUJIE_RAW_WINDOW__ || window,
      type,
      listener,
      options
    ); // 调用主应用原生 addEventListener
  };

  iframeWindow.removeEventListener = function removeEventListener<
    K extends keyof WindowEventMap
  >( // 重写 removeEventListener
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | appAddEventListenerOptions
  ) {
    execHooks(
      iframeWindow.__WUJIE.plugins,
      'windowRemoveEventListenerHook',
      iframeWindow,
      type,
      listener,
      options
    ); // 执行插件钩子
    iframeWindow.__WUJIE_EVENTLISTENER__.forEach((o) => {
      // 遍历事件集合删除
      if (o.listener === listener && o.type === type && options == o.options) {
        iframeWindow.__WUJIE_EVENTLISTENER__.delete(o); // 删除匹配事件
      }
    });
    if (
      appWindowAddEventListenerEvents
        .concat(iframeWindow.__WUJIE.iframeAddEventListeners)
        .includes(type) ||
      (typeof options === 'object' && options.targetWindow)
    ) {
      const targetWindow =
        typeof options === 'object' && options.targetWindow
          ? options?.targetWindow
          : iframeWindow; // 判断目标 window
      return rawWindowRemoveEventListener.call(
        targetWindow,
        type,
        listener,
        options
      ); // 调用原生 removeEventListener
    }
    rawWindowRemoveEventListener.call(
      window.__WUJIE_RAW_WINDOW__ || window,
      type,
      listener,
      options
    ); // 调用主应用原生 removeEventListener
  };
}

function patchIframeVariable(
  iframeWindow: Window,
  wujie: WuJie,
  appHostPath: string
): void {
  // 初始化 iframe window 变量
  iframeWindow.__WUJIE = wujie; // 注入沙盒实例
  iframeWindow.__WUJIE_PUBLIC_PATH__ = appHostPath + '/'; // 设置公共路径
  iframeWindow.$wujie = wujie.provide; // 注入共享对象
  iframeWindow.__WUJIE_RAW_WINDOW__ = iframeWindow; // 设置原生 window 引用
}

/**
 * 修改 iframe history
 */
function patchIframeHistory(
  iframeWindow: Window,
  appHostPath: string,
  mainHostPath: string
): void {
  // 重写 pushState 和 replaceState
  const history = iframeWindow.history; // 获取 history 对象
  const rawHistoryPushState = history.pushState; // 保存原生 pushState
  const rawHistoryReplaceState = history.replaceState; // 保存原生 replaceState
  history.pushState = function (data: any, title: string, url?: string): void {
    // 重写 pushState
    const baseUrl =
      mainHostPath +
      iframeWindow.location.pathname +
      iframeWindow.location.search +
      iframeWindow.location.hash; // 主应用基准 url
    const mainUrl = getAbsolutePath(url?.replace(appHostPath, ''), baseUrl); // 转换成绝对路径
    const ignoreFlag = url === undefined; // 是否忽略 url
    rawHistoryPushState.call(
      history,
      data,
      title,
      ignoreFlag ? undefined : mainUrl
    ); // 调用原生 pushState
    if (ignoreFlag) return; // 忽略同步
    updateBase(iframeWindow, appHostPath, mainHostPath); // 更新 base
    syncUrlToWindow(iframeWindow); // 同步路由到主应用
  };
  history.replaceState = function (
    data: any,
    title: string,
    url?: string
  ): void {
    // 重写 replaceState
    const baseUrl =
      mainHostPath +
      iframeWindow.location.pathname +
      iframeWindow.location.search +
      iframeWindow.location.hash; // 主应用基准 url
    const mainUrl = getAbsolutePath(url?.replace(appHostPath, ''), baseUrl); // 转换绝对路径
    const ignoreFlag = url === undefined; // 是否忽略 url
    rawHistoryReplaceState.call(
      history,
      data,
      title,
      ignoreFlag ? undefined : mainUrl
    ); // 调用原生 replaceState
    if (ignoreFlag) return; // 忽略同步
    updateBase(iframeWindow, appHostPath, mainHostPath); // 更新 base
    syncUrlToWindow(iframeWindow); // 同步路由到主应用
  };
}

/**
 * 动态修改 iframe base
 */
function updateBase(
  iframeWindow: Window,
  appHostPath: string,
  mainHostPath: string
) {
  // 更新 base 标签 href
  const baseUrl = new URL(
    iframeWindow.location.href?.replace(mainHostPath, ''),
    appHostPath
  ); // 构造 baseUrl
  const baseElement = rawDocumentQuerySelector.call(
    iframeWindow.document,
    'base'
  ); // 获取 base 元素
  if (baseElement)
    baseElement.setAttribute('href', appHostPath + baseUrl.pathname); // 设置 base href
}

/**
 * patch window effect
 */
function patchWindowEffect(iframeWindow: Window): void {
  // 代理 window 全局属性
  function processWindowProperty(key: string): boolean {
    // 处理单个 window 属性
    const value = iframeWindow[key]; // 获取属性值
    try {
      if (typeof value === 'function' && !isConstructable(value)) {
        iframeWindow[key] = window[key].bind(window); // 绑定主应用 window
      } else {
        iframeWindow[key] = window[key]; // 直接赋值
      }
      return true;
    } catch (e) {
      warn(e.message); // 打印警告
      return false;
    }
  }
  Object.getOwnPropertyNames(iframeWindow).forEach((key) => {
    // 遍历属性
    if (key === 'getSelection') {
      // 特殊处理 getSelection
      Object.defineProperty(iframeWindow, key, {
        get: () => iframeWindow.document[key] // 返回 document.getSelection
      });
      return;
    }
    if (windowProxyProperties.includes(key)) {
      // 单独属性处理
      processWindowProperty(key); // 处理属性
      return;
    }
    windowRegWhiteList.some((reg) => {
      // 正则匹配处理
      if (reg.test(key) && key in iframeWindow.parent) {
        return processWindowProperty(key); // 处理属性
      }
      return false;
    });
  });
  const windowOnEvents = Object.getOwnPropertyNames(window) // 获取所有 onXXX 事件
    .filter((p) => /^on/.test(p))
    .filter(
      (e) =>
        !appWindowOnEvent
          .concat(iframeWindow.__WUJIE.iframeOnEvents)
          .includes(e)
    ); // 排除白名单

  windowOnEvents.forEach((e) => {
    // 重写 window onXXX
    const descriptor = Object.getOwnPropertyDescriptor(iframeWindow, e) || {
      enumerable: true,
      writable: true
    };
    try {
      Object.defineProperty(iframeWindow, e, {
        enumerable: descriptor.enumerable, // 保留枚举属性
        configurable: true, // 可配置
        get: () => window[e], // 返回主应用 window 的事件
        set:
          descriptor.writable || descriptor.set
            ? (handler) => {
                window[e] =
                  typeof handler === 'function'
                    ? handler.bind(iframeWindow)
                    : handler; // 绑定 iframeWindow
              }
            : undefined
      });
    } catch (e) {
      warn(e.message); // 打印警告
    }
  });
  execHooks(
    iframeWindow.__WUJIE.plugins,
    'windowPropertyOverride',
    iframeWindow
  ); // 执行插件钩子
}

/**
 * 记录节点的监听事件
 */
function recordEventListeners(iframeWindow: Window) {
  // 代理 Node add/removeEventListener
  const sandbox = iframeWindow.__WUJIE; // 获取 sandbox
  iframeWindow.Node.prototype.addEventListener = function (
    // 重写 Node addEventListener
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    const elementListenerList = sandbox.elementEventCacheMap.get(this); // 获取缓存
    if (elementListenerList) {
      if (
        !elementListenerList.find(
          (listener) => listener.type === type && listener.handler === handler
        )
      ) {
        elementListenerList.push({ type, handler, options }); // 缓存事件
      }
    } else sandbox.elementEventCacheMap.set(this, [{ type, handler, options }]); // 初始化缓存
    return rawAddEventListener.call(this, type, handler, options); // 调用原生 addEventListener
  };

  iframeWindow.Node.prototype.removeEventListener = function (
    // 重写 Node removeEventListener
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    const elementListenerList = sandbox.elementEventCacheMap.get(this); // 获取缓存
    if (elementListenerList) {
      const index = elementListenerList?.findIndex(
        (ele) => ele.type === type && ele.handler === handler
      ); // 查找索引
      elementListenerList.splice(index, 1); // 删除事件缓存
    }
    if (!elementListenerList?.length) {
      sandbox.elementEventCacheMap.delete(this); // 清空缓存
    }
    return rawRemoveEventListener.call(this, type, handler, options); // 调用原生 removeEventListener
  };
}

/**
 * 恢复节点的监听事件
 */
export function recoverEventListeners(
  rootElement: Element | ChildNode,
  iframeWindow: Window
) {
  // 恢复节点事件
  const sandbox = iframeWindow.__WUJIE; // 获取 sandbox
  const elementEventCacheMap: WeakMap<
    // 新建 WeakMap
    Node,
    Array<{
      type: string;
      handler: EventListenerOrEventListenerObject;
      options: any;
    }>
  > = new WeakMap();
  const ElementIterator = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  ); // 遍历所有元素
  let nextElement = ElementIterator.currentNode; // 当前节点
  while (nextElement) {
    const elementListenerList = sandbox.elementEventCacheMap.get(nextElement); // 获取节点事件列表
    if (elementListenerList?.length) {
      elementEventCacheMap.set(nextElement, elementListenerList); // 记录到新缓存
      elementListenerList.forEach((listener) => {
        nextElement.addEventListener(
          listener.type,
          listener.handler,
          listener.options
        ); // 重新绑定事件
      });
    }
    nextElement = ElementIterator.nextNode() as HTMLElement; // 下一个节点
  }
  sandbox.elementEventCacheMap = elementEventCacheMap; // 更新 sandbox 缓存
}

/**
 * 恢复根节点的监听事件
 */
export function recoverDocumentListeners( // 恢复根节点事件
  oldRootElement: Element | ChildNode,
  newRootElement: Element | ChildNode,
  iframeWindow: Window
) {
  const sandbox = iframeWindow.__WUJIE; // 获取 sandbox
  const elementEventCacheMap: WeakMap<
    // 新建 WeakMap
    Node,
    Array<{
      type: string;
      handler: EventListenerOrEventListenerObject;
      options: any;
    }>
  > = new WeakMap();
  const elementListenerList = sandbox.elementEventCacheMap.get(oldRootElement); // 获取旧根节点事件列表
  if (elementListenerList?.length) {
    elementEventCacheMap.set(newRootElement, elementListenerList); // 绑定到新根节点
    elementListenerList.forEach((listener) => {
      newRootElement.addEventListener(
        listener.type,
        listener.handler,
        listener.options
      ); // 重新绑定事件
    });
  }
  sandbox.elementEventCacheMap = elementEventCacheMap; // 更新缓存
}

/**
 * 修复vue绑定事件e.timeStamp < attachedTimestamp 的情况
 */
export function patchEventTimeStamp(
  targetWindow: Window,
  iframeWindow: Window
) {
  Object.defineProperty(targetWindow.Event.prototype, 'timeStamp', {
    // 劫持 Event.prototype.timeStamp getter
    get: () => {
      return iframeWindow.document.createEvent('Event').timeStamp; // 返回 iframe 内部 document 创建事件的时间戳，保证时间戳不小于 attachedTimestamp
    }
  });
}

/**
 * patch document effect
 * @param iframeWindow
 */
// TODO 继续改进
function patchDocumentEffect(iframeWindow: Window): void {
  const sandbox = iframeWindow.__WUJIE; // 获取当前 iframe 的 Wujie 沙箱实例

  /**
   * 处理 addEventListener和removeEventListener
   * 由于这个劫持导致 handler 的this发生改变，所以需要handler.bind(document)
   * 但是这样会导致removeEventListener无法正常工作，因为handler => handler.bind(document)
   * 这个地方保存callback = handler.bind(document) 方便removeEventListener
   */
  const handlerCallbackMap: WeakMap<
    EventListenerOrEventListenerObject,
    EventListenerOrEventListenerObject
  > = new WeakMap(); // 原始 handler 与绑定后的 handler 映射，用于 removeEventListener
  const handlerTypeMap: WeakMap<
    EventListenerOrEventListenerObject,
    Array<string>
  > = new WeakMap(); // 保存 handler 注册的事件类型列表
  iframeWindow.Document.prototype.addEventListener = function (
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!handler) return; // 无 handler 则直接返回
    let callback = handlerCallbackMap.get(handler); // 获取绑定后的 callback
    const typeList = handlerTypeMap.get(handler); // 获取 handler 已注册的事件类型
    // 设置 handlerCallbackMap
    if (!callback) {
      callback = typeof handler === 'function' ? handler.bind(this) : handler; // 如果是函数，绑定 this 为 document
      handlerCallbackMap.set(handler, callback); // 保存绑定后的 callback
    }
    // 设置 handlerTypeMap
    if (typeList) {
      if (!typeList.includes(type)) typeList.push(type); // 如果已有 type 列表，加入新类型
    } else {
      handlerTypeMap.set(handler, [type]); // 新建 type 列表
    }

    // 运行插件钩子函数
    execHooks(
      iframeWindow.__WUJIE.plugins,
      'documentAddEventListenerHook',
      iframeWindow,
      type,
      callback,
      options
    ); // 执行插件 hook
    if (appDocumentAddEventListenerEvents.includes(type)) {
      return rawAddEventListener.call(this, type, callback, options); // app 专用事件直接调用原生 addEventListener
    }
    // 降级统一走 sandbox.document
    if (sandbox.degrade)
      return sandbox.document.addEventListener(type, callback, options); // 降级模式绑定到 sandbox.document
    if (mainDocumentAddEventListenerEvents.includes(type))
      return window.document.addEventListener(type, callback, options); // 主应用专用事件绑定到主 window.document
    if (mainAndAppAddEventListenerEvents.includes(type)) {
      window.document.addEventListener(type, callback, options); // 同时绑定到主 document
      sandbox.shadowRoot.addEventListener(type, callback, options); // 和子应用 shadowRoot
      return;
    }
    sandbox.shadowRoot.addEventListener(type, callback, options); // 默认绑定到 shadowRoot
  };
  iframeWindow.Document.prototype.removeEventListener = function (
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    const callback: EventListenerOrEventListenerObject =
      handlerCallbackMap.get(handler); // 获取绑定后的 callback
    const typeList = handlerTypeMap.get(handler); // 获取注册类型列表
    if (callback) {
      if (typeList?.includes(type)) {
        typeList.splice(typeList.indexOf(type), 1); // 移除事件类型
        if (!typeList.length) {
          handlerCallbackMap.delete(handler); // 如果没有类型了，删除映射
          handlerTypeMap.delete(handler); // 删除类型映射
        }
      }

      // 运行插件钩子函数
      execHooks(
        iframeWindow.__WUJIE.plugins,
        'documentRemoveEventListenerHook',
        iframeWindow,
        type,
        callback,
        options
      ); // 执行插件 hook
      if (appDocumentAddEventListenerEvents.includes(type)) {
        return rawRemoveEventListener.call(this, type, callback, options); // app 专用事件直接调用原生 removeEventListener
      }
      if (sandbox.degrade)
        return sandbox.document.removeEventListener(type, callback, options); // 降级模式
      if (mainDocumentAddEventListenerEvents.includes(type)) {
        return window.document.removeEventListener(type, callback, options); // 主 document
      }
      if (mainAndAppAddEventListenerEvents.includes(type)) {
        window.document.removeEventListener(type, callback, options); // 主 document
        sandbox.shadowRoot.removeEventListener(type, callback, options); // shadowRoot
        return;
      }
      sandbox.shadowRoot.removeEventListener(type, callback, options); // 默认 shadowRoot
    }
  };
  // 处理onEvent
  const elementOnEvents = Object.keys(
    iframeWindow.HTMLElement.prototype
  ).filter((ele) => /^on/.test(ele)); // 获取元素 onXXX 事件
  const documentOnEvent = Object.keys(iframeWindow.Document.prototype)
    .filter((ele) => /^on/.test(ele))
    .filter((ele) => !appDocumentOnEvents.includes(ele)); // document onXXX 事件过滤掉 app 特殊事件
  elementOnEvents
    .filter((e) => documentOnEvent.includes(e))
    .forEach((e) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        iframeWindow.Document.prototype,
        e
      ) || {
        enumerable: true,
        writable: true
      }; // 获取属性描述符
      try {
        Object.defineProperty(iframeWindow.Document.prototype, e, {
          enumerable: descriptor.enumerable, // 保留原 enumerable
          configurable: true, // 可配置
          get: () =>
            sandbox.degrade
              ? sandbox.document[e]
              : sandbox.shadowRoot.firstElementChild[e], // getter 返回 sandbox 或 shadowRoot.firstElementChild 的事件
          set:
            descriptor.writable || descriptor.set
              ? (handler) => {
                  const val =
                    typeof handler === 'function'
                      ? handler.bind(iframeWindow.document)
                      : handler; // 绑定 this
                  sandbox.degrade
                    ? (sandbox.document[e] = val)
                    : (sandbox.shadowRoot.firstElementChild[e] = val); // 设置事件
                }
              : undefined
        });
      } catch (e) {
        warn(e.message); // 捕获异常并警告
      }
    });
  // 处理属性get
  const {
    ownerProperties,
    modifyProperties,
    shadowProperties,
    shadowMethods,
    documentProperties,
    documentMethods,
    documentEvents
  } = documentProxyProperties; // 解构文档需要代理的属性、方法、事件
  modifyProperties
    .concat(
      shadowProperties,
      shadowMethods,
      documentProperties,
      documentMethods
    )
    .forEach((propKey) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        iframeWindow.Document.prototype,
        propKey
      ) || {
        enumerable: true,
        writable: true
      }; // 获取属性描述符
      try {
        Object.defineProperty(iframeWindow.Document.prototype, propKey, {
          enumerable: descriptor.enumerable, // 保留原 enumerable
          configurable: true,
          get: () => sandbox.proxyDocument[propKey], // 返回 sandbox.proxyDocument 对应属性
          set: undefined // 禁止设置
        });
      } catch (e) {
        warn(e.message); // 捕获异常并警告
      }
    });
  // 处理document专属事件
  // TODO 内存泄露
  documentEvents.forEach((propKey) => {
    const descriptor = Object.getOwnPropertyDescriptor(
      iframeWindow.Document.prototype,
      propKey
    ) || {
      enumerable: true,
      writable: true
    }; // 获取属性描述符
    //get里获取属性值，set里直接对iframeWindow.document[propKey]赋值，下一个handler绑在iframeWindow.document[propKey]之前需要对之前的handler解绑
    try {
      Object.defineProperty(iframeWindow.Document.prototype, propKey, {
        enumerable: descriptor.enumerable,
        configurable: true,
        get: () => (sandbox.degrade ? sandbox : window).document[propKey], // getter 返回 sandbox 或主 window.document 的事件
        set:
          descriptor.writable || descriptor.set
            ? (handler) => {
                (sandbox.degrade
                  ? sandbox
                  : window
                ).document.removeEventListener(
                  propKey,
                  handlerCallbackMap.get(handler)
                ); // 先移除原有 handler
                (sandbox.degrade ? sandbox : window).document.addEventListener(
                  propKey,
                  typeof handler === 'function'
                    ? handler.bind(iframeWindow.document)
                    : handler
                ); // 添加新的 handler
                handlerCallbackMap.set(
                  handler,
                  handler.bind(iframeWindow.document)
                ); // 更新映射
              }
            : undefined
      });
    } catch (e) {
      warn(e.message); // 捕获异常并警告
    }
  });
  // process owner property
  ownerProperties.forEach((propKey) => {
    Object.defineProperty(iframeWindow.document, propKey, {
      enumerable: true,
      configurable: true,
      get: () => sandbox.proxyDocument[propKey], // 返回 sandbox.proxyDocument 的 ownerProperties
      set: undefined // 禁止设置
    });
  });
  // 运行插件钩子函数
  execHooks(
    iframeWindow.__WUJIE.plugins,
    'documentPropertyOverride',
    iframeWindow
  ); // 执行插件 hook
}

/**
 * patch Node effect
 * 1、处理 getRootNode
 * 2、处理 appendChild、insertBefore，当插入的节点为 svg 时，createElement 的 patch 会被去除，需要重新 patch
 * @param iframeWindow
 */
function patchNodeEffect(iframeWindow: Window): void {
  const rawGetRootNode = iframeWindow.Node.prototype.getRootNode; // 保存原始 getRootNode
  const rawAppendChild = iframeWindow.Node.prototype.appendChild; // 保存原始 appendChild
  const rawInsertRule = iframeWindow.Node.prototype.insertBefore; // 保存原始 insertBefore
  const rawRemoveChild = iframeWindow.Node.prototype.removeChild; // 保存原始 removeChild
  iframeWindow.Node.prototype.getRootNode = function (
    options?: GetRootNodeOptions
  ): Node {
    const rootNode = rawGetRootNode.call(this, options); // 调用原始 getRootNode
    if (rootNode === iframeWindow.__WUJIE.shadowRoot)
      return iframeWindow.document; // shadowRoot 返回 document
    else return rootNode; // 其他情况返回原始 root
  };
  iframeWindow.Node.prototype.appendChild = function <T extends Node>(
    node: T
  ): T {
    const res = rawAppendChild.call(this, node); // 调用原始 appendChild
    patchElementEffect(node, iframeWindow); // 对新插入节点做 patch
    return res; // 返回节点
  };
  iframeWindow.Node.prototype.insertBefore = function <T extends Node>(
    node: T,
    child: Node | null
  ): T {
    const res = rawInsertRule.call(this, node, child); // 调用原始 insertBefore
    patchElementEffect(node, iframeWindow); // 对插入节点做 patch
    return res; // 返回节点
  };
  iframeWindow.Node.prototype.removeChild = function <T extends Node>(
    node: T
  ): T {
    let res;
    try {
      res = rawRemoveChild.call(this, node); // 尝试调用原始 removeChild
    } catch (e) {
      console.warn(
        `Failed to removeChild: ${node.nodeName.toLowerCase()} is not a child of ${this.nodeName.toLowerCase()}, try again with parentNode attribute. ` // 移除失败提示
      );
      if (node.isConnected && isFunction(node.parentNode?.removeChild)) {
        node.parentNode.removeChild(node); // 使用 parentNode 再尝试删除
      }
    }
    patchElementEffect(node, iframeWindow); // 对删除节点做 patch
    return res; // 返回节点
  };
}

/**
 * 修复资源元素的相对路径问题
 * @param iframeWindow
 */
function patchRelativeUrlEffect(iframeWindow: Window): void {
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLImageElement, 'src'); // 修复 img src 相对路径
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLAnchorElement, 'href'); // 修复 a href 相对路径
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLSourceElement, 'src'); // 修复 source src 相对路径
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLLinkElement, 'href'); // 修复 link href 相对路径
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLScriptElement, 'src'); // 修复 script src 相对路径
  fixElementCtrSrcOrHref(iframeWindow, iframeWindow.HTMLMediaElement, 'src'); // 修复 audio/video src 相对路径
}

/**
 * 初始化base标签
 */
export function initBase(iframeWindow: Window, url: string): void {
  const iframeDocument = iframeWindow.document; // 获取 iframe document
  const baseElement = iframeDocument.createElement('base'); // 创建 base 元素
  const iframeUrlElement = anchorElementGenerator(iframeWindow.location.href); // 解析 iframe 当前 URL
  const appUrlElement = anchorElementGenerator(url); // 解析子应用 URL
  baseElement.setAttribute(
    'href',
    appUrlElement.protocol +
      '//' +
      appUrlElement.host +
      iframeUrlElement.pathname
  ); // 设置 base href
  iframeDocument.head.appendChild(baseElement); // 插入 head
}

/**
 * 初始化iframe的dom结构
 * @param iframeWindow
 * @param wujie
 * @param mainHostPath
 * @param appHostPath
 */
function initIframeDom(
  iframeWindow: Window,
  wujie: WuJie,
  mainHostPath: string,
  appHostPath: string
): void {
  const iframeDocument = iframeWindow.document; // 获取 iframe document
  const newDoc = window.document.implementation.createHTMLDocument(''); // 创建新的 HTMLDocument
  const newDocumentElement = iframeDocument.importNode(
    newDoc.documentElement,
    true
  ); // 导入 documentElement
  iframeDocument.documentElement
    ? iframeDocument.replaceChild(
        newDocumentElement,
        iframeDocument.documentElement
      ) // 替换原 documentElement
    : iframeDocument.appendChild(newDocumentElement); // 或者直接 append
  iframeWindow.__WUJIE_RAW_DOCUMENT_HEAD__ = iframeDocument.head; // 保存原始 head
  iframeWindow.__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__ =
    iframeWindow.Document.prototype.querySelector; // 保存原始 querySelector
  iframeWindow.__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR_ALL__ =
    iframeWindow.Document.prototype.querySelectorAll; // 保存原始 querySelectorAll
  iframeWindow.__WUJIE_RAW_DOCUMENT_CREATE_ELEMENT__ =
    iframeWindow.Document.prototype.createElement; // 保存原始 createElement
  iframeWindow.__WUJIE_RAW_DOCUMENT_CREATE_TEXT_NODE__ =
    iframeWindow.Document.prototype.createTextNode; // 保存原始 createTextNode
  initBase(iframeWindow, wujie.url); // 初始化 base 标签
  patchIframeHistory(iframeWindow, appHostPath, mainHostPath); // 劫持 iframe history
  patchIframeEvents(iframeWindow); // 劫持 iframe 事件
  if (wujie.degrade) recordEventListeners(iframeWindow); // 降级模式记录事件监听
  syncIframeUrlToWindow(iframeWindow); // 同步 iframe URL 到 window

  patchWindowEffect(iframeWindow); // 劫持 window 对象
  patchDocumentEffect(iframeWindow); // 劫持 document
  patchNodeEffect(iframeWindow); // 劫持 Node 操作
  patchRelativeUrlEffect(iframeWindow); // 修复资源相对路径
}

/**
 * 防止运行主应用的js代码，给子应用带来很多副作用
 */
// TODO 更加准确抓取停止时机
function stopIframeLoading(
  iframe: HTMLIFrameElement,
  useObjectURL: { mainHostPath: string } | false
) {
  // 防止iframe执行主应用JS
  const iframeWindow = iframe.contentWindow; // 获取iframe window
  const oldDoc = iframeWindow.document; // 保存初始document
  const loopDeadline = Date.now() + 5e3; // 循环截止时间 5s
  return new Promise<void>((resolve) => {
    // 返回promise等待iframe就绪
    function loop() {
      // 循环检测document是否就绪
      setTimeout(() => {
        // 延迟执行
        let newDoc: Document; // 新的document
        try {
          newDoc = iframeWindow.document; // 尝试获取iframe document
        } catch (err) {
          newDoc = null; // 获取失败设为null
        }
        // wait for document ready
        if ((!newDoc || newDoc == oldDoc) && Date.now() < loopDeadline) {
          // document未就绪且未超时
          loop(); // 继续轮询
          return;
        }

        // document ready, if is using ObjectURL, remove its "blob:" prefix
        if (useObjectURL) {
          // 使用ObjectURL加载
          const href = iframeWindow.location.href; // 保存当前URL
          newDoc.open(); // 打开document
          newDoc.close(); // 关闭document

          const deadline = Date.now() + 1e3; // 设置1s检测deadline
          const loop2 = function () {
            // 二次循环检查URL变化
            if (Date.now() > deadline) {
              // 超时
              // 一秒后 URL 没有变化
              // 可能浏览器已经不支持使用这种奇技淫巧了，标记不再支持，并且回退到旧的方式加载
              disableSandboxEmptyPageURL(); // 禁用ObjectURL方案
              iframe.src = useObjectURL.mainHostPath; // 回退src
              stopIframeLoading(iframe, false).then(resolve); // 递归处理
              return;
            }

            if (iframeWindow.location.href === href)
              setTimeout(loop2, 1); // URL未变化继续检查
            else resolve(); // URL变化表示加载完成
          };
          loop2(); // 执行loop2
          return;
        }

        // document ready
        iframeWindow.stop ? iframeWindow.stop() : newDoc.execCommand('Stop'); // 停止iframe加载
        resolve(); // 解析promise
      }, 1); // 延迟1ms
    }
    loop(); // 启动循环
  });
}

export function patchElementEffect(
  element: (HTMLElement | Node | ShadowRoot) & { _hasPatch?: boolean }, // 需要patch的元素
  iframeWindow: Window // iframe window
): void {
  const proxyLocation = iframeWindow.__WUJIE.proxyLocation as Location; // 获取代理location
  if (element._hasPatch) return; // 已patch直接返回
  try {
    Object.defineProperties(element, {
      // 定义属性
      baseURI: {
        // baseURI属性
        configurable: true, // 可配置
        get: () =>
          proxyLocation.protocol +
          '//' +
          proxyLocation.host +
          proxyLocation.pathname, // 返回代理路径
        set: undefined // 不可设置
      },
      ownerDocument: {
        // ownerDocument属性
        configurable: true, // 可配置
        get: () => iframeWindow.document // 返回iframe document
      },
      _hasPatch: { get: () => true } // 打标记表示已patch
    });
  } catch (error) {
    console.warn(error); // 捕获异常
  }
  execHooks(
    iframeWindow.__WUJIE.plugins,
    'patchElementHook',
    element,
    iframeWindow
  ); // 执行插件hook
}

/**
 * 子应用前进后退，同步路由到主应用
 * @param iframeWindow
 */
export function syncIframeUrlToWindow(iframeWindow: Window): void {
  iframeWindow.addEventListener('hashchange', () =>
    syncUrlToWindow(iframeWindow)
  ); // hashchange事件同步url
  iframeWindow.addEventListener('popstate', () => {
    // popstate事件同步url
    syncUrlToWindow(iframeWindow); // 调用同步函数
  });
}

/**
 * iframe插入脚本
 * @param scriptResult script请求结果
 * @param iframeWindow
 * @param rawElement 原始的脚本
 */
export function insertScriptToIframe(
  scriptResult: ScriptObject | ScriptObjectLoader, // script对象
  iframeWindow: Window, // iframe window
  rawElement?: HTMLScriptElement // 原始script元素
) {
  const {
    src,
    module,
    content,
    crossorigin,
    crossoriginType,
    async,
    attrs,
    callback,
    onload
  } = scriptResult as ScriptObjectLoader; // 解构script信息
  const scriptElement = iframeWindow.document.createElement('script'); // 创建script
  const nextScriptElement = iframeWindow.document.createElement('script'); // 创建下一个script元素
  const { replace, plugins, proxyLocation } = iframeWindow.__WUJIE; // 获取sandbox信息
  const jsLoader = getJsLoader({ plugins, replace }); // 获取js loader
  let code = jsLoader(content, src, getCurUrl(proxyLocation)); // 处理代码
  // 添加属性
  attrs &&
    Object.keys(attrs)
      .filter((key) => !Object.keys(scriptResult).includes(key)) // 过滤原有属性
      .forEach((key) => scriptElement.setAttribute(key, String(attrs[key]))); // 设置script属性

  // 内联脚本
  if (content) {
    // 有内联脚本
    // patch location
    if (
      !iframeWindow.__WUJIE.degrade &&
      !module &&
      attrs?.type !== 'importmap'
    ) {
      // 非degrade模式且非module
      code = `(function(window, self, global, location) {
      ${code}
}).bind(window.__WUJIE.proxy)(
  window.__WUJIE.proxy,
  window.__WUJIE.proxy,
  window.__WUJIE.proxy,
  window.__WUJIE.proxyLocation,
);`; // 包装代码到sandbox proxy
    }
    const descriptor = Object.getOwnPropertyDescriptor(scriptElement, 'src'); // 获取src描述符
    // 部分浏览器 src 不可配置 取不到descriptor表示无该属性，可写
    if (descriptor?.configurable || !descriptor) {
      // 可配置或不存在
      // 解决 webpack publicPath 为 auto 无法加载资源的问题
      try {
        Object.defineProperty(scriptElement, 'src', { get: () => src || '' }); // 定义getter
      } catch (error) {
        console.warn(error); // 捕获异常
      }
    }
  } else {
    src && scriptElement.setAttribute('src', src); // 外联脚本设置src
    crossorigin && scriptElement.setAttribute('crossorigin', crossoriginType); // 设置crossorigin
  }
  module && scriptElement.setAttribute('type', 'module'); // module类型
  scriptElement.textContent = code || ''; // 设置script内容
  nextScriptElement.textContent =
    'if(window.__WUJIE.execQueue && window.__WUJIE.execQueue.length){ window.__WUJIE.execQueue.shift()()}'; // 设置下一个脚本队列执行

  const container = rawDocumentQuerySelector.call(
    iframeWindow.document,
    'head'
  ); // 获取head
  const execNextScript = () =>
    !async && container.appendChild(nextScriptElement); // 执行下一个脚本
  const afterExecScript = () => {
    // 执行后处理
    onload?.(); // 调用onload
    execNextScript(); // 执行下一个script
  };

  // 错误情况处理
  if (/^<!DOCTYPE html/i.test(code)) {
    // script内容是html
    error(WUJIE_TIPS_SCRIPT_ERROR_REQUESTED, scriptResult); // 报错
    return execNextScript(); // 执行下一个script
  }

  // 打标记
  if (rawElement) {
    // 有原始script
    setTagToScript(scriptElement, getTagFromScript(rawElement)); // 打标记
  }
  // 外联脚本执行后的处理
  const isOutlineScript = !content && src; // 是否外联脚本
  if (isOutlineScript) {
    // 外联脚本
    scriptElement.onload = afterExecScript; // 设置onload
    scriptElement.onerror = afterExecScript; // 设置onerror
  }
  container.appendChild(scriptElement); // 插入head

  // 调用回调
  callback?.(iframeWindow); // 调用callback
  // 执行 hooks
  execHooks(
    plugins,
    'appendOrInsertElementHook',
    scriptElement,
    iframeWindow,
    rawElement
  ); // 插件hook
  // 内联脚本执行后的处理
  !isOutlineScript && afterExecScript(); // 内联脚本直接处理
}

/**
 * 加载iframe替换子应用
 * @param src 地址
 * @param element
 * @param degradeAttrs
 */
export function renderIframeReplaceApp(
  src: string, // iframe src
  element: HTMLElement, // 父容器
  degradeAttrs: { [key: string]: any } = {} // 属性扩展
): void {
  const iframe = window.document.createElement('iframe'); // 创建iframe
  const defaultStyle = 'height:100%;width:100%'; // 默认样式
  setAttrsToElement(iframe, {
    ...degradeAttrs,
    src,
    style: [defaultStyle, degradeAttrs.style].join(';')
  }); // 设置属性
  renderElementToContainer(iframe, element); // 渲染到容器
}

const [getSandboxEmptyPageURL, disableSandboxEmptyPageURL] = (() => {
  // 获取sandbox空页面URL
  const disabledMarkKey = 'wujie:disableSandboxEmptyPageURL'; // localStorage key
  let disabled = false; // 是否禁用
  try {
    disabled = localStorage.getItem(disabledMarkKey) === 'true'; // 读取状态
  } catch (e) {
    // pass
  }

  if (
    disabled ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  )
    // 不支持ObjectURL
    return [() => '', () => void 0] as const; // 返回空方法

  let prevURL = ''; // 缓存URL
  const getSandboxEmptyPageURL = () => {
    // 获取空页面URL
    if (disabled) return ''; // 已禁用
    if (prevURL) return prevURL; // 已生成

    const blob = new Blob(
      ['<!DOCTYPE html><html><head></head><body></body></html>'],
      { type: 'text/html' }
    ); // 创建空html
    prevURL = URL.createObjectURL(blob); // 创建objectURL
    return prevURL; // 返回
  };

  const disableSandboxEmptyPageURL = () => {
    // 禁用ObjectURL
    disabled = true; // 设置禁用
    try {
      // TODO: 看能不能做上报，收集一下浏览器版本的情况
      localStorage.setItem(disabledMarkKey, 'true'); // 保存状态
    } catch (e) {}
  };

  return [getSandboxEmptyPageURL, disableSandboxEmptyPageURL]; // 返回方法
})();

/**
 * js沙箱
 * 创建和主应用同源的iframe，路径携带了子路由的路由信息
 * iframe必须禁止加载html，防止进入主应用的路由逻辑
 */
export function iframeGenerator(
  sandbox: WuJie, // 子应用sandbox实例
  attrs: { [key: string]: any }, // iframe属性
  mainHostPath: string, // 主应用路径
  appHostPath: string, // 子应用路径
  appRoutePath: string // 子应用路由路径
): HTMLIFrameElement {
  let src = attrs && attrs.src; // iframe src
  let useObjectURL = false; // 是否使用ObjectURL
  if (!src) {
    // 未指定src
    src = getSandboxEmptyPageURL(); // 获取sandbox空页面
    useObjectURL = !!src; // 是否使用ObjectURL
    if (!src) src = mainHostPath; // fallback to mainHostPath
  }

  const iframe = window.document.createElement('iframe'); // 创建iframe
  const attrsMerge = {
    // 合并属性
    style: 'display: none', // 默认隐藏
    ...attrs, // 用户自定义
    src, // src
    name: sandbox.id, // iframe name
    [WUJIE_DATA_FLAG]: '' // 自定义标记
  };
  setAttrsToElement(iframe, attrsMerge); // 设置属性
  window.document.body.appendChild(iframe); // 插入body

  const iframeWindow = iframe.contentWindow; // 获取iframe window
  // 变量需要提前注入，在入口函数通过变量防止死循环
  patchIframeVariable(iframeWindow, sandbox, appHostPath); // 注入变量
  sandbox.iframeReady = stopIframeLoading(
    iframe,
    useObjectURL && { mainHostPath }
  ).then(() => {
    // 停止加载后处理
    if (!iframeWindow.__WUJIE) {
      // 再次注入变量
      patchIframeVariable(iframeWindow, sandbox, appHostPath); // 注入变量
    }
    initIframeDom(iframeWindow, sandbox, mainHostPath, appHostPath); // 初始化iframe DOM
    /**
     * 如果有同步优先同步，非同步从url读取
     */
    if (!isMatchSyncQueryById(iframeWindow.__WUJIE.id)) {
      // 非同步匹配
      iframeWindow.history.replaceState(null, '', mainHostPath + appRoutePath); // 替换URL
    }
  });
  return iframe; // 返回iframe
}
