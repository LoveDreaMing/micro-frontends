import processTpl, { // 引入 HTML 解析和模板处理函数
  genLinkReplaceSymbol, // 生成 link 替换符号
  getInlineStyleReplaceSymbol, // 生成内联 style 替换符号
  ScriptObject, // 脚本类型定义
  ScriptBaseObject, // 脚本基础类型
  StyleObject, // 样式对象类型
} from "./template"; // 从 template 模块引入 HTML 模板处理逻辑

import { // 引入工具函数和常量
  defaultGetPublicPath, // 获取资源公共路径
  getInlineCode, // 获取内联代码内容
  requestIdleCallback, // 浏览器空闲时回调（类似 setTimeout，但更节能）
  error, // 错误日志函数
  compose, // 函数组合工具
  getCurUrl, // 获取当前 URL
} from "./utils"; // 工具方法集合

import { // 引入错误提示常量
  WUJIE_TIPS_NO_FETCH, // 不支持 fetch 提示
  WUJIE_TIPS_SCRIPT_ERROR_REQUESTED, // JS 加载失败提示
  WUJIE_TIPS_CSS_ERROR_REQUESTED, // CSS 加载失败提示
  WUJIE_TIPS_HTML_ERROR_REQUESTED, // HTML 加载失败提示
} from "./constant"; // 常量模块

import { getEffectLoaders, isMatchUrl } from "./plugin"; // 插件辅助函数：获取插件 loader、匹配 URL
import Wujie from "./sandbox"; // 沙箱类：负责运行子应用隔离逻辑
import { plugin, loadErrorHandler } from "./index"; // 类型定义：插件接口、加载错误处理

export type ScriptResultList = (ScriptBaseObject & { contentPromise: Promise<string> })[]; // JS 脚本加载结果类型
export type StyleResultList = { src: string; contentPromise: Promise<string>; ignore?: boolean }[]; // CSS 样式加载结果类型

interface htmlParseResult { // HTML 解析结果接口
  template: string; // 处理后的 HTML 模板
  assetPublicPath: string; // 公共路径（静态资源根路径）
  getExternalScripts(): ScriptResultList; // 获取 JS 资源
  getExternalStyleSheets(): StyleResultList; // 获取 CSS 资源
}

type ImportEntryOpts = { // importHTML 可选参数接口
  fetch?: typeof window.fetch; // 自定义 fetch 方法
  fiber?: boolean; // 是否启用 fiber 异步机制
  plugins?: Array<plugin>; // 插件集合
  loadError?: loadErrorHandler; // 错误回调函数
};

const styleCache = {}; // CSS 缓存对象，避免重复请求
const scriptCache = {}; // JS 缓存对象
const embedHTMLCache = {}; // HTML 缓存对象

if (!window.fetch) { // 浏览器不支持 fetch
  error(WUJIE_TIPS_NO_FETCH); // 输出错误日志
  throw new Error(); // 中断执行（框架依赖 fetch）
}

const defaultFetch = window.fetch.bind(window); // 绑定默认 fetch，防止 this 丢失

function defaultGetTemplate(tpl) { // 默认模板处理函数
  return tpl; // 原样返回 HTML 模板
}

/**
 * 处理 CSS 资源，执行插件 cssLoader 并将其内联到模板中
 */
export async function processCssLoader(
  sandbox: Wujie, // 当前沙箱实例
  template: string, // 子应用 HTML 模板
  getExternalStyleSheets: () => StyleResultList // 提供获取 CSS 列表的函数
): Promise<string> {
  const curUrl = getCurUrl(sandbox.proxyLocation); // 获取当前沙箱 URL
  const composeCssLoader = compose(sandbox.plugins.map((plugin) => plugin.cssLoader)); // 将所有插件的 cssLoader 组合成一个函数
  const processedCssList: StyleResultList = getExternalStyleSheets().map(({ src, ignore, contentPromise }) => ({ // 遍历 CSS 列表
    src,
    ignore,
    contentPromise: contentPromise.then((content) => composeCssLoader(content, src, curUrl)), // 异步执行插件处理
  }));
  const embedHTML = await getEmbedHTML(template, processedCssList); // 将 CSS 替换为内联样式
  return sandbox.replace ? sandbox.replace(embedHTML) : embedHTML; // 若沙箱定义了 replace 钩子，则使用它处理最终 HTML
}

