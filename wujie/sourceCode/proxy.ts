import {
  patchElementEffect, // 用于修补 iframe 内元素效果
  renderIframeReplaceApp // 用于渲染 iframe 应用
} from './iframe'; // 从 iframe 模块导入方法
import { renderElementToContainer } from './shadow'; // 从 shadow 模块导入方法 renderElementToContainer，用于将 DOM 元素渲染到 shadow DOM 或 iframe 容器中
import { pushUrlToWindow } from './sync'; // 从 sync 模块导入 pushUrlToWindow 方法，用于同步子应用 URL 到主应用 window 对象
import {
  documentProxyProperties, // 保存 document 代理属性列表
  rawDocumentQuerySelector // 提供原生 querySelector 方法
} from './common'; // 从 common 模块导入
import {
  // 从 constant 模块导入常量提示信息
  WUJIE_TIPS_RELOAD_DISABLED, // 当子应用调用 location.reload 被禁用时的提示信息
  WUJIE_TIPS_GET_ELEMENT_BY_ID // 当 getElementById 查询失败时的提示信息
} from './constant'; // constant 模块路径
import {
  // 从 utils 模块导入工具函数
  getTargetValue, // 获取目标对象属性值并修正 this 指向
  anchorElementGenerator, // 创建临时 a 标签解析 URL
  getDegradeIframe, // 获取降级模式下的 iframe 元素
  isCallable, // 判断是否为可调用函数
  checkProxyFunction, // 检查函数类型是否合法
  warn, // 控制台警告提示
  stopMainAppRun // 停止主应用运行（用于 iframe 初始化未完成时）
} from './utils'; // utils 模块路径

/**
 * location href 的set劫持操作
 */
function locationHrefSet( // 定义 locationHrefSet 函数
  iframe: HTMLIFrameElement, // iframe 元素对象
  value: string, // 要跳转的 URL
  appHostPath: string // 子应用 host 路径
): boolean {
  // 返回布尔值表示是否处理成功
  const { shadowRoot, id, degrade, document, degradeAttrs } =
    iframe.contentWindow.__WUJIE; // 解构 iframe WUJIE 对象属性
  let url = value; // 初始化 url
  if (!/^http/.test(url)) {
    // 如果 url 不是完整 http/https 链接
    let hrefElement = anchorElementGenerator(url); // 创建临时 a 标签解析路径
    url =
      appHostPath +
      hrefElement.pathname +
      hrefElement.search +
      hrefElement.hash; // 拼接完整子应用 URL
    hrefElement = null; // 清理临时变量
  }
  iframe.contentWindow.__WUJIE.hrefFlag = true; // 标记 iframe 正在跳转
  if (degrade) {
    // 降级模式处理
    const iframeBody = rawDocumentQuerySelector.call(
      iframe.contentDocument,
      'body'
    ); // 获取 iframe body 元素
    renderElementToContainer(document.documentElement, iframeBody); // 将主文档内容渲染到 iframe body
    renderIframeReplaceApp(
      // 渲染降级 iframe 应用
      window.decodeURIComponent(url), // 解码 URL
      getDegradeIframe(id).parentElement, // 获取降级 iframe 容器父节点
      degradeAttrs // 传入降级属性
    );
  } else
    renderIframeReplaceApp(url, shadowRoot.host.parentElement, degradeAttrs); // 非降级模式渲染 iframe 应用
  pushUrlToWindow(id, url); // 同步 url 到主 window 对象
  return true; // 返回 true 表示劫持处理成功
}

/**
 * 非降级情况下 window、document、location 代理
 */
