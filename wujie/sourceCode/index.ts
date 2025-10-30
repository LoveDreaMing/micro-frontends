import importHTML, { processCssLoader } from "./entry"; // 导入解析 HTML / 外部资源的函数与处理 CSS loader 的方法
import { StyleObject, ScriptAttributes } from "./template"; // 导入样式与脚本属性类型定义
import WuJie, { lifecycle } from "./sandbox"; // 导入 WuJie 沙箱类与生命周期类型
import { defineWujieWebComponent, addLoading } from "./shadow"; // 导入定义 webcomponent 与添加 loading 的方法
import { processAppForHrefJump } from "./sync"; // 导入处理子应用内链接跳转同步的函数
import { getPlugins } from "./plugin"; // 导入插件解析器（将插件配置转换成内部格式）
import {
  wujieSupport,
  mergeOptions,
  isFunction,
  requestIdleCallback,
  isMatchSyncQueryById,
  warn,
  stopMainAppRun,
} from "./utils"; // 导入多个工具函数（支持检查、合并配置、类型判断、空闲回调、同步查询匹配、告警、中断主应用等）
import { getWujieById, getOptionsById, addSandboxCacheWithOptions } from "./common"; // 导入沙箱/配置缓存相关的通用方法
import { EventBus } from "./event"; // 导入事件总线类
import { WUJIE_TIPS_NOT_SUPPORTED } from "./constant"; // 导入不支持时提示文本常量

export const bus = new EventBus(Date.now().toString()); // 创建并导出一个全局事件总线实例，id 使用当前时间戳字符串

export interface ScriptObjectLoader {
  /** 脚本地址，内联为空 */
  src?: string;
  /** 脚本是否为module模块 */
  module?: boolean;
  /** 脚本是否为async执行 */
  async?: boolean;
  /** 脚本是否设置crossorigin */
  crossorigin?: boolean;
  /** 脚本crossorigin的类型 */
  crossoriginType?: "anonymous" | "use-credentials" | ""; 
  /** 脚本原始属性 */
  attrs?: ScriptAttributes;
  /** 内联script的代码 */
  content?: string;
  /** 执行回调钩子 */
  callback?: (appWindow: Window) => any;
  /** 子应用加载完毕事件 */
  onload?: Function;
}
export interface plugin {
  /** 处理html的loader */
  htmlLoader?: (code: string) => string;
  /** js排除列表 */
  jsExcludes?: Array<string | RegExp>;
  /** js忽略列表 */
  jsIgnores?: Array<string | RegExp>;
  /** 处理js加载前的loader */
  jsBeforeLoaders?: Array<ScriptObjectLoader>;
  /** 处理js的loader */
  jsLoader?: (code: string, url: string, base: string) => string;
  /** 处理js加载后的loader */
  jsAfterLoaders?: Array<ScriptObjectLoader>;
  /** css排除列表 */
  cssExcludes?: Array<string | RegExp>;
  /** css忽略列表 */
  cssIgnores?: Array<string | RegExp>;
  /** 处理css加载前的loader */
  cssBeforeLoaders?: Array<StyleObject>;
  /** 处理css的loader */
  cssLoader?: (code: string, url: string, base: string) => string;
  /** 处理css加载后的loader */
  cssAfterLoaders?: Array<StyleObject>;
  /** 子应用 window addEventListener 钩子回调 */
  windowAddEventListenerHook?: eventListenerHook;
  /** 子应用 window removeEventListener 钩子回调 */
  windowRemoveEventListenerHook?: eventListenerHook;
  /** 子应用 document addEventListener 钩子回调 */
  documentAddEventListenerHook?: eventListenerHook;
  /** 子应用 document removeEventListener 钩子回调 */
  documentRemoveEventListenerHook?: eventListenerHook;
  /** 子应用 向body、head插入元素后执行的钩子回调 */
  appendOrInsertElementHook?: <T extends Node>(element: T, iframeWindow: Window) => void;
  /** 子应用劫持元素的钩子回调 */
  patchElementHook?: <T extends Node>(element: T, iframeWindow: Window) => void;
  /** 用户自定义覆盖子应用 window 属性 */
  windowPropertyOverride?: (iframeWindow: Window) => void;
  /** 用户自定义覆盖子应用 document 属性 */
  documentPropertyOverride?: (iframeWindow: Window) => void;
}

