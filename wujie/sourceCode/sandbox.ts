import {
  iframeGenerator, // 创建 iframe，用于子应用运行的沙箱环境
  recoverEventListeners, // 恢复子应用 window 上的事件监听（保活模式下使用）
  recoverDocumentListeners, // 恢复 document 上的事件监听，避免事件丢失（特别是 React16）
  insertScriptToIframe, // 向 iframe 中插入脚本，保证按顺序执行
  patchEventTimeStamp // 修复 iframe 中事件 timeStamp 异常（Vue 事件兼容）
} from './iframe';

import { syncUrlToWindow, syncUrlToIframe, clearInactiveAppUrl } from './sync';
// syncUrlToWindow：子应用路由同步回主应用
// syncUrlToIframe：主应用路由同步到子应用 iframe
// clearInactiveAppUrl：清理非激活子应用的路由同步缓存参数

import {
  createWujieWebComponent, // 创建 Web Component（Shadow DOM 容器）
  clearChild, // 清空 DOM 节点内部子元素
  getPatchStyleElements, // 获取需要给 CSS 打补丁的 styleSheet（如 :root → :host、@font-face 等）
  renderElementToContainer, // 渲染子应用根节点到容器中
  renderTemplateToShadowRoot, // 将 HTML 模板渲染到 ShadowRoot 中
  renderTemplateToIframe, // 将 HTML 模板渲染到 iframe 内部（降级模式）
  initRenderIframeAndContainer, // 降级模式下初始化 iframe + 容器渲染
  removeLoading // 移除子应用加载时的 loading UI
} from './shadow';

import { proxyGenerator, localGenerator } from './proxy';
// proxyGenerator：非降级模式下生成 window / document / location 代理沙箱
// localGenerator：降级模式（无 Proxy）下生成 document / location 代理

import { ScriptResultList } from './entry'; // 脚本执行结果的类型定义（包含脚本内容/属性）

import { getPlugins, getPresetLoaders } from './plugin';
// getPlugins：初始化插件
// getPresetLoaders：获取插件注入的 script 执行钩子（before/after loaders）

import { removeEventListener } from './effect'; // 清理子应用中的事件监听器（避免内存泄露）

import {
  SandboxCache, // Sandbox 缓存对象结构
  idToSandboxCacheMap, // 全局缓存 Map，用于存储所有子应用的沙箱实例
  addSandboxCacheWithWujie, // 将新创建的 Wujie 实例加入全局缓存
  deleteWujieById, // 根据子应用 id 删除沙箱缓存
  rawElementAppendChild, // 原生 appendChild，避免被代理污染
  rawDocumentQuerySelector // 原生 querySelector，避免被子应用 document 影响
} from './common';

import { EventBus, appEventObjMap, EventObj } from './event';
// EventBus：子应用通信事件总线
// appEventObjMap：缓存事件对象列表，用于应用间事件通信
// EventObj：事件对象结构定义

import {
  isFunction, // 判断是否为函数
  wujieSupport, // 判断当前环境是否支持沙箱（Proxy + iframe）
  appRouteParse, // 解析子应用 URL（提取 host、path 等信息）
  requestIdleCallback, // 空闲时间调度器（fiber 模式使用）
  getAbsolutePath, // 获取资源绝对路径，防止路径错误
  eventTrigger // 触发自定义事件（DOMContentLoaded/load 等）
} from './utils';

import { WUJIE_DATA_ATTACH_CSS_FLAG } from './constant'; // ShadowRoot 上标记是否已注入 CSS 补丁

import { plugin, ScriptObjectLoader, loadErrorHandler } from './index';
// plugin：插件类型定义
// ScriptObjectLoader：用于加载脚本的 preset loader 类型
// loadErrorHandler：脚本加载错误 hook 类型

