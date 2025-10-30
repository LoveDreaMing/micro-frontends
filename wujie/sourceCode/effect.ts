import { getExternalStyleSheets, getExternalScripts } from './entry'; // 从entry模块导入获取外部样式和脚本的函数
import {
  // 从common模块导入原始DOM操作和Wujie实例获取函数
  getWujieById, // 根据wujieId获取对应沙箱实例
  rawAppendChild, // 原生appendChild方法
  rawElementContains, // 原生contains方法
  rawElementRemoveChild, // 原生removeChild方法
  rawHeadInsertBefore, // 原生head.insertBefore方法
  rawBodyInsertBefore, // 原生body.insertBefore方法
  rawInsertAdjacentElement, // 原生insertAdjacentElement方法
  rawDocumentQuerySelector, // 原生document.querySelector方法
  rawAddEventListener, // 原生addEventListener方法
  rawRemoveEventListener // 原生removeEventListener方法
} from './common';
import {
  // 从utils模块导入工具函数
  isFunction, // 判断是否为函数
  isHijackingTag, // 判断标签是否需要劫持处理
  warn, // 打印警告
  nextTick, // nextTick异步调度
  getCurUrl, // 获取当前子应用URL
  execHooks, // 执行插件hook
  isScriptElement, // 判断是否为script元素
  setTagToScript, // 给script元素打tag
  getTagFromScript, // 从script元素获取tag
  setAttrsToElement // 批量设置元素属性
} from './utils';
import { insertScriptToIframe, patchElementEffect } from './iframe'; // 导入iframe相关操作
import Wujie from './sandbox'; // 导入Wujie沙箱类
import { getPatchStyleElements } from './shadow'; // 导入shadow模块的样式补丁处理
import { getCssLoader, getEffectLoaders, isMatchUrl } from './plugin'; // 导入插件相关函数
import {
  WUJIE_SCRIPT_ID,
  WUJIE_DATA_FLAG,
  WUJIE_TIPS_REPEAT_RENDER,
  WUJIE_TIPS_NO_SCRIPT
} from './constant'; // 导入常量
import { ScriptObject, parseTagAttributes } from './template'; // 导入模板相关类型和函数

function patchCustomEvent( // 对CustomEvent对象进行patch，修复srcElement和target指向
  e: CustomEvent, // 自定义事件对象
  elementGetter: () => HTMLScriptElement | HTMLLinkElement | null // 获取元素的回调
): CustomEvent {
  Object.defineProperties(e, {
    // 重定义srcElement和target属性
    srcElement: { get: elementGetter }, // 重写srcElement指向
    target: { get: elementGetter } // 重写target指向
  });

  return e; // 返回patch后的事件对象
}

function manualInvokeElementEvent(
  element: HTMLLinkElement | HTMLScriptElement,
  event: string
): void {
  // 手动触发元素事件
  const customEvent = new CustomEvent(event); // 创建自定义事件
  const patchedEvent = patchCustomEvent(customEvent, () => element); // patch事件
  if (isFunction(element[`on${event}`])) {
    // 如果元素上有对应事件处理函数
    element[`on${event}`](patchedEvent); // 调用事件处理函数
  } else {
    element.dispatchEvent(patchedEvent); // 否则派发事件
  }
}

function handleStylesheetElementPatch(
  stylesheetElement: HTMLStyleElement & { _patcher?: any },
  sandbox: Wujie
) {
  // 样式元素css变量处理，每个元素单独节流
  if (!stylesheetElement.innerHTML || sandbox.degrade) return; // 内容为空或降级模式直接返回
  const patcher = () => {
    // patch逻辑
    const [hostStyleSheetElement, fontStyleSheetElement] =
      getPatchStyleElements([stylesheetElement.sheet]); // 获取host和字体样式元素
    if (hostStyleSheetElement) {
      sandbox.shadowRoot.head.appendChild(hostStyleSheetElement);
    } // 插入host样式
    if (fontStyleSheetElement) {
      sandbox.shadowRoot.host.appendChild(fontStyleSheetElement);
    } // 插入字体样式
    stylesheetElement._patcher = undefined; // 清空_patcher
  };
  if (stylesheetElement._patcher) {
    clearTimeout(stylesheetElement._patcher);
  } // 清理之前的定时器
  stylesheetElement._patcher = setTimeout(patcher, 50); // 50ms节流处理
}