type eventListenerHook = (
  iframeWindow: Window,
  type: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) => void; // 定义事件监听钩子类型（供插件使用以拦截 add/removeEventListener）

export type loadErrorHandler = (url: string, e: Error) => any; // 加载错误回调类型（传入出错 url 与 Error）

type baseOptions = {
  /** 唯一性用户必须保证 */
  name: string;
  /** 需要渲染的url */
  url: string;
  /** 需要渲染的html, 如果已有则无需从url请求 */
  html?: string;
  /** 代码替换钩子 */
  replace?: (code: string) => string;
  /** 自定义fetch */
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  /** 注入给子应用的属性 */
  props?: { [key: string]: any };
  /** 自定义运行iframe的属性 */
  attrs?: { [key: string]: any };
  /** 自定义降级渲染iframe的属性 */
  degradeAttrs?: { [key: string]: any };
  /** 子应用采用fiber模式执行 */
  fiber?: boolean;
  /** 子应用保活，state不会丢失 */
  alive?: boolean;
  /** 子应用采用降级iframe方案 */
  degrade?: boolean;
  /** 子应用插件 */
  plugins?: Array<plugin>;
  /** 子应用window监听事件 */
  iframeAddEventListeners?: Array<string>;
  /** 子应用iframe on事件 */
  iframeOnEvents?: Array<string>;
  /** 子应用生命周期 */
  beforeLoad?: lifecycle;
  beforeMount?: lifecycle;
  afterMount?: lifecycle;
  beforeUnmount?: lifecycle;
  afterUnmount?: lifecycle;
  activated?: lifecycle;
  deactivated?: lifecycle;
  loadError?: loadErrorHandler;
};

export type preOptions = Omit<baseOptions, "url"> & {
  /** 预执行 */
  exec?: boolean;
  url?: string;
};

export type startOptions = baseOptions & {
  /** 渲染的容器 */
  el: HTMLElement | string;
  /**
   * 路由同步开关
   * 如果false，子应用跳转主应用路由无变化，但是主应用的history还是会增加
   * https://html.spec.whatwg.org/multipage/history.html#the-history-interface
   */
  sync?: boolean;
  /** 子应用短路径替换，路由同步时生效 */
  prefix?: { [key: string]: string };
  /** 子应用加载时loading元素 */
  loading?: HTMLElement;
};

type optionProperty = "url" | "el"; // 用于后续类型运算（把 url/el 视作特殊属性）

/**
 * 合并 preOptions 和 startOptions，并且将 url 和 el 变成可选
 */
export type cacheOptions = Omit<preOptions & startOptions, optionProperty> &
  Partial<Pick<startOptions, optionProperty>>; // 组合类型：供缓存使用的选项类型（url/el 可选）

/**
 * 强制中断主应用运行
 * wujie.__WUJIE 如果为true说明当前运行环境是子应用
 * window.__POWERED_BY_WUJIE__ 如果为false说明子应用还没初始化完成
 * 上述条件同时成立说明主应用代码在iframe的loading阶段混入进来了，必须中断执行
 */
if (window.__WUJIE && !window.__POWERED_BY_WUJIE__) {
  stopMainAppRun(); // 在子应用环境但未被正确初始化时阻止主应用继续执行（防止主应用脚本污染子应用）
}

// 处理子应用链接跳转
processAppForHrefJump(); // 立即设置 href 跳转拦截/同步规则，保证之后的子应用链接也会被处理

// 定义webComponent容器
defineWujieWebComponent(); // 注册自定义元素（<wujie-*>）供以 webcomponent 方式挂载子应用

// 如果不支持则告警
if (!wujieSupport) warn(WUJIE_TIPS_NOT_SUPPORTED); // 检查浏览器支持性，若不支持则打印提示

/**
 * 缓存子应用配置
 */
export function setupApp(options: cacheOptions): void {
  if (options.name) addSandboxCacheWithOptions(options.name, options); // 将配置缓存到内部 map，便于 later start/preload 使用
}