export type lifecycle = (appWindow: Window) => any; // 生命周期函数类型，入参是子应用 window
type lifecycles = {
  beforeLoad: lifecycle; // 加载前（预加载阶段触发）
  beforeMount: lifecycle; // 挂载前（调用子应用 mount 之前）
  afterMount: lifecycle; // 挂载后（mount 成功后）
  beforeUnmount: lifecycle; // 卸载前
  afterUnmount: lifecycle; // 卸载后
  activated: lifecycle; // 保活模式：重新激活时
  deactivated: lifecycle; // 保活模式：被切走时触发（不卸载）
  loadError: loadErrorHandler; // 加载失败时触发的生命周期回调
};

/**
 * 基于 Proxy和iframe 实现的沙箱
 */
export default class Wujie {
  public id: string;
  /** 激活时路由地址 */
  public url: string;
  /** 子应用保活 */
  public alive: boolean;
  /** window代理 */
  public proxy: WindowProxy;
  /** document代理 */
  public proxyDocument: Object;
  /** location代理 */
  public proxyLocation: Object;
  /** 事件中心 */
  public bus: EventBus;
  /** 容器 */
  public el: HTMLElement;
  /** js沙箱 */
  public iframe: HTMLIFrameElement;
  /** css沙箱 */
  public shadowRoot: ShadowRoot;
  /** 子应用的template */
  public template: string;
  /** 子应用代码替换钩子 */
  public replace: (code: string) => string;
  /** 子应用自定义fetch */
  public fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  /** 子应用的生命周期 */
  public lifecycles: lifecycles;
  /** 子应用的插件 */
  public plugins: Array<plugin>;
  /** js沙箱ready态 */
  public iframeReady: Promise<void>;
  /** 子应用预加载态 */
  public preload: Promise<void>;
  /** 降级时渲染iframe的属性 */
  public degradeAttrs: { [key: string]: any };
  /** 子应用js执行队列 */
  public execQueue: Array<Function>;
  /** 子应用执行过标志 */
  public execFlag: boolean;
  /** 子应用激活标志 */
  public activeFlag: boolean;
  /** 子应用mount标志 */
  public mountFlag: boolean;
  /** 路由同步标志 */
  public sync: boolean;
  /** 子应用短路径替换，路由同步时生效 */
  public prefix: { [key: string]: string };
  /** 子应用跳转标志 */
  public hrefFlag: boolean;
  /** 子应用采用fiber模式执行 */
  public fiber: boolean;
  /** 子应用降级标志 */
  public degrade: boolean;
  /** 子应用降级document */
  public document: Document;
  /** 子应用styleSheet元素 */
  public styleSheetElements: Array<HTMLLinkElement | HTMLStyleElement>;
  /** 子应用head元素 */
  public head: HTMLHeadElement;
  /** 子应用body元素 */
  public body: HTMLBodyElement;
  /** 子应用dom监听事件留存，当降级时用于保存元素事件 */
  public elementEventCacheMap: WeakMap<
    Node,
    Array<{
      type: string;
      handler: EventListenerOrEventListenerObject;
      options: any;
    }>
  > = new WeakMap();
  /** 子应用window监听事件 */
  public iframeAddEventListeners?: Array<string>;
  /** 子应用iframe on事件 */
  public iframeOnEvents?: Array<string>;

  /** $wujie对象，提供给子应用的接口 */
  public provide: {
    bus: EventBus;
    shadowRoot?: ShadowRoot;
    props?: { [key: string]: any };
    location?: Object;
  };

  /** 子应用嵌套场景，父应用传递给子应用的数据 */
  public inject: {
    idToSandboxMap: Map<String, SandboxCache>;
    appEventObjMap: Map<String, EventObj>;
    mainHostPath: string;
  };