export function proxyGenerator( // 导出 proxyGenerator 函数
  iframe: HTMLIFrameElement, // iframe 元素对象
  urlElement: HTMLAnchorElement, // 子应用 URL 对应的 a 标签对象
  mainHostPath: string, // 主应用 host 路径
  appHostPath: string // 子应用 host 路径
): {
  proxyWindow: Window; // 代理 window 对象
  proxyDocument: Object; // 代理 document 对象
  proxyLocation: Object; // 代理 location 对象
} {
  const proxyWindow = new Proxy(iframe.contentWindow, {
    // 创建 window 代理
    get: (target: Window, p: PropertyKey): any => {
      // 获取属性时触发
      if (p === 'location') {
        // location 属性劫持
        return target.__WUJIE.proxyLocation; // 返回代理 location
      }
      if (
        p === 'self' ||
        (p === 'window' &&
          Object.getOwnPropertyDescriptor(window, 'window').get)
      ) {
        // self 或 window
        return target.__WUJIE.proxy; // 返回代理 window
      }
      if (
        p === '__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__' ||
        p === '__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR_ALL__'
      ) {
        // 原生 querySelector 方法
        return target[p]; // 返回原生方法
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, p); // 获取属性描述符
      if (
        descriptor?.configurable === false &&
        descriptor?.writable === false
      ) {
        // 不可配置且不可写
        return target[p]; // 返回原始值
      }
      return getTargetValue(target, p); // 修正 this 指针返回值
    },
    set: (target: Window, p: PropertyKey, value: any) => {
      // 设置属性时触发
      checkProxyFunction(target, value); // 检查函数类型
      target[p] = value; // 设置属性值
      return true; // 返回 true
    },
    has: (target: Window, p: PropertyKey) => p in target // in 操作判断
  });

  const proxyDocument = new Proxy(
    {},
    {
      // 创建 document 代理
      get: function (_fakeDocument, propKey) {
        // 获取属性时触发
        const document = window.document; // 获取主文档
        const { shadowRoot, proxyLocation } = iframe.contentWindow.__WUJIE; // 解构 WUJIE 对象
        if (!shadowRoot) stopMainAppRun(); // iframe 初始化未完成，停止主应用运行
        const rawCreateElement =
          iframe.contentWindow.__WUJIE_RAW_DOCUMENT_CREATE_ELEMENT__; // 原生 createElement 方法
        const rawCreateTextNode =
          iframe.contentWindow.__WUJIE_RAW_DOCUMENT_CREATE_TEXT_NODE__; // 原生 createTextNode 方法
        if (propKey === 'createElement' || propKey === 'createTextNode') {
          // 创建元素或文本节点
          return new Proxy(document[propKey], {
            // 代理原生方法
            apply(_createElement, _ctx, args) {
              // 调用时触发
              const rawCreateMethod =
                propKey === 'createElement'
                  ? rawCreateElement
                  : rawCreateTextNode; // 选择原生方法
              const element = rawCreateMethod.apply(
                iframe.contentDocument,
                args
              ); // 调用原生方法
              patchElementEffect(element, iframe.contentWindow); // 修补元素 effect
              return element; // 返回元素
            }
          });
        }
        if (propKey === 'documentURI' || propKey === 'URL')
          // documentURI 或 URL
          return (proxyLocation as Location).href; // 返回代理 href
        if (
          propKey === 'getElementsByTagName' ||
          propKey === 'getElementsByClassName' ||
          propKey === 'getElementsByName'
        ) {
          // 获取元素集合
          return new Proxy(shadowRoot.querySelectorAll, {
            // 代理 shadowRoot.querySelectorAll
            apply(querySelectorAll, _ctx, args) {
              // 调用时触发
              let arg = args[0]; // 参数
              if (_ctx !== iframe.contentDocument)
                return _ctx[propKey].apply(_ctx, args); // 非 iframe 文档调用原生方法
              if (propKey === 'getElementsByTagName' && arg === 'script')
                return iframe.contentDocument.scripts; // script 标签特殊处理
              if (propKey === 'getElementsByClassName') arg = '.' + arg; // 类名加 .
              if (propKey === 'getElementsByName') arg = `[name="${arg}"]`; // name 属性选择器
              let res: NodeList[] | []; // 初始化返回值
              try {
                res = querySelectorAll.call(shadowRoot, arg);
              } catch (error) {
                // 执行查询
                res = [];
              } // 出错返回空数组
              return res; // 返回结果
            }
          });
        }
        if (propKey === 'getElementById') {
          // getElementById
          return new Proxy(shadowRoot.querySelector, {
            // 代理 shadowRoot.querySelector
            apply(target, ctx, args) {
              // 调用时触发
              if (ctx !== iframe.contentDocument)
                return ctx[propKey]?.apply(ctx, args); // 非 iframe 文档调用原生
              try {
                return (
                  target.call(shadowRoot, `[id="${args[0]}"]`) || // shadowRoot 查找
                  iframe.contentWindow.__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__.call(
                    iframe.contentWindow.document,
                    `#${args[0]}`
                  )
                ); // 原生查找
              } catch (error) {
                warn(WUJIE_TIPS_GET_ELEMENT_BY_ID); // 警告
                return null; // 返回 null
              }
            }
          });
        }
        if (propKey === 'querySelector' || propKey === 'querySelectorAll') {
          // querySelector 系列
          const rawPropMap = {
            querySelector: '__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR__',
            querySelectorAll: '__WUJIE_RAW_DOCUMENT_QUERY_SELECTOR_ALL__'
          }; // 原生方法映射
          return new Proxy(shadowRoot[propKey], {
            // 代理 shadowRoot 方法
            apply(target, ctx, args) {
              // 调用时触发
              if (ctx !== iframe.contentDocument)
                return ctx[propKey]?.apply(ctx, args); // 非 iframe 文档调用原生
              return (
                target.apply(shadowRoot, args) ||
                (args[0] === 'base'
                  ? null
                  : iframe.contentWindow[rawPropMap[propKey]].call(
                      iframe.contentWindow.document,
                      args[0]
                    ))
              ); // shadowRoot 或原生查询
            }
          });
        }
        if (propKey === 'documentElement' || propKey === 'scrollingElement')
          return shadowRoot.firstElementChild; // shadowRoot 根元素
        if (propKey === 'forms') return shadowRoot.querySelectorAll('form'); // 所有 form
        if (propKey === 'images') return shadowRoot.querySelectorAll('img'); // 所有 img
        if (propKey === 'links') return shadowRoot.querySelectorAll('a'); // 所有 a
        const {
          ownerProperties,
          shadowProperties,
          shadowMethods,
          documentProperties,
          documentMethods
        } = documentProxyProperties; // 解构 document 属性方法列表
        if (
          ownerProperties.concat(shadowProperties).includes(propKey.toString())
        ) {
          // shadowRoot 或宿主属性
          if (propKey === 'activeElement' && shadowRoot.activeElement === null)
            return shadowRoot.body; // activeElement 处理
          return shadowRoot[propKey]; // 返回属性
        }
        if (shadowMethods.includes(propKey.toString()))
          return (
            getTargetValue(shadowRoot, propKey) ??
            getTargetValue(document, propKey)
          ); // shadowRoot 方法
        if (documentProperties.includes(propKey.toString()))
          return document[propKey]; // document 属性
        if (documentMethods.includes(propKey.toString()))
          return getTargetValue(document, propKey); // document 方法
      }
    }
  );

  const proxyLocation = new Proxy(
    {},
    {
      // 创建 location 代理
      get: function (_fakeLocation, propKey) {
        // 获取属性
        const location = iframe.contentWindow.location; // 原生 location
        if (
          propKey === 'host' ||
          propKey === 'hostname' ||
          propKey === 'protocol' ||
          propKey === 'port' ||
          propKey === 'origin'
        )
          return urlElement[propKey]; // 常量属性
        if (propKey === 'href')
          return location[propKey].replace(mainHostPath, appHostPath); // href 替换路径
        if (propKey === 'reload') {
          warn(WUJIE_TIPS_RELOAD_DISABLED);
          return () => null;
        } // reload 禁用
        if (propKey === 'replace')
          return new Proxy(location[propKey], {
            apply(replace, _ctx, args) {
              return replace.call(
                location,
                args[0]?.replace(appHostPath, mainHostPath)
              );
            }
          }); // replace 方法处理
        return getTargetValue(location, propKey); // 其他属性返回原始值
      },
      set: function (_fakeLocation, propKey, value) {
        // 设置属性
        if (propKey === 'href')
          return locationHrefSet(iframe, value, appHostPath); // href 劫持跳转
        iframe.contentWindow.location[propKey] = value; // 其他属性直接设置
        return true; // 返回 true
      },
      ownKeys: function () {
        // ownKeys 操作
        return Object.keys(iframe.contentWindow.location).filter(
          (key) => key !== 'reload'
        ); // 过滤 reload
      },
      getOwnPropertyDescriptor: function (_target, key) {
        // 获取属性描述符
        return { enumerable: true, configurable: true, value: this[key] }; // 返回自定义 descriptor
      }
    }
  );

  return { proxyWindow, proxyDocument, proxyLocation }; // 返回三个代理对象
}

