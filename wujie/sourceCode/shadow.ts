import {
  WUJIE_APP_ID, // 子应用 id 的属性名
  WUJIE_IFRAME_CLASS,  // 子应用 iframe 的默认 class
  WUJIE_SHADE_STYLE,  // shadow 遮罩的默认样式
  CONTAINER_POSITION_DATA_FLAG,  // 容器原始 position 样式的标记
  CONTAINER_OVERFLOW_DATA_FLAG,  // 容器原始 overflow 样式的标记
  LOADING_DATA_FLAG,  // loading 元素标记
  WUJIE_LOADING_STYLE,  // loading 容器样式
  WUJIE_LOADING_SVG,  // 默认 loading svg
} from "./constant";  // 引入常量

import {
  getWujieById,  // 根据 id 获取 sandbox 实例
  rawAppendChild,  // 原生 appendChild
  rawElementAppendChild,  // 原生元素 appendChild
  rawElementRemoveChild,  // 原生元素 removeChild
  relativeElementTagAttrMap,  // 标签对应需要修正的相对路径属性映射
} from "./common";  // 公共函数

import { getExternalStyleSheets } from "./entry";  // 获取外部样式表
import Wujie from "./sandbox";  // Sandbox 类型
import { patchElementEffect } from "./iframe";  // 元素 effect patch
import { patchRenderEffect } from "./effect";  // 渲染 effect patch
import { getCssLoader, getPresetLoaders } from "./plugin";  // css 插件 loader
import { getAbsolutePath, getContainer, getCurUrl, setAttrsToElement } from "./utils";  // 工具函数

const cssSelectorMap = { ":root": ":host" };  // root css 转换为 host

declare global {
  interface ShadowRoot {  // 扩展 ShadowRoot 类型
    head: HTMLHeadElement;  // ShadowRoot head
    body: HTMLBodyElement;  // ShadowRoot body
  }
}

/**
 * 定义 wujie webComponent，将shadow包裹并获得dom装载和卸载的生命周期
 */
export function defineWujieWebComponent() {  // 注册 wujie-app 自定义元素
  const customElements = window.customElements;  // 获取 customElements
  if (customElements && !customElements?.get("wujie-app")) {  // 未注册则定义
    class WujieApp extends HTMLElement {  // 自定义元素类
      connectedCallback(): void {  // 挂载回调
        if (this.shadowRoot) return;  // 已挂载直接返回
        const shadowRoot = this.attachShadow({ mode: "open" });  // 创建 shadowRoot
        const sandbox = getWujieById(this.getAttribute(WUJIE_APP_ID));  // 获取 sandbox
        patchElementEffect(shadowRoot, sandbox.iframe.contentWindow);  // patch 元素 effect
        sandbox.shadowRoot = shadowRoot;  // 关联 sandbox
      }

      disconnectedCallback(): void {  // 卸载回调
        const sandbox = getWujieById(this.getAttribute(WUJIE_APP_ID));  // 获取 sandbox
        sandbox?.unmount();  // 卸载 sandbox
      }
    }
    customElements?.define("wujie-app", WujieApp);  // 定义 wujie-app 元素
  }
}

export function createWujieWebComponent(id: string): HTMLElement {  // 创建 wujie-app 元素
  const contentElement = window.document.createElement("wujie-app");  // 创建元素
  contentElement.setAttribute(WUJIE_APP_ID, id);  // 设置 id
  contentElement.classList.add(WUJIE_IFRAME_CLASS);  // 添加默认 class
  return contentElement;  // 返回元素
}

/**
 * 将准备好的内容插入容器
 */
export function renderElementToContainer(  // 渲染元素到容器
  element: Element | ChildNode,  // 待插入元素
  selectorOrElement: string | HTMLElement  // 容器 selector 或元素
): HTMLElement {
  const container = getContainer(selectorOrElement);  // 获取容器
  if (container && !container.contains(element)) {  // 防止重复插入
    if (!container.querySelector(`div[${LOADING_DATA_FLAG}]`)) {  // 有 loading 不清理
      clearChild(container);  // 清空容器
    }
    if (element) {  // 插入元素
      rawElementAppendChild.call(container, element);  // 原生 appendChild
    }
  }
  return container;  // 返回容器
}

/**
 * 将降级的iframe挂在到容器上并进行初始化
 */
export function initRenderIframeAndContainer(  // 初始化 iframe 和容器
  id: string,  // sandbox id
  parent: string | HTMLElement,  // 容器
  degradeAttrs: { [key: string]: any } = {}  // iframe 降级属性
): { iframe: HTMLIFrameElement; container: HTMLElement } {
  const iframe = createIframeContainer(id, degradeAttrs);  // 创建 iframe
  const container = renderElementToContainer(iframe, parent);  // 渲染 iframe
  const contentDocument = iframe.contentWindow.document;  // 获取 iframe document
  contentDocument.open();  // 打开 document
  contentDocument.write("<!DOCTYPE html><html><head></head><body></body></html>");  // 初始化内容
  contentDocument.close();  // 关闭 document
  return { iframe, container };  // 返回 iframe 和容器
}