  /** 激活子应用
   * 1、同步路由
   * 2、动态修改iframe的fetch
   * 3、准备shadow
   * 4、准备子应用注入
   */
  public async active(options: {
    url: string; // 子应用激活时使用的 url，影响路由及资源加载
    sync?: boolean; // 是否开启路由同步（主应用与子应用双向同步）
    prefix?: { [key: string]: string }; // 静态资源前缀映射，用于解决资源路径不一致问题
    template?: string; // 子应用 HTML 模板，用于渲染子应用内容
    el?: string | HTMLElement; // 子应用渲染挂载点（可传入选择器或 DOM 元素）
    props?: { [key: string]: any }; // 传递给子应用的 props 数据
    alive?: boolean; // 是否启用保活模式（keep-alive 保留 DOM 和状态）
    fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>; // 覆盖子应用 fetch，可进行请求拦截、补全域名等
    replace?: (code: string) => string; // 代码替换钩子，可用于过滤或修改 script 内容
  }): Promise<void> {
    const { sync, url, el, template, props, alive, prefix, fetch, replace } =
      options; // 解构出传入配置
    this.url = url; // 记录子应用当前访问 url
    this.sync = sync; // 是否开启路由同步模式
    this.alive = alive; // 标记是否为保活模式
    this.hrefFlag = false; // 重置 href 更新标识，用于控制路由变更
    this.prefix = prefix ?? this.prefix; // 设置资源前缀（未传入则沿用之前的）
    this.replace = replace ?? this.replace; // 设置 script 代码替换逻辑
    this.provide.props = props ?? this.provide.props; // 更新 props，注入子应用上下文
    this.activeFlag = true; // 当前子应用激活状态标记

    await this.iframeReady; // 等待 iframe 初始化完成

    const iframeWindow = this.iframe.contentWindow!; // 获取子应用 iframe window 对象

    // 处理子应用自定义 fetch（用于拦截或改写资源请求）
    const iframeFetch = fetch
      ? (input: RequestInfo, init?: RequestInit) =>
          fetch(
            typeof input === 'string'
              ? getAbsolutePath(input, (this.proxyLocation as Location).href) // 将相对路径转换成子应用对应的绝对路径
              : input,
            init
          )
      : this.fetch; // 未传入 fetch 则使用缓存的 fetch
    if (iframeFetch) {
      iframeWindow.fetch = iframeFetch; // 覆盖 iframe 内部 fetch 实现
      this.fetch = iframeFetch; // 缓存设置后的 fetch
    }

    // 处理子应用路由同步逻辑
    if (this.execFlag && this.alive) {
      // 若已执行过脚本并为保活模式
      syncUrlToWindow(iframeWindow); // 仅同步路由到主应用
    } else {
      syncUrlToIframe(iframeWindow); // 主应用 → 子应用同步
      syncUrlToWindow(iframeWindow); // 子应用 → 主应用同步（确保一致）
    }

    this.template = template ?? this.template; // 设置模板内容

    /* 降级渲染（不使用 Shadow DOM 时走该逻辑） */
    if (this.degrade) {
      const iframeBody = rawDocumentQuerySelector.call(
        iframeWindow.document,
        'body'
      ) as HTMLElement; // 获取 iframe body 节点
      const { iframe, container } = initRenderIframeAndContainer(
        this.id,
        el ?? iframeBody,
        this.degradeAttrs
      ); // 初始化 iframe 子应用容器
      this.el = container; // 记录子应用容器
      if (el) clearChild(iframeBody); // 若有自定义挂载点，则清空 iframe body 内容
      patchEventTimeStamp(iframe.contentWindow!, iframeWindow); // 修复 Vue 事件 timeStamp 不一致问题
      iframe.contentWindow!.onunload = () => {
        this.unmount(); // iframe 卸载时主动卸载子应用
      };

      if (this.document) {
        // 若保活模式缓存过 document
        if (this.alive) {
          iframe.contentDocument!.replaceChild(
            this.document.documentElement,
            iframe.contentDocument!.documentElement
          ); // 保活场景直接复用旧 DOM
          recoverEventListeners(
            iframe.contentDocument!.documentElement,
            iframeWindow
          ); // 恢复事件监听
        } else {
          await renderTemplateToIframe(
            iframe.contentDocument!,
            this.iframe.contentWindow!,
            this.template
          ); // 非保活：重新渲染模板
          recoverDocumentListeners(
            this.document.documentElement,
            iframe.contentDocument!.documentElement,
            iframeWindow
          ); // 恢复 document 级事件监听（兼容 React16）
        }
      } else {
        await renderTemplateToIframe(
          iframe.contentDocument!,
          this.iframe.contentWindow!,
          this.template
        ); // 首次渲染模板到 iframe
      }

      this.document = iframe.contentDocument!; // 缓存子应用 document 用于保活
      return; // 降级模式结束
    }

    // Shadow DOM 正常渲染模式
    if (this.shadowRoot) {
      this.el = renderElementToContainer(this.shadowRoot.host, el); // 将子应用挂载到 shadow host
      if (this.alive) return; // 若保活模式无需重新渲染
    } else {
      const iframeBody = rawDocumentQuerySelector.call(
        iframeWindow.document,
        'body'
      ) as HTMLElement; // 获取 iframe body
      this.el = renderElementToContainer(
        createWujieWebComponent(this.id), // 创建 Wujie WebComponent 根节点
        el ?? iframeBody // 未传入挂载点则挂载到 iframe body
      ); // 渲染触发 WebComponent connectedCallback
    }

    await renderTemplateToShadowRoot(
      this.shadowRoot!,
      iframeWindow,
      this.template
    ); // 渲染模板内容到 Shadow DOM 内部
    this.patchCssRules(); // 补丁样式隔离规则，确保子应用样式不污染主应用

    this.provide.shadowRoot = this.shadowRoot!; // 将 shadowRoot 注入 provide，供子应用使用
  }