/**
 * 运行无界app
 */
export async function startApp(startOptions: startOptions): Promise<Function | void> {
  const sandbox = getWujieById(startOptions.name); // 根据 name 尝试获取已存在的沙箱实例
  const cacheOptions = getOptionsById(startOptions.name); // 获取之前缓存的 options（若有）
  // 合并缓存配置
  const options = mergeOptions(startOptions, cacheOptions); // 合并用户传入的 startOptions 与缓存配置（startOptions 优先）
  const {
    name,
    url,
    html,
    replace,
    fetch,
    props,
    attrs,
    degradeAttrs,
    fiber,
    alive,
    degrade,
    sync,
    prefix,
    el,
    loading,
    plugins,
    lifecycles,
    iframeAddEventListeners,
    iframeOnEvents,
  } = options; // 解构合并后的 options 便于后续使用
  // 已经初始化过的应用，快速渲染
  if (sandbox) {
    sandbox.plugins = getPlugins(plugins); // 更新 sandbox 的插件实例（将插件配置解析为运行时格式）
    sandbox.lifecycles = lifecycles; // 更新生命周期钩子到 sandbox
    const iframeWindow = sandbox.iframe.contentWindow; // 取得沙箱 iframe 的 window 引用
    if (sandbox.preload) {
      await sandbox.preload; // 若有预加载任务，等待其完成以保证资源准备完毕
    }
    if (alive) {
      // 保活
      await sandbox.active({ url, sync, prefix, el, props, alive, fetch, replace }); // 激活沙箱（恢复 DOM / 状态）
      // 预加载但是没有执行的情况
      if (!sandbox.execFlag) {
        sandbox.lifecycles?.beforeLoad?.(sandbox.iframe.contentWindow); // 在执行前触发生命周期 beforeLoad
        const { getExternalScripts } = await importHTML({
          url,
          html,
          opts: {
            fetch: fetch || window.fetch, // 使用用户自定义 fetch 或全局 fetch
            plugins: sandbox.plugins, // 插件用于处理资源
            loadError: sandbox.lifecycles.loadError, // 加载错误回调
            fiber,
          },
        }); // 重新解析 HTML 得到脚本加载器
        await sandbox.start(getExternalScripts); // 开始执行脚本（真正 mount）
      }
      sandbox.lifecycles?.activated?.(sandbox.iframe.contentWindow); // 激活完成后触发 activated 钩子
      return () => sandbox.destroy(); // 返回一个销毁函数供调用者使用
    } else if (isFunction(iframeWindow.__WUJIE_MOUNT)) {
      /**
       * 子应用切换会触发webcomponent的disconnectedCallback调用sandbox.unmount进行实例销毁
       * 此处是防止没有销毁webcomponent时调用startApp的情况，需要手动调用unmount
       */
      await sandbox.unmount(); // 若存在 mount 函数但未执行 unmount，先手动卸载
      await sandbox.active({ url, sync, prefix, el, props, alive, fetch, replace }); // 激活 sandbox（将 iframe 插入到容器等）
      // 正常加载的情况，先注入css，最后才mount。重新激活也保持同样的时序
      sandbox.rebuildStyleSheets(); // 重新构建并注入样式表（保证样式正确）
      // 有渲染函数
      sandbox.lifecycles?.beforeMount?.(sandbox.iframe.contentWindow); // 触发 beforeMount 钩子
      iframeWindow.__WUJIE_MOUNT(); // 调用子应用挂载入口
      sandbox.lifecycles?.afterMount?.(sandbox.iframe.contentWindow); // 触发 afterMount 钩子
      sandbox.mountFlag = true; // 标记为已挂载
      return () => sandbox.destroy(); // 返回销毁函数
    } else {
      // 没有渲染函数
      await sandbox.destroy(); // 如果没有 mount 方法，销毁 sandbox（无法正常渲染）
    }
  }

  // 设置loading
  addLoading(el, loading); // 在容器里添加 loading DOM（若提供）
  const newSandbox = new WuJie({
    name,
    url,
    attrs,
    degradeAttrs,
    fiber,
    degrade,
    plugins,
    lifecycles,
    iframeAddEventListeners,
    iframeOnEvents,
  }); // 创建新的沙箱实例并传入配置
  newSandbox.lifecycles?.beforeLoad?.(newSandbox.iframe.contentWindow); // 触发 beforeLoad 钩子（沙箱创建后）
  const { template, getExternalScripts, getExternalStyleSheets } = await importHTML({
    url,
    html,
    opts: {
      fetch: fetch || window.fetch, // 传入 fetch
      plugins: newSandbox.plugins, // 传入插件
      loadError: newSandbox.lifecycles.loadError, // 错误回调
      fiber,
    },
  }); // 解析目标页面并得到 template 与外部资源加载器

  const processedHtml = await processCssLoader(newSandbox, template, getExternalStyleSheets); // 处理样式（走插件链或 loader）
  await newSandbox.active({ url, sync, prefix, template: processedHtml, el, props, alive, fetch, replace }); // 激活沙箱（插入 iframe、应用模板、同步路由等）
  await newSandbox.start(getExternalScripts); // 开始加载并执行外部脚本（完成 mount 流程）
  return () => newSandbox.destroy(); // 返回销毁函数以便外部调用
}