/**
 * 处理css-before-loader 以及 css-after-loader
 */
async function processCssLoaderForTemplate(sandbox: Wujie, html: HTMLHtmlElement): Promise<HTMLHtmlElement> {  // 执行 CSS 插件 loader
  const document = sandbox.iframe.contentDocument;  // iframe document
  const { plugins, replace, proxyLocation } = sandbox;  // 获取插件配置
  const cssLoader = getCssLoader({ plugins, replace });  // 获取 css loader
  const cssBeforeLoaders = getPresetLoaders("cssBeforeLoaders", plugins);  // 前置 css loader
  const cssAfterLoaders = getPresetLoaders("cssAfterLoaders", plugins);  // 后置 css loader
  const curUrl = getCurUrl(proxyLocation);  // 当前 url

  return await Promise.all([  // 执行前置和后置 loader
    Promise.all(
      getExternalStyleSheets(cssBeforeLoaders, sandbox.fetch, sandbox.lifecycles.loadError).map(
        ({ src, contentPromise }) => contentPromise.then((content) => ({ src, content }))  // 获取前置样式内容
      )
    ).then((contentList) => {  // 插入 head 前置样式
      contentList.forEach(({ src, content }) => {  // 遍历前置样式
        if (!content) return;  // 无内容跳过
        const styleElement = document.createElement("style");  // 创建 style
        styleElement.setAttribute("type", "text/css");  // 设置类型
        styleElement.appendChild(document.createTextNode(content ? cssLoader(content, src, curUrl) : content));  // 加载内容
        const head = html.querySelector("head");  // 获取 head
        const body = html.querySelector("body");  // 获取 body
        html.insertBefore(styleElement, head || body || html.firstChild);  // 插入 head 或 body 前
      });
    }),
    Promise.all(
      getExternalStyleSheets(cssAfterLoaders, sandbox.fetch, sandbox.lifecycles.loadError).map(
        ({ src, contentPromise }) => contentPromise.then((content) => ({ src, content }))  // 获取后置样式内容
      )
    ).then((contentList) => {  // 插入 body 后置样式
      contentList.forEach(({ src, content }) => {  // 遍历后置样式
        if (!content) return;  // 无内容跳过
        const styleElement = document.createElement("style");  // 创建 style
        styleElement.setAttribute("type", "text/css");  // 设置类型
        styleElement.appendChild(document.createTextNode(content ? cssLoader(content, src, curUrl) : content));  // 加载内容
        html.appendChild(styleElement);  // 插入 html
      });
    }),
  ]).then(
    () => html,  // 返回处理后的 html
    () => html  // 异常仍返回 html
  );
}

// 替换html的head和body
function replaceHeadAndBody(html: HTMLHtmlElement, head: HTMLHeadElement, body: HTMLBodyElement): HTMLHtmlElement {  // 替换 html 的 head 和 body
  const headElement = html.querySelector("head");  // 获取原 head
  const bodyElement = html.querySelector("body");  // 获取原 body
  if (headElement) {  // 替换 head
    while (headElement.firstChild) {  // 复制子节点
      rawAppendChild.call(head, headElement.firstChild.cloneNode(true));  // 复制到 shadow head
      headElement.removeChild(headElement.firstChild);  // 删除原节点
    }
    headElement.parentNode.replaceChild(head, headElement);  // 替换 head
  }
  if (bodyElement) {  // 替换 body
    while (bodyElement.firstChild) {  // 复制子节点
      rawAppendChild.call(body, bodyElement.firstChild.cloneNode(true));  // 复制到 shadow body
      bodyElement.removeChild(bodyElement.firstChild);  // 删除原节点
    }
    bodyElement.parentNode.replaceChild(body, bodyElement);  // 替换 body
  }
  return html;  // 返回 html
}

/**
 * 将template渲染成html元素
 */