  // 未销毁，空闲时才回调
  public requestIdleCallback(callback) {
    // 封装子应用的 requestIdleCallback，用于空闲时执行回调
    return requestIdleCallback(() => {
      // 使用浏览器 requestIdleCallback 执行回调（节省性能）
      if (!this.iframe) return; // 若子应用已销毁，则不再执行回调，避免已无容器时触发逻辑
      callback.apply(this); // 在当前 Wujie 实例上下文中执行传入回调
    });
  }

  /** 启动子应用
   * 1、运行js
   * 2、处理兼容样式
   */
  public async start(
    getExternalScripts: () => ScriptResultList // 外部方法：返回需执行的脚本列表（包含 async / defer / 普通 script）
  ): Promise<void> {
    this.execFlag = true; // 标记脚本已开始执行（用于区分首次执行与保活恢复）

    const scriptResultList = await getExternalScripts(); // 获取需要执行的所有 script 执行对象（包含内容与属性）
    if (!this.iframe) return; // 若子应用已销毁，则不再执行脚本

    const iframeWindow = this.iframe.contentWindow!; // 获取 iframe 执行环境 window 对象
    iframeWindow.__POWERED_BY_WUJIE__ = true; // 标记当前环境由 Wujie 驱动（供子应用识别微前端环境）

    // 获取用户自定义 script 执行前的钩子插件
    const beforeScriptResultList: ScriptObjectLoader[] = getPresetLoaders(
      'jsBeforeLoaders',
      this.plugins
    ); // 插件：script 执行前注入的 loader

    // 获取用户自定义 script 执行后的钩子插件
    const afterScriptResultList: ScriptObjectLoader[] = getPresetLoaders(
      'jsAfterLoaders',
      this.plugins
    ); // 插件：script 执行后注入的 loader

    const syncScriptResultList: ScriptResultList = []; // 普通 script（同步执行、必须按顺序）
    const asyncScriptResultList: ScriptResultList = []; // async script（无需保证顺序，可并行执行）
    const deferScriptResultList: ScriptResultList = []; // defer script（保证顺序且在 DOMContentLoaded 前执行）

    // 按 type 分类脚本执行模式
    scriptResultList.forEach((scriptResult) => {
      if (scriptResult.defer)
        deferScriptResultList.push(scriptResult); // defer 脚本收集
      else if (scriptResult.async)
        asyncScriptResultList.push(scriptResult); // async 脚本收集
      else syncScriptResultList.push(scriptResult); // 普通同步脚本
    });

    /** 插入脚本前执行（如劫持变量、设置上下文、polyfill 注入） */
    beforeScriptResultList.forEach((beforeScriptResult) => {
      this.execQueue.push(
        () =>
          // 添加到执行队列保证串行执行
          this.fiber
            ? this.requestIdleCallback(
                () => insertScriptToIframe(beforeScriptResult, iframeWindow) // Fiber模式：空闲时执行
              )
            : insertScriptToIframe(beforeScriptResult, iframeWindow) // 非Fiber模式：立即执行
      );
    });

    /** 执行同步 & defer 脚本（必须按顺序执行） */
    syncScriptResultList
      .concat(deferScriptResultList) // defer脚本紧接同步脚本顺序执行
      .forEach((scriptResult) => {
        this.execQueue.push(() =>
          scriptResult.contentPromise.then(
            (
              content // 获取 script 内容后执行
            ) =>
              this.fiber
                ? this.requestIdleCallback(() =>
                    insertScriptToIframe(
                      { ...scriptResult, content },
                      iframeWindow
                    )
                  )
                : insertScriptToIframe(
                    { ...scriptResult, content },
                    iframeWindow
                  )
          )
        );
      });

    /** 执行 async 脚本（不串行处理，加载完即执行） */
    asyncScriptResultList.forEach((scriptResult) => {
      scriptResult.contentPromise.then((content) => {
        this.fiber
          ? this.requestIdleCallback(() =>
              insertScriptToIframe({ ...scriptResult, content }, iframeWindow)
            )
          : insertScriptToIframe({ ...scriptResult, content }, iframeWindow);
      });
    });

    /** 所有 script 加载完后框架自动调用 mount（模拟浏览器脚本加载完成后执行） */
    this.execQueue.push(
      this.fiber
        ? () => this.requestIdleCallback(() => this.mount()) // Fiber：空闲时执行mount
        : () => this.mount() // 非Fiber：立即mount
    );

    /** 触发 DOMContentLoaded 事件（脚本执行完成但资源未加载完成时触发） */
    const domContentLoadedTrigger = () => {
      eventTrigger(iframeWindow.document, 'DOMContentLoaded'); // document 触发
      eventTrigger(iframeWindow, 'DOMContentLoaded'); // window 触发
      this.execQueue.shift()?.(); // 执行下一个队列任务
    };
    this.execQueue.push(
      this.fiber
        ? () => this.requestIdleCallback(domContentLoadedTrigger)
        : domContentLoadedTrigger
    );

    /** 插入脚本后执行（如还原变量、执行用户插件、补丁逻辑等） */
    afterScriptResultList.forEach((afterScriptResult) => {
      this.execQueue.push(() =>
        this.fiber
          ? this.requestIdleCallback(() =>
              insertScriptToIframe(afterScriptResult, iframeWindow)
            )
          : insertScriptToIframe(afterScriptResult, iframeWindow)
      );
    });

    /** 触发 load 事件（全部资源加载完成，包括脚本和图片） */
    const domLoadedTrigger = () => {
      eventTrigger(iframeWindow.document, 'readystatechange'); // readyState = complete
      eventTrigger(iframeWindow, 'load'); // window load事件
      this.execQueue.shift()?.(); // 执行下一个任务
    };
    this.execQueue.push(
      this.fiber
        ? () => this.requestIdleCallback(domLoadedTrigger)
        : domLoadedTrigger
    );

    // 若是保活或重建模式，无法准确识别 mount 时机，则提前关闭 loading
    if (this.alive || !isFunction(this.iframe.contentWindow.__WUJIE_UNMOUNT))
      removeLoading(this.el); // 移除loading UI
    this.execQueue.shift()(); // 执行队列第一个任务（开始执行整个执行链）

    // 当所有 execQueue 任务执行完毕后，start 才算真正完成
    return new Promise((resolve) => {
      this.execQueue.push(() => {
        resolve(); // 结束 start Promise（确保子应用完全初始化后才resolve）
        this.execQueue.shift()?.(); // 执行下一个队列任务
      });
    });
  }