/**
 * 将外部 CSS link 转换为内联 style，提升性能
 */
async function getEmbedHTML(template, styleResultList: StyleResultList): Promise<string> {
  let embedHTML = template; // 拷贝模板

  return Promise.all(
    styleResultList.map((styleResult, index) =>
      styleResult.contentPromise.then((content) => { // 等待每个 CSS 内容加载完成
        if (styleResult.src) { // 外部 CSS
          embedHTML = embedHTML.replace(
            genLinkReplaceSymbol(styleResult.src), // 用生成的替换标识符找到原始 <link>
            styleResult.ignore
              ? `<link href="${styleResult.src}" rel="stylesheet" type="text/css">` // 如果被忽略则保留原始 link
              : `<style>/* ${styleResult.src} */${content}</style>` // 否则内联化为 style
          );
        } else if (content) { // 内联 CSS 内容
          embedHTML = embedHTML.replace(
            getInlineStyleReplaceSymbol(index), // 匹配内联替换符号
            `<style>/* inline-style-${index} */${content}</style>` // 写入内联样式
          );
        }
      })
    )
  ).then(() => embedHTML); // 返回最终拼接后的 HTML
}

const isInlineCode = (code) => code.startsWith("<"); // 判断是否为内联 HTML 代码

/**
 * 通用资源获取函数，支持缓存和错误处理
 */
const fetchAssets = (
  src: string, // 资源地址
  cache: Object, // 缓存容器
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>, // fetch 方法
  cssFlag?: boolean, // 是否为 CSS 资源
  loadError?: loadErrorHandler // 错误回调
) =>
  cache[src] || // 如果缓存中存在直接返回
  (cache[src] = fetch(src) // 否则请求资源
    .then((response) => {
      if (response.status >= 400) { // HTTP 错误状态
        cache[src] = null; // 清除缓存
        if (cssFlag) { // CSS 错误日志
          error(WUJIE_TIPS_CSS_ERROR_REQUESTED, { src, response });
          loadError?.(src, new Error(WUJIE_TIPS_CSS_ERROR_REQUESTED));
          return "";
        } else { // JS 错误日志
          error(WUJIE_TIPS_SCRIPT_ERROR_REQUESTED, { src, response });
          loadError?.(src, new Error(WUJIE_TIPS_SCRIPT_ERROR_REQUESTED));
          throw new Error(WUJIE_TIPS_SCRIPT_ERROR_REQUESTED); // 抛出异常中断
        }
      }
      return response.text(); // 返回资源文本内容
    })
    .catch((e) => { // 捕获网络或解析错误
      cache[src] = null; // 清缓存
      if (cssFlag) {
        error(WUJIE_TIPS_CSS_ERROR_REQUESTED, src);
        loadError?.(src, e);
        return "";
      } else {
        error(WUJIE_TIPS_SCRIPT_ERROR_REQUESTED, src);
        loadError?.(src, e);
        return "";
      }
    }));

/**
 * 预获取 CSS 样式表（用于 preload）
 */
export function getExternalStyleSheets(
  styles: StyleObject[], // 样式对象数组
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> = defaultFetch, // fetch 实例
  loadError: loadErrorHandler // 错误回调
): StyleResultList {
  return styles.map(({ src, content, ignore }) => {
    if (content) { // 已有内容（内联样式）
      return { src: "", contentPromise: Promise.resolve(content) };
    } else if (isInlineCode(src)) { // 内联 <style> 块
      return { src: "", contentPromise: Promise.resolve(getInlineCode(src)) };
    } else { // 外部样式链接
      return {
        src,
        ignore,
        contentPromise: ignore ? Promise.resolve("") : fetchAssets(src, styleCache, fetch, true, loadError), // 异步获取
      };
    }
  });
}

/**
 * 预获取 JS 脚本（支持 async / defer / module）
 */