function renderTemplateToHtml(iframeWindow: Window, template: string): HTMLHtmlElement {  // 将模板渲染成 HTMLHtmlElement
  const sandbox = iframeWindow.__WUJIE;  // 获取 sandbox
  const { head, body, alive, execFlag } = sandbox;  // 获取 sandbox 信息
  const document = iframeWindow.document;  // iframe document
  const parser = new DOMParser();  // DOMParser
  const parsedDocument = parser.parseFromString(template, "text/html");  // 解析 template
  const parsedHtml = parsedDocument.documentElement as HTMLHtmlElement;  // 获取 html 元素
  const sourceAttributes = parsedHtml.attributes;  // html 属性
  let html = document.createElement("html");  // 新建 html
  html.innerHTML = template;  // 设置 innerHTML
  for (let i = 0; i < sourceAttributes.length; i++) {  // 复制 html 属性
    html.setAttribute(sourceAttributes[i].name, sourceAttributes[i].value);  // 复制属性
  }
  if (!alive && execFlag) {  // 多次渲染替换 head body
    html = replaceHeadAndBody(html, head, body);  // 替换 head 和 body
  } else {  // 第一次渲染
    sandbox.head = html.querySelector("head");  // 保存 head
    sandbox.body = html.querySelector("body");  // 保存 body
  }
  const ElementIterator = document.createTreeWalker(html, NodeFilter.SHOW_ELEMENT, null, false);  // 遍历所有元素
  let nextElement = ElementIterator.currentNode as HTMLElement;  // 当前元素
  while (nextElement) {  // 遍历
    patchElementEffect(nextElement, iframeWindow);  // patch effect
    const relativeAttr = relativeElementTagAttrMap[nextElement.tagName];  // 获取相对路径属性
    const url = nextElement[relativeAttr];  // 获取 url
    if (relativeAttr) nextElement.setAttribute(relativeAttr, getAbsolutePath(url, nextElement.baseURI || ""));  // 转换为绝对路径
    nextElement = ElementIterator.nextNode() as HTMLElement;  // 下一个元素
  }
  if (!html.querySelector("head")) {  // 补 head
    const head = document.createElement("head");  // 新建 head
    html.appendChild(head);  // 添加 head
  }
  if (!html.querySelector("body")) {  // 补 body
    const body = document.createElement("body");  // 新建 body
    html.appendChild(body);  // 添加 body
  }
  return html;  // 返回 html
}

/**
 * 将template渲染到shadowRoot
 */
export async function renderTemplateToShadowRoot(  // 渲染 template 到 shadowRoot
  shadowRoot: ShadowRoot,  // shadowRoot
  iframeWindow: Window,  // iframe window
  template: string  // template
): Promise<void> {
  const html = renderTemplateToHtml(iframeWindow, template);  // 渲染 html
  const processedHtml = await processCssLoaderForTemplate(iframeWindow.__WUJIE, html);  // 执行 css loader
  shadowRoot.appendChild(processedHtml);  // 插入 shadowRoot
  const shade = document.createElement("div");  // 遮罩层
  shade.setAttribute("style", WUJIE_SHADE_STYLE);  // 设置样式
  processedHtml.insertBefore(shade, processedHtml.firstChild);  // 插入遮罩
  shadowRoot.head = shadowRoot.querySelector("head");  // 保存 head
  shadowRoot.body = shadowRoot.querySelector("body");  // 保存 body

  Object.defineProperty(shadowRoot.firstChild, "parentNode", {  // 修复 parentNode
    enumerable: true,
    configurable: true,
    get: () => iframeWindow.document,
  });

  patchRenderEffect(shadowRoot, iframeWindow.__WUJIE.id, false);  // patch 渲染 effect
}

export function createIframeContainer(id: string, degradeAttrs: { [key: string]: any } = {}): HTMLIFrameElement {  // 创建 iframe
  const iframe = document.createElement("iframe");  // 创建 iframe
  const defaultStyle = "height:100%;width:100%";  // 默认样式
  setAttrsToElement(iframe, {  // 设置属性
    ...degradeAttrs,
    style: [defaultStyle, degradeAttrs.style].join(";"),  // 合并样式
    [WUJIE_APP_ID]: id,  // 设置 id
  });
  return iframe;  // 返回 iframe
}

/**
 * 将template渲染到iframe
 */
export async function renderTemplateToIframe(  // 渲染 template 到 iframe
  renderDocument: Document,  // 渲染 document
  iframeWindow: Window,  // iframe window
  template: string  // template
): Promise<void> {
  const html = renderTemplateToHtml(iframeWindow, template);  // 渲染 html
  const processedHtml = await processCssLoaderForTemplate(iframeWindow.__WUJIE, html);  // css loader
  renderDocument.replaceChild(processedHtml, renderDocument.documentElement);  // 替换 documentElement

  Object.defineProperty(renderDocument.documentElement, "parentNode", {  // 修复 parentNode
    enumerable: true,
    configurable: true,
    get: () => iframeWindow.document,
  });

  patchRenderEffect(renderDocument, iframeWindow.__WUJIE.id, true);  // patch render effect
}

/**
 * 清除Element所有节点
 */
export function clearChild(root: ShadowRoot | Node): void {  // 清空节点
  while (root?.firstChild) {  // 遍历删除
    rawElementRemoveChild.call(root, root.firstChild);  // 删除
  }
}