function patchStylesheetElement( // 劫持样式元素属性
  stylesheetElement: HTMLStyleElement & { _hasPatchStyle?: boolean }, // 样式元素
  cssLoader: (code: string, url: string, base: string) => string, // css处理函数
  sandbox: Wujie, // 沙箱实例
  curUrl: string // 当前URL
) {
  if (stylesheetElement._hasPatchStyle) return; // 已经patch过直接返回
  const innerHTMLDesc = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'innerHTML'
  ); // 获取原生innerHTML描述符
  const innerTextDesc = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'innerText'
  ); // 获取innerText描述符
  const textContentDesc = Object.getOwnPropertyDescriptor(
    Node.prototype,
    'textContent'
  ); // 获取textContent描述符
  const RawInsertRule = stylesheetElement.sheet?.insertRule; // 原生insertRule方法

  function patchSheetInsertRule() {
    // 重写insertRule方法，同时同步到innerHTML
    if (!RawInsertRule) return;
    stylesheetElement.sheet.insertRule = (
      rule: string,
      index?: number
    ): number => {
      innerHTMLDesc
        ? (stylesheetElement.innerHTML += rule)
        : (stylesheetElement.innerText += rule); // 同步到innerHTML或innerText
      return RawInsertRule.call(stylesheetElement.sheet, rule, index); // 调用原生insertRule
    };
  }
  patchSheetInsertRule(); // 执行patch

  if (innerHTMLDesc) {
    // patch innerHTML setter
    Object.defineProperties(stylesheetElement, {
      innerHTML: {
        get: function () {
          return innerHTMLDesc.get.call(stylesheetElement);
        }, // 保留原生getter
        set: function (code: string) {
          innerHTMLDesc.set.call(
            stylesheetElement,
            cssLoader(code, '', curUrl)
          ); // 设置时通过cssLoader处理
          nextTick(() => handleStylesheetElementPatch(this, sandbox)); // 异步处理补丁
        }
      }
    });
  }

  Object.defineProperties(stylesheetElement, {
    // patch innerText、textContent、appendChild、insertAdjacentElement
    innerText: {
      get: function () {
        return innerTextDesc.get.call(stylesheetElement);
      },
      set: function (code: string) {
        innerTextDesc.set.call(stylesheetElement, cssLoader(code, '', curUrl));
        nextTick(() => handleStylesheetElementPatch(this, sandbox));
      }
    },
    textContent: {
      get: function () {
        return textContentDesc.get.call(stylesheetElement);
      },
      set: function (code: string) {
        textContentDesc.set.call(
          stylesheetElement,
          cssLoader(code, '', curUrl)
        );
        nextTick(() => handleStylesheetElementPatch(this, sandbox));
      }
    },
    appendChild: {
      value: function (node: Node): Node {
        nextTick(() => handleStylesheetElementPatch(this, sandbox));
        if (node.nodeType === Node.TEXT_NODE) {
          const res = rawAppendChild.call(
            stylesheetElement,
            stylesheetElement.ownerDocument.createTextNode(
              cssLoader(node.textContent, '', curUrl)
            ) // textNode通过cssLoader处理
          );
          patchSheetInsertRule(); // append后重新patch
          return res;
        } else return rawAppendChild(node); // 非文本节点直接调用原生
      }
    },
    insertAdjacentElement: {
      value: function (
        this: HTMLStyleElement,
        position: InsertPosition,
        element: Element
      ) {
        if (element.nodeName === 'STYLE') {
          nextTick(() =>
            handleStylesheetElementPatch(element as HTMLStyleElement, sandbox)
          ); // 异步处理style补丁
          const res = rawInsertAdjacentElement.call(this, position, element);
          sandbox.styleSheetElements.push(element as HTMLStyleElement); // 保存到沙箱记录
          return res;
        } else return rawInsertAdjacentElement.call(this, position, element); // 其他元素调用原生
      }
    },
    _hasPatchStyle: { get: () => true } // 标记已经patch
  });
}