/**
 * 预加载无界APP
 */
export function preloadApp(preOptions: preOptions): void {
  requestIdleCallback((): void | Promise<void> => {
    /**
     * 已经存在
     * url查询参数中有子应用的id，大概率是刷新浏览器或者分享url，此时需要直接打开子应用，无需预加载
     */
    if (getWujieById(preOptions.name) || isMatchSyncQueryById(preOptions.name)) return; // 若实例存在或 url 已要求打开该子应用则跳过预加载
    const cacheOptions = getOptionsById(preOptions.name); // 获取缓存配置
    // 合并缓存配置
    const options = mergeOptions({ ...preOptions }, cacheOptions); // 合并 preOptions 与缓存配置
    const {
      name,
      url,
      html,
      props,
      alive,
      replace,
      fetch,
      exec,
      attrs,
      degradeAttrs,
      fiber,
      degrade,
      prefix,
      plugins,
      lifecycles,
      iframeAddEventListeners,
      iframeOnEvents,
    } = options; // 解构必要选项

    const sandbox = new WuJie({
      name,
      url,
      attrs,
      degradeAttrs,
      fiber,
      degrade,
      plugins,
      lifecycles,
      iframeAddEventListeners,
      iframeOnEvents,
    }); // 创建沙箱用于预加载资源
    if (sandbox.preload) return sandbox.preload; // 若已经存在预加载任务则直接返回该 promise（避免重复）
    const runPreload = async () => {
      sandbox.lifecycles?.beforeLoad?.(sandbox.iframe.contentWindow); // 触发 beforeLoad 钩子
      const { template, getExternalScripts, getExternalStyleSheets } = await importHTML({
        url,
        html,
        opts: {
          fetch: fetch || window.fetch, // 自定义或全局 fetch
          plugins: sandbox.plugins, // 插件链
          loadError: sandbox.lifecycles.loadError, // 加载错误处理器
          fiber,
        },
      }); // 解析 HTML，获取资源加载器
      const processedHtml = await processCssLoader(sandbox, template, getExternalStyleSheets); // 处理 css、返回处理后的 template
      await sandbox.active({ url, props, prefix, alive, template: processedHtml, fetch, replace }); // 激活沙箱（但不一定执行脚本）
      if (exec) {
        await sandbox.start(getExternalScripts); // 若 exec 为 true，则执行脚本（完成预执行）
      } else {
        await getExternalScripts(); // 否则只预加载外部脚本资源但不执行（获取脚本列表/缓存）
      }
    };
    sandbox.preload = runPreload(); // 将预加载任务保存到 sandbox.preload，防止重复启动
  });
}

/**
 * 销毁无界APP
 */
export function destroyApp(id: string): void {
  const sandbox = getWujieById(id); // 根据 id 获取沙箱实例
  if (sandbox) {
    sandbox.destroy(); // 如果存在则销毁（移除 iframe、清理事件、释放资源）
  }
}