  /**
   * 框架主动发起mount，如果子应用是异步渲染实例，比如将生命周__WUJIE_MOUNT放到async函数内
   * 此时如果采用fiber模式渲染（主应用调用mount的时机也是异步不确定的），框架调用mount时可能
   * 子应用的__WUJIE_MOUNT还没有挂载到window，所以这里封装一个mount函数，当子应用是异步渲染
   * 实例时，子应用异步函数里面最后加上window.__WUJIE.mount()来主动调用
   */
  public mount(): void {
    if (this.mountFlag) return; // 若已挂载则不重复执行
    if (isFunction(this.iframe.contentWindow.__WUJIE_MOUNT)) {
      // 判断子应用是否暴露 __WUJIE_MOUNT 方法
      removeLoading(this.el); // 移除 loading 元素
      this.lifecycles?.beforeMount?.(this.iframe.contentWindow); // 执行 beforeMount 生命周期
      this.iframe.contentWindow.__WUJIE_MOUNT(); // 调用子应用的 mount 逻辑
      this.lifecycles?.afterMount?.(this.iframe.contentWindow); // 执行 afterMount 生命周期
      this.mountFlag = true; // 标记已挂载
    }
    if (this.alive) {
      // 若是 keep-alive 模式
      this.lifecycles?.activated?.(this.iframe.contentWindow); // 执行 activated 生命周期（重新激活）
    }
    this.execQueue.shift()?.(); // 执行队列中的下一个任务
  }