let dynamicScriptExecStack = Promise.resolve(); // 异步脚本执行队列
function rewriteAppendOrInsertChild(opts: {
  // 重写appendChild或insertBefore逻辑
  rawDOMAppendOrInsertBefore: <T extends Node>(
    newChild: T,
    refChild?: Node | null
  ) => T; // 原生方法
  wujieId: string; // 沙箱id
}) {
  return function appendChildOrInsertBefore<T extends Node>(
    this: HTMLHeadElement | HTMLBodyElement,
    newChild: T,
    refChild?: Node | null
  ) {
    let element = newChild as any; // 新增元素
    const { rawDOMAppendOrInsertBefore, wujieId } = opts;
    const sandbox = getWujieById(wujieId); // 获取沙箱实例

    const {
      styleSheetElements,
      replace,
      fetch,
      plugins,
      iframe,
      lifecycles,
      proxyLocation,
      fiber
    } = sandbox; // 沙箱属性解构

    if (!isHijackingTag(element.tagName) || !wujieId) {
      // 非劫持标签直接调用原生
      const res = rawDOMAppendOrInsertBefore.call(this, element, refChild) as T;
      patchElementEffect(element, iframe.contentWindow); // patch副作用
      execHooks(
        plugins,
        'appendOrInsertElementHook',
        element,
        iframe.contentWindow
      ); // 执行插件hook
      return res;
    }

    const iframeDocument = iframe.contentDocument; // iframe文档
    const curUrl = getCurUrl(proxyLocation); // 当前URL

    if (element.tagName) {
      switch (element.tagName?.toUpperCase()) {
        case 'LINK': {
          // 处理link标签
          const { href, rel, type } = element as HTMLLinkElement;
          const styleFlag =
            rel === 'stylesheet' ||
            type === 'text/css' ||
            href.endsWith('.css'); // 判断是否为样式
          if (!styleFlag) {
            // 非样式直接原生插入
            const res = rawDOMAppendOrInsertBefore.call(
              this,
              element,
              refChild
            );
            execHooks(
              plugins,
              'appendOrInsertElementHook',
              element,
              iframe.contentWindow
            );
            return res;
          }
          if (
            href &&
            !isMatchUrl(href, getEffectLoaders('cssExcludes', plugins))
          ) {
            // 外部样式处理
            getExternalStyleSheets(
              [
                {
                  src: href,
                  ignore: isMatchUrl(
                    href,
                    getEffectLoaders('cssIgnores', plugins)
                  )
                }
              ],
              fetch,
              lifecycles.loadError
            ).forEach(({ src, ignore, contentPromise }) =>
              contentPromise.then(
                (content) => {
                  const rawAttrs = parseTagAttributes(element.outerHTML); // 原始属性
                  if (ignore && src) {
                    // 忽略样式直接插入原元素
                    rawDOMAppendOrInsertBefore.call(this, element, refChild);
                  } else {
                    // 正常处理样式
                    const stylesheetElement =
                      iframeDocument.createElement('style');
                    const cssLoader = getCssLoader({ plugins, replace }); // cssLoader
                    stylesheetElement.innerHTML = cssLoader(
                      content,
                      src,
                      curUrl
                    ); // 处理内容
                    styleSheetElements.push(stylesheetElement); // 保存到沙箱
                    setAttrsToElement(stylesheetElement, rawAttrs); // 设置属性
                    rawDOMAppendOrInsertBefore.call(
                      this,
                      stylesheetElement,
                      refChild
                    ); // 插入iframe
                    handleStylesheetElementPatch(stylesheetElement, sandbox); // 补丁处理
                    manualInvokeElementEvent(element, 'load'); // 手动触发load事件
                  }
                  element = null;
                },
                () => {
                  manualInvokeElementEvent(element, 'error');
                  element = null;
                } // 失败触发error
              )
            );
          }

          const comment = iframeDocument.createComment(
            `dynamic link ${href} replaced by wujie`
          ); // 注释替代
          return rawDOMAppendOrInsertBefore.call(this, comment, refChild);
        }
        case 'STYLE': {
          // style标签处理
          const stylesheetElement: HTMLStyleElement = newChild as any;
          styleSheetElements.push(stylesheetElement); // 保存到沙箱
          const content = stylesheetElement.innerHTML;
          const cssLoader = getCssLoader({ plugins, replace });
          content &&
            (stylesheetElement.innerHTML = cssLoader(content, '', curUrl)); // loader处理
          const res = rawDOMAppendOrInsertBefore.call(this, element, refChild);
          patchStylesheetElement(stylesheetElement, cssLoader, sandbox, curUrl); // 补丁
          handleStylesheetElementPatch(stylesheetElement, sandbox); // 节流处理
          execHooks(
            plugins,
            'appendOrInsertElementHook',
            element,
            iframe.contentWindow
          );
          return res;
        }
        case 'SCRIPT': {
          // script标签处理
          setTagToScript(element); // 打tag
          const { src, text, type, crossOrigin } = element as HTMLScriptElement;
          if (
            src &&
            !isMatchUrl(src, getEffectLoaders('jsExcludes', plugins))
          ) {
            // 外部脚本处理
            const execScript = (scriptResult: ScriptObject) => {
              if (sandbox.iframe === null)
                return warn(WUJIE_TIPS_REPEAT_RENDER); // 防止重复渲染污染
              const onload = () => {
                manualInvokeElementEvent(element, 'load');
                element = null;
              };
              insertScriptToIframe(
                { ...scriptResult, onload },
                sandbox.iframe.contentWindow,
                element
              ); // 插入iframe执行
            };
            const scriptOptions = {
              // 脚本配置
              src,
              module: type === 'module',
              crossorigin: crossOrigin !== null,
              crossoriginType: crossOrigin || '',
              ignore: isMatchUrl(src, getEffectLoaders('jsIgnores', plugins)),
              attrs: parseTagAttributes(element.outerHTML)
            } as ScriptObject;
            getExternalScripts(
              [scriptOptions],
              fetch,
              lifecycles.loadError,
              fiber
            ).forEach((scriptResult) => {
              dynamicScriptExecStack = dynamicScriptExecStack.then(() =>
                scriptResult.contentPromise.then(
                  (content) => {
                    if (sandbox.execQueue === null)
                      return warn(WUJIE_TIPS_REPEAT_RENDER);
                    const execQueueLength = sandbox.execQueue?.length;
                    sandbox.execQueue.push(() =>
                      fiber
                        ? sandbox.requestIdleCallback(() => {
                            execScript({ ...scriptResult, content });
                          })
                        : execScript({ ...scriptResult, content })
                    );
                    if (!execQueueLength) sandbox.execQueue.shift()(); // 同步执行
                  },
                  () => {
                    manualInvokeElementEvent(element, 'error');
                    element = null;
                  } // 失败触发error
                )
              );
            });
          } else {
            // inline script
            const execQueueLength = sandbox.execQueue?.length;
            sandbox.execQueue.push(() =>
              fiber
                ? sandbox.requestIdleCallback(() => {
                    insertScriptToIframe(
                      {
                        src: null,
                        content: text,
                        attrs: parseTagAttributes(element.outerHTML)
                      },
                      sandbox.iframe.contentWindow,
                      element
                    );
                  })
                : insertScriptToIframe(
                    {
                      src: null,
                      content: text,
                      attrs: parseTagAttributes(element.outerHTML)
                    },
                    sandbox.iframe.contentWindow,
                    element
                  )
            );
            if (!execQueueLength) sandbox.execQueue.shift()(); // 同步执行
          }
          const comment = iframeDocument.createComment(
            `dynamic script ${src} replaced by wujie`
          ); // 注释替代
          return rawDOMAppendOrInsertBefore.call(this, comment, refChild);
        }
        case 'IFRAME': {
          // iframe处理
          if (element.getAttribute(WUJIE_DATA_FLAG) === '') {
            // 嵌套子应用iframe处理
            return rawAppendChild.call(
              rawDocumentQuerySelector.call(this.ownerDocument, 'html'),
              element
            );
          }
          const res = rawDOMAppendOrInsertBefore.call(this, element, refChild);
          execHooks(
            plugins,
            'appendOrInsertElementHook',
            element,
            iframe.contentWindow
          );
          return res;
        }
        default: // 其他标签不处理
      }
    }
  };
}