export function getExternalScripts(
  scripts: ScriptObject[],
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> = defaultFetch,
  loadError: loadErrorHandler,
  fiber: boolean // 是否启用 fiber 异步机制（利用 requestIdleCallback）
): ScriptResultList {
  return scripts.map((script) => {
    const { src, async, defer, module, ignore } = script; // 解构属性
    let contentPromise = null;
    if ((async || defer) && src && !module) { // async 或 defer 且非 module
      contentPromise = new Promise((resolve, reject) =>
        fiber
          ? requestIdleCallback(() => fetchAssets(src, scriptCache, fetch, false, loadError).then(resolve, reject)) // 在空闲时加载
          : fetchAssets(src, scriptCache, fetch, false, loadError).then(resolve, reject) // 立即加载
      );
    } else if ((module && src) || ignore) { // module 模块或忽略的脚本
      contentPromise = Promise.resolve("");
    } else if (!src) { // 内联脚本
      contentPromise = Promise.resolve(script.content);
    } else { // 普通外链 script
      contentPromise = fetchAssets(src, scriptCache, fetch, false, loadError);
    }
    if (module && !async) script.defer = true; // module 默认使用 defer
    return { ...script, contentPromise }; // 返回包含 Promise 的脚本对象
  });
}

/**
 * 核心函数：importHTML
 * 负责加载、解析并封装 HTML 为结构化结果
 */
export default function importHTML(params: {
  url: string; // 入口 URL
  html?: string; // 可选传入 HTML
  opts: ImportEntryOpts; // 配置项
}): Promise<htmlParseResult> {
  const { url, opts, html } = params;
  const fetch = opts.fetch ?? defaultFetch; // 自定义 fetch
  const fiber = opts.fiber ?? true; // 默认启用 fiber
  const { plugins, loadError } = opts;
  const htmlLoader = plugins ? compose(plugins.map((plugin) => plugin.htmlLoader)) : defaultGetTemplate; // 组合 HTML loader 插件
  const jsExcludes = getEffectLoaders("jsExcludes", plugins); // JS 排除规则
  const cssExcludes = getEffectLoaders("cssExcludes", plugins); // CSS 排除规则
  const jsIgnores = getEffectLoaders("jsIgnores", plugins); // JS 忽略规则
  const cssIgnores = getEffectLoaders("cssIgnores", plugins); // CSS 忽略规则
  const getPublicPath = defaultGetPublicPath; // 公共路径解析方法

  const getHtmlParseResult = (url, html, htmlLoader) =>
    (html
      ? Promise.resolve(html) // 若直接传入 HTML
      : fetch(url)
          .then((response) => {
            if (response.status >= 400) {
              error(WUJIE_TIPS_HTML_ERROR_REQUESTED, { url, response });
              loadError?.(url, new Error(WUJIE_TIPS_HTML_ERROR_REQUESTED));
              return "";
            }
            return response.text();
          })
          .catch((e) => {
            embedHTMLCache[url] = null; // 请求失败清缓存
            loadError?.(url, e);
            return Promise.reject(e);
          })
    ).then((html) => {
      const assetPublicPath = getPublicPath(url); // 获取公共路径
      const { template, scripts, styles } = processTpl(htmlLoader(html), assetPublicPath); // 使用模板解析器提取资源
      return {
        template: template,
        assetPublicPath,
        getExternalScripts: () =>
          getExternalScripts(
            scripts
              .filter((script) => !script.src || !isMatchUrl(script.src, jsExcludes)) // 过滤排除
              .map((script) => ({ ...script, ignore: script.src && isMatchUrl(script.src, jsIgnores) })), // 标记忽略项
            fetch,
            loadError,
            fiber
          ),
        getExternalStyleSheets: () =>
          getExternalStyleSheets(
            styles
              .filter((style) => !style.src || !isMatchUrl(style.src, cssExcludes))
              .map((style) => ({ ...style, ignore: style.src && isMatchUrl(style.src, cssIgnores) })),
            fetch,
            loadError
          ),
      };
    });

  if (opts?.plugins.some((plugin) => plugin.htmlLoader)) { // 存在 htmlLoader 插件时不走缓存
    return getHtmlParseResult(url, html, htmlLoader);
  } else { // 否则使用缓存
    return embedHTMLCache[url] || (embedHTMLCache[url] = getHtmlParseResult(url, html, htmlLoader));
  }
}