  /** 保活模式和使用 proxyLocation.href 跳转链接都不应该销毁 shadow */
  public async unmount(): Promise<void> {
    this.activeFlag = false; // 标记为未激活状态
    clearInactiveAppUrl(); // 清理子应用的过期同步参数
    if (this.alive) {
      // keep-alive 模式不真正卸载，只执行 deactivated
      this.lifecycles?.deactivated?.(this.iframe.contentWindow); // 执行 deactivated 生命周期
    }
    if (!this.mountFlag) return; // 未挂载则无需卸载
    if (
      isFunction(this.iframe.contentWindow.__WUJIE_UNMOUNT) && // 判断子应用是否实现 unmount 钩子
      !this.alive && // keep-alive 模式下不真正执行卸载
      !this.hrefFlag // 若是通过 proxyLocation.href 触发的跳转，也不卸载
    ) {
      this.lifecycles?.beforeUnmount?.(this.iframe.contentWindow); // 执行 beforeUnmount 生命周期
      await this.iframe.contentWindow.__WUJIE_UNMOUNT(); // 调用子应用自定义卸载逻辑
      this.lifecycles?.afterUnmount?.(this.iframe.contentWindow); // 执行 afterUnmount 生命周期
      this.mountFlag = false; // 标记已卸载
      this.bus?.$clear(); // 清空事件总线
      if (!this.degrade) {
        // 非降级模式下需要清空 Shadow DOM
        clearChild(this.shadowRoot); // 清空 shadowRoot 下的内容
        removeEventListener(this.head); // 清空 head 上的事件监听
        removeEventListener(this.body); // 清空 body 上的事件监听
      }
      clearChild(this.head); // 清理 iframe document.head
      clearChild(this.body); // 清理 iframe document.body
    }
  }