function findScriptElementFromIframe(
  rawElement: HTMLScriptElement,
  wujieId: string
) {
  // 从iframe查找对应script
  const wujieTag = getTagFromScript(rawElement); // 获取tag
  const sandbox = getWujieById(wujieId);
  const { iframe } = sandbox;
  const targetScript =
    iframe.contentWindow.__WUJIE_RAW_DOCUMENT_HEAD__.querySelector(
      `script[${WUJIE_SCRIPT_ID}='${wujieTag}']` // 查找对应script
    );
  if (targetScript === null) {
    warn(WUJIE_TIPS_NO_SCRIPT, `<script ${WUJIE_SCRIPT_ID}='${wujieTag}'/>`);
  } // 没找到警告
  return { targetScript, iframe }; // 返回script和iframe
}

function rewriteContains(opts: {
  rawElementContains: (other: Node | null) => boolean;
  wujieId: string;
}) {
  // 重写contains
  return function contains(other: Node | null) {
    const element = other as HTMLElement;
    const { rawElementContains, wujieId } = opts;
    if (element && isScriptElement(element)) {
      // 如果是script
      const { targetScript } = findScriptElementFromIframe(
        element as HTMLScriptElement,
        wujieId
      );
      return targetScript !== null; // 判断iframe中是否存在
    }
    return rawElementContains(element); // 否则调用原生
  };
}