/**
 * 降级情况下document、location代理处理
 */
export function localGenerator( // 导出 localGenerator 函数
  iframe: HTMLIFrameElement, // iframe 元素对象
  urlElement: HTMLAnchorElement, // 对应子应用 URL 的 a 标签对象
  mainHostPath: string, // 主应用 host 路径
  appHostPath: string // 子应用 host 路径
): {
  proxyDocument: Object; // 代理 document 对象
  proxyLocation: Object; // 代理 location 对象
} {
  const proxyDocument = {}; // 创建空对象作为 document 代理
  const sandbox = iframe.contentWindow.__WUJIE; // 获取 iframe 内 WUJIE 对象

  // 特殊处理
  Object.defineProperties(proxyDocument, {
    // 定义特殊 document 属性
    createElement: {
      // 拦截 createElement
      get: () => {
        // getter 拦截
        return function (...args) {
          // 参数 args 是标签名等参数
          const element =
            iframe.contentWindow.__WUJIE_RAW_DOCUMENT_CREATE_ELEMENT__.apply(
              iframe.contentDocument, // this 指向 iframe 的 document
              args // 参数传递
            ); // 调用原生 createElement
          patchElementEffect(element, iframe.contentWindow); // 修补元素 effect
          return element; // 返回创建的元素
        };
      }
    },
    createTextNode: {
      // 拦截 createTextNode
      get: () => {
        // getter 拦截
        return function (...args) {
          // 参数 args 是文本内容
          const element =
            iframe.contentWindow.__WUJIE_RAW_DOCUMENT_CREATE_TEXT_NODE__.apply(
              iframe.contentDocument, // this 指向 iframe 的 document
              args // 参数传递
            ); // 调用原生 createTextNode
          patchElementEffect(element, iframe.contentWindow); // 修补元素 effect
          return element; // 返回文本节点
        };
      }
    },
    documentURI: {
      // 拦截 documentURI
      get: () => (sandbox.proxyLocation as Location).href // 返回代理 location.href
    },
    URL: {
      // 拦截 URL
      get: () => (sandbox.proxyLocation as Location).href // 返回代理 location.href
    },
    getElementsByTagName: {
      // 拦截 getElementsByTagName
      get() {
        return function (...args) {
          // 参数 args[0] 是标签名
          const tagName = args[0]; // 获取标签名
          if (tagName === 'script') {
            return iframe.contentDocument.scripts as any; // 特殊处理 script 标签
          }
          return sandbox.document.getElementsByTagName(tagName) as any; // 返回 sandbox.document 对应标签
        };
      }
    },
    getElementById: {
      // 拦截 getElementById
      get() {
        return function (...args) {
          // 参数 args[0] 是 id
          const id = args[0]; // 获取 id
          return (
            (sandbox.document.getElementById(id) as any) || // 从 sandbox.document 查找
            iframe.contentWindow.__WUJIE_RAW_DOCUMENT_HEAD__.querySelector(
              `#${id}` // fallback 查找 head
            )
          );
        };
      }
    }
  });

  // 普通处理
  const {
    // 解构 document 代理需要的属性和方法列表
    modifyLocalProperties, // 本地已修改属性
    modifyProperties, // 需要修改的属性
    ownerProperties, // shadowRoot 所有者属性
    shadowProperties, // shadowRoot 属性
    shadowMethods, // shadowRoot 方法
    documentProperties, // document 属性
    documentMethods // document 方法
  } = documentProxyProperties; // 从 common.ts 导入

  modifyProperties
    .filter((key) => !modifyLocalProperties.includes(key)) // 过滤不在本地的属性
    .concat(
      // 合并属性列表
      ownerProperties,
      shadowProperties,
      shadowMethods,
      documentProperties,
      documentMethods
    )
    .forEach((key) => {
      // 遍历属性列表
      Object.defineProperty(proxyDocument, key, {
        // 定义代理属性
        get: () => {
          // getter
          const value = sandbox.document?.[key]; // 获取 sandbox.document 属性值
          return isCallable(value) ? value.bind(sandbox.document) : value; // 可调用绑定 document，否则直接返回
        }
      });
    });

  // 代理 location
  const proxyLocation = {}; // 创建 location 代理对象
  const location = iframe.contentWindow.location; // 原生 location 对象
  const locationKeys = Object.keys(location); // location 所有 key
  const constantKey = ['host', 'hostname', 'port', 'protocol', 'port']; // 常量属性
  constantKey.forEach((key) => {
    proxyLocation[key] = urlElement[key]; // 常量属性从 urlElement 取值
  });

  Object.defineProperties(proxyLocation, {
    // 定义 location 特殊属性
    href: {
      get: () => location.href.replace(mainHostPath, appHostPath), // get 返回替换后的 href
      set: (value) => {
        // set 拦截
        locationHrefSet(iframe, value, appHostPath); // 调用 locationHrefSet 劫持跳转
      }
    },
    reload: {
      get() {
        // reload 禁用
        warn(WUJIE_TIPS_RELOAD_DISABLED); // 提示 reload 被禁用
        return () => null; // 返回空函数
      }
    }
  });

  locationKeys
    .filter((key) => !constantKey.concat(['href', 'reload']).includes(key)) // 过滤已定义属性
    .forEach((key) => {
      // 遍历剩余 location 属性
      Object.defineProperty(proxyLocation, key, {
        // 定义 getter
        get: () =>
          isCallable(location[key])
            ? location[key].bind(location) // 可调用绑定 location
            : location[key] // 直接返回值
      });
    });

  return { proxyDocument, proxyLocation }; // 返回代理对象
}