/**
 * 给容器添加loading
 */
export function addLoading(el: string | HTMLElement, loading: HTMLElement): void {  // 添加 loading
  const container = getContainer(el);  // 获取容器
  clearChild(container);  // 清空容器
  let containerStyles = null;  // 样式缓存
  try {
    containerStyles = window.getComputedStyle(container);  // 获取样式
  } catch {
    return;  // 出错直接返回
  }
  if (containerStyles.position === "static") {  // 如果是 static
    container.setAttribute(CONTAINER_POSITION_DATA_FLAG, containerStyles.position);  // 保存原始 position
    container.setAttribute(
      CONTAINER_OVERFLOW_DATA_FLAG,
      containerStyles.overflow === "visible" ? "" : containerStyles.overflow
    );  // 保存原始 overflow
    container.style.setProperty("position", "relative");  // 设置 position
    container.style.setProperty("overflow", "hidden");  // 设置 overflow
  } else if (["relative", "sticky"].includes(containerStyles.position)) {  // 相对定位
    container.setAttribute(
      CONTAINER_OVERFLOW_DATA_FLAG,
      containerStyles.overflow === "visible" ? "" : containerStyles.overflow
    );  // 保存 overflow
    container.style.setProperty("overflow", "hidden");  // 隐藏滚动
  }
  const loadingContainer = document.createElement("div");  // 创建 loading 容器
  loadingContainer.setAttribute(LOADING_DATA_FLAG, "");  // 添加标记
  loadingContainer.setAttribute("style", WUJIE_LOADING_STYLE);  // 设置样式
  if (loading) loadingContainer.appendChild(loading);  // 添加自定义 loading
  else loadingContainer.innerHTML = WUJIE_LOADING_SVG;  // 默认 svg loading
  container.appendChild(loadingContainer);  // 插入容器
}

/**
 * 移除loading
 */
export function removeLoading(el: HTMLElement): void {  // 移除 loading
  const positionFlag = el.getAttribute(CONTAINER_POSITION_DATA_FLAG);  // 获取保存 position
  const overflowFlag = el.getAttribute(CONTAINER_OVERFLOW_DATA_FLAG);  // 获取保存 overflow
  if (positionFlag) el.style.removeProperty("position");  // 恢复 position
  if (overflowFlag !== null) {  // 恢复 overflow
    overflowFlag ? el.style.setProperty("overflow", overflowFlag) : el.style.removeProperty("overflow"); 
  }
  el.removeAttribute(CONTAINER_POSITION_DATA_FLAG);  // 移除标记
  el.removeAttribute(CONTAINER_OVERFLOW_DATA_FLAG);  // 移除标记
  const loadingContainer = el.querySelector(`div[${LOADING_DATA_FLAG}]`);  // 查找 loading
  loadingContainer && el.removeChild(loadingContainer);  // 移除 loading
}

/**
 * 获取修复好的样式元素
 * 主要是针对对root样式和font-face样式
 */
export function getPatchStyleElements(rootStyleSheets: Array<CSSStyleSheet>): Array<HTMLStyleElement | null> {  // 获取修复后的 style
  const rootCssRules = [];  // :root css rules
  const fontCssRules = [];  // font-face css rules
  const rootStyleReg = /:root/g;  // 正则匹配 :root

  for (let i = 0; i < rootStyleSheets.length; i++) {  // 遍历 styleSheets
    const cssRules = rootStyleSheets[i]?.cssRules ?? [];  // 获取 cssRules
    for (let j = 0; j < cssRules.length; j++) {  // 遍历规则
      const cssRuleText = cssRules[j].cssText;  // 获取文本
      if (rootStyleReg.test(cssRuleText)) {  // :root css
        rootCssRules.push(cssRuleText.replace(rootStyleReg, (match) => cssSelectorMap[match]));  // 替换为 :host
      }
      if (cssRules[j].type === CSSRule.FONT_FACE_RULE) {  // font-face css
        fontCssRules.push(cssRuleText);  // 保存规则
      }
    }
  }

  let rootStyleSheetElement = null;  // 创建 style 元素
  let fontStyleSheetElement = null;  // 创建 style 元素

  if (rootCssRules.length) {  // 有 root css
    rootStyleSheetElement = window.document.createElement("style");  // 创建 style
    rootStyleSheetElement.innerHTML = rootCssRules.join("");  // 设置内容
  }

  if (fontCssRules.length) {  // 有 font-face
    fontStyleSheetElement = window.document.createElement("style");  // 创建 style
    fontStyleSheetElement.innerHTML = fontCssRules.join("");  // 设置内容
  }

  return [rootStyleSheetElement, fontStyleSheetElement];  // 返回 style 元素数组
}