function rewriteRemoveChild(opts: {
  rawElementRemoveChild: <T extends Node>(child: T) => T;
  wujieId: string;
}) {
  // 重写removeChild
  return function removeChild(child: Node) {
    const element = child as HTMLElement;
    const { rawElementRemoveChild, wujieId } = opts;
    if (element && isScriptElement(element)) {
      const { targetScript, iframe } = findScriptElementFromIframe(
        element as HTMLScriptElement,
        wujieId
      );
      if (targetScript !== null) {
        return iframe.contentWindow.__WUJIE_RAW_DOCUMENT_HEAD__.removeChild(
          targetScript
        ); // 删除iframe中的script
      }
      return null;
    }
    return rawElementRemoveChild(element); // 否则调用原生
  };
}

function patchEventListener(element: HTMLHeadElement | HTMLBodyElement) {
  // patch head/body事件监听
  const listenerMap = new Map<string, EventListenerOrEventListenerObject[]>(); // 缓存事件map
  element._cacheListeners = listenerMap; // 挂载到元素上

  element.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    const listeners = listenerMap.get(type) || [];
    listenerMap.set(type, [...listeners, listener]); // 记录事件
    return rawAddEventListener.call(element, type, listener, options); // 调用原生
  };

  element.removeEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    const typeListeners = listenerMap.get(type);
    const index = typeListeners?.indexOf(listener);
    if (typeListeners?.length && index !== -1) {
      typeListeners.splice(index, 1);
    } // 移除记录
    return rawRemoveEventListener.call(element, type, listener, options); // 调用原生
  };
}

export function removeEventListener(
  element: HTMLHeadElement | HTMLBodyElement
) {
  // 清空head/body事件
  const listenerMap = element._cacheListeners;
  [...listenerMap.entries()].forEach(([type, listeners]) => {
    listeners.forEach((listener) =>
      rawRemoveEventListener.call(element, type, listener)
    ); // 移除所有事件
  });
}

export function patchRenderEffect(
  render: ShadowRoot | Document,
  id: string,
  degrade: boolean
): void {
  // patch渲染
  if (!degrade) {
    // 非降级模式才记录事件
    patchEventListener(render.head); // patch head
    patchEventListener(render.body as HTMLBodyElement); // patch body
  }

  render.head.appendChild = rewriteAppendOrInsertChild({
    rawDOMAppendOrInsertBefore: rawAppendChild,
    wujieId: id
  }) as typeof rawAppendChild; // 重写appendChild
  render.head.insertBefore = rewriteAppendOrInsertChild({
    rawDOMAppendOrInsertBefore: rawHeadInsertBefore as any,
    wujieId: id
  }) as typeof rawHeadInsertBefore; // 重写insertBefore
  render.head.removeChild = rewriteRemoveChild({
    rawElementRemoveChild: rawElementRemoveChild.bind(render.head),
    wujieId: id
  }) as typeof rawElementRemoveChild; // 重写removeChild
  render.head.contains = rewriteContains({
    rawElementContains: rawElementContains.bind(render.head),
    wujieId: id
  }) as typeof rawElementContains; // 重写contains
  render.contains = rewriteContains({
    rawElementContains: rawElementContains.bind(render),
    wujieId: id
  }) as typeof rawElementContains; // document.contains
  render.body.appendChild = rewriteAppendOrInsertChild({
    rawDOMAppendOrInsertBefore: rawAppendChild,
    wujieId: id
  }) as typeof rawAppendChild; // body.appendChild
  render.body.insertBefore = rewriteAppendOrInsertChild({
    rawDOMAppendOrInsertBefore: rawBodyInsertBefore as any,
    wujieId: id
  }) as typeof rawBodyInsertBefore; // body.insertBefore
}