  /** 销毁子应用，彻底释放资源 */
  public async destroy() {
    await this.unmount(); // 先执行卸载逻辑
    this.bus.$clear(); // 清空事件总线
    this.shadowRoot = null; // 清除 shadowRoot 引用
    this.proxy = null; // 清除 proxy window
    this.proxyDocument = null; // 清除代理 document
    this.proxyLocation = null; // 清除代理 location
    this.execQueue = null; // 清除任务队列
    this.provide = null; // 清除 provide 注入内容
    this.degradeAttrs = null; // 清除降级属性
    this.styleSheetElements = null; // 清除样式缓存
    this.bus = null; // 清除事件总线实例
    this.replace = null; // 清除 replace（可能重写过的 window.replaceState）
    this.fetch = null; // 清除 fetch 代理
    this.execFlag = null; // 清除脚本执行标记
    this.mountFlag = null; // 清除挂载标记
    this.hrefFlag = null; // 清除 href 跳转标记
    this.document = null; // 清除 document 引用
    this.head = null; // 清除 head 引用
    this.body = null; // 清除 body 引用
    this.elementEventCacheMap = null; // 清空绑定事件缓存
    this.lifecycles = null; // 清除生命周期对象
    this.plugins = null; // 清除插件列表
    this.provide = null; // 清除 provide 内容
    this.inject = null; // 清除 inject 注入内容
    this.execQueue = null; // 清空执行队列
    this.prefix = null; // 清除路径前缀
    this.iframeAddEventListeners = null; // 清除 iframe 事件监听列表
    this.iframeOnEvents = null; // 清除 iframe on 事件列表
    // 清除宿主 DOM
    if (this.el) {
      clearChild(this.el); // 清空挂载元素内容
      this.el = null; // 释放引用
    }
    // 清除 iframe sandbox
    if (this.iframe) {
      const iframeWindow = this.iframe.contentWindow; // 获取 iframe window
      if (iframeWindow?.__WUJIE_EVENTLISTENER__) {
        // 若存在事件监听缓存，则移除
        iframeWindow.__WUJIE_EVENTLISTENER__.forEach((o) => {
          iframeWindow.removeEventListener(o.type, o.listener, o.options); // 移除监听
        });
      }
      this.iframe.parentNode?.removeChild(this.iframe); // 将 iframe 从 DOM 移除
      this.iframe = null; // 释放 iframe 引用
    }
    deleteWujieById(this.id); // 从全局缓存中移除该实例
  }

  /** 当子应用再次激活后，只运行mount函数，样式需要重新恢复 */
  public rebuildStyleSheets(): void {
    if (this.styleSheetElements && this.styleSheetElements.length) {
      // 若存在缓存的样式表则恢复
      this.styleSheetElements.forEach((styleSheetElement) => {
        // 遍历已缓存的样式节点
        rawElementAppendChild.call(
          this.degrade ? this.document.head : this.shadowRoot.head, // 降级模式使用 iframe document.head，否则使用 shadowRoot.head
          styleSheetElement // 重新插入样式节点
        );
      });
    }
    this.patchCssRules(); // 恢复样式后再执行样式补丁逻辑
  }

  /**
   * 子应用样式打补丁
   * 1、兼容 :root 选择器样式到 :host 上，从而适配 Shadow DOM
   * 2、将 @font-face 声明移动到 shadowRoot 外，避免字体无法生效
   */
  public patchCssRules(): void {
    if (this.degrade) return; // 降级模式不支持 Shadow DOM，不需要打补丁
    if (this.shadowRoot.host.hasAttribute(WUJIE_DATA_ATTACH_CSS_FLAG)) return; // 若已补丁过则不重复执行
    const [hostStyleSheetElement, fontStyleSheetElement] =
      getPatchStyleElements(
        Array.from(this.iframe.contentDocument.querySelectorAll('style')).map(
          (styleSheetElement) => styleSheetElement.sheet // 将 style 节点转为 CSSStyleSheet
        )
      );
    if (hostStyleSheetElement) {
      // 若存在针对 host 的样式补丁
      this.shadowRoot.head.appendChild(hostStyleSheetElement); // 插入到 shadowRoot.head
      this.styleSheetElements.push(hostStyleSheetElement); // 缓存该样式用于恢复
    }
    if (fontStyleSheetElement) {
      // 若存在字体补丁样式
      this.shadowRoot.host.appendChild(fontStyleSheetElement); // 插入 host 节点外部
    }
    (hostStyleSheetElement || fontStyleSheetElement) &&
      this.shadowRoot.host.setAttribute(WUJIE_DATA_ATTACH_CSS_FLAG, ''); // 标记已执行样式补丁
  }

  constructor(options: {
    name: string; // 子应用的唯一名称，用作沙箱ID
    url: string; // 子应用入口URL，可包含协议、域名、路径、参数、hash
    attrs: { [key: string]: any }; // 传入 iframe 的属性，如 sandbox、src、class 等
    degradeAttrs: { [key: string]: any }; // 降级模式下 iframe 提供的额外属性
    fiber: boolean; // 是否开启 fiber 模式（空闲调度执行脚本）
    degrade; // 是否启用降级模式（不使用 Shadow DOM 与 Proxy）
    plugins: Array<plugin>; // 注册的插件列表
    lifecycles: lifecycles; // 子应用生命周期对象
    iframeAddEventListeners?: Array<string>; // 需要代理监听的事件类型（addEventListener）
    iframeOnEvents?: Array<string>; // 需要代理的 onXXX 事件类型
  }) {
    // 若当前环境已由无界沙箱创建（嵌套子应用），继承父应用的 inject
    if (window.__POWERED_BY_WUJIE__) this.inject = window.__WUJIE.inject;
    else {
      this.inject = {
        // 主应用首次初始化创建 inject 注入内容
        idToSandboxMap: idToSandboxCacheMap, // 存储所有沙箱实例的全局Map
        appEventObjMap, // 事件总线对象映射
        mainHostPath: window.location.protocol + '//' + window.location.host // 主应用host，用于url校验
      };
    }

    const {
      name,
      url,
      attrs,
      fiber,
      degradeAttrs,
      degrade,
      lifecycles,
      plugins
    } = options;
    this.id = name; // 设置子应用id
    this.fiber = fiber; // 是否启用 fiber 模式
    this.degrade = degrade || !wujieSupport; // 若不支持无界则强制降级模式
    this.bus = new EventBus(this.id); // 创建独立事件总线
    this.url = url; // 子应用入口 URL
    this.degradeAttrs = degradeAttrs; // 降级模式下 iframe 属性
    this.provide = { bus: this.bus }; // provide 可供子应用注入的对象
    this.styleSheetElements = []; // 缓存样式表用于保活恢复
    this.execQueue = []; // 脚本执行队列（串行）
    this.lifecycles = lifecycles; // 保存生命周期配置
    this.plugins = getPlugins(plugins); // 初始化插件
    this.iframeAddEventListeners = options.iframeAddEventListeners; // 保存需要代理 addEventListener 的事件类型
    this.iframeOnEvents = options.iframeOnEvents; // 保存 onXXX 事件代理类型

    // 解析子应用 URL，提取路径、host、路由信息
    const { urlElement, appHostPath, appRoutePath } = appRouteParse(url);
    const { mainHostPath } = this.inject;

    // 创建 iframe 实例
    this.iframe = iframeGenerator(
      this, // 传入沙箱实例
      attrs, // iframe 属性
      mainHostPath, // 主应用host
      appHostPath, // 子应用host
      appRoutePath // 子应用路由路径
    );

    if (this.degrade) {
      // 降级模式（不使用 Proxy）
      const { proxyDocument, proxyLocation } = localGenerator(
        this.iframe,
        urlElement,
        mainHostPath,
        appHostPath
      );
      this.proxyDocument = proxyDocument; // 使用降级 document 代理
      this.proxyLocation = proxyLocation; // 使用降级 location 代理
    } else {
      // 非降级模式启用 Proxy 沙箱
      const { proxyWindow, proxyDocument, proxyLocation } = proxyGenerator(
        this.iframe,
        urlElement,
        mainHostPath,
        appHostPath
      );
      this.proxy = proxyWindow; // Proxy 的 window 对象
      this.proxyDocument = proxyDocument; // Proxy 的 document 对象
      this.proxyLocation = proxyLocation; // Proxy 的 location 对象
    }

    this.provide.location = this.proxyLocation; // 将 location 代理注入 provide

    addSandboxCacheWithWujie(this.id, this); // 将当前沙箱实例存入全局缓存
  }
}
