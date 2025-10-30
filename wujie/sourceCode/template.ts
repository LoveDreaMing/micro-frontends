import { getInlineCode } from "./utils"; // 从 utils 中导入获取内联代码的函数

// 一系列正则定义，用于匹配 HTML 中的各种标签与属性
const ALL_SCRIPT_REGEX = /(<script[\s\S]*?>)[\s\S]*?<\/script>/gi; // 匹配所有 script 标签
const SCRIPT_TAG_REGEX = /<(script)\s+((?!type=('|")text\/ng-template\3).)*?>.*?<\/\1>/is; // 匹配普通 script 标签，排除 ng-template
const SCRIPT_SRC_REGEX = /.*\ssrc=('|")?([^>'"\s]+)/; // 匹配 script 的 src 属性
const SCRIPT_TYPE_REGEX = /.*\stype=('|")?([^>'"\s]+)/; // 匹配 script 的 type 属性
const SCRIPT_ENTRY_REGEX = /.*\sentry\s*.*/; // 匹配自定义 entry 属性（入口脚本）
const SCRIPT_ASYNC_REGEX = /.*\sasync\s*.*/; // 匹配 async 属性
const DEFER_ASYNC_REGEX = /.*\sdefer\s*.*/; // 匹配 defer 属性
const SCRIPT_NO_MODULE_REGEX = /.*\snomodule\s*.*/; // 匹配 nomodule 属性
const SCRIPT_MODULE_REGEX = /.*\stype=('|")?module('|")?\s*.*/; // 匹配 module 类型的 script
const LINK_TAG_REGEX = /<(link)\s+.*?>/gis; // 匹配 link 标签
const LINK_PRELOAD_OR_PREFETCH_REGEX = /\srel=('|")?(preload|prefetch|modulepreload)\1/; // 匹配 preload 或 prefetch 链接
const LINK_HREF_REGEX = /.*\shref=('|")?([^>'"\s]+)/; // 匹配 link 的 href 属性
const LINK_AS_FONT = /.*\sas=('|")?font\1.*/; // 匹配字体类型的 link
const STYLE_TAG_REGEX = /<style[^>]*>[\s\S]*?<\/style>/gi; // 匹配 style 标签
const STYLE_TYPE_REGEX = /\s+rel=('|")?stylesheet\1.*/; // 匹配样式类型 link
const STYLE_HREF_REGEX = /.*\shref=('|")?([^>'"\s]+)/; // 匹配样式 href
const HTML_COMMENT_REGEX = /<!--([\s\S]*?)-->/g; // 匹配 HTML 注释
const LINK_IGNORE_REGEX = /<link(\s+|\s+.+\s+)ignore(\s*|\s+.*|=.*)>/is; // 匹配带 ignore 属性的 link
const STYLE_IGNORE_REGEX = /<style(\s+|\s+.+\s+)ignore(\s*|\s+.*|=.*)>/is; // 匹配带 ignore 的 style
const SCRIPT_IGNORE_REGEX = /<script(\s+|\s+.+\s+)ignore(\s*|\s+.*|=.*)>/is; // 匹配带 ignore 的 script
const CROSS_ORIGIN_REGEX = /.*\scrossorigin=?('|")?(use-credentials|anonymous)?('|")?/i; // 匹配 crossorigin 属性

export type ScriptAttributes = {
  [key: string]: string | boolean; // 脚本属性类型声明，属性值可以是字符串或布尔
};

/** 脚本基础对象定义 */
export interface ScriptBaseObject {
  src?: string; // 脚本地址（内联为空）
  async?: boolean; // 是否为 async 执行
  defer?: boolean; // 是否为 defer 执行
  module?: boolean; // 是否为 ES module 模块
  crossorigin?: boolean; // 是否存在 crossorigin 属性
  crossoriginType?: "anonymous" | "use-credentials" | ""; // crossorigin 的类型
  attrs?: ScriptAttributes; // 脚本的所有属性键值
}

export type ScriptObject = ScriptBaseObject & {
  content?: string; // 内联脚本代码
  ignore?: boolean; // 是否忽略加载（由子应用自行请求）
  onload?: Function; // 子应用加载完毕的回调
};

/** 样式对象定义 */
export interface StyleObject {
  src?: string; // 样式文件路径（内联为空）
  content?: string; // 样式内容
  ignore?: boolean; // 是否忽略加载
}

/** 模板解析结果对象定义 */
export interface TemplateResult {
  template: string; // 模板 HTML（处理后的字符串）
  scripts: ScriptObject[]; // 收集到的脚本列表
  styles: StyleObject[]; // 收集到的样式列表
  entry: string | ScriptObject; // 入口脚本
}

// 工具函数：判断是否含有协议头
function hasProtocol(url) {
  return url.startsWith("//") || url.startsWith("http://") || url.startsWith("https://"); // 判断是否为完整 URL
}

// 拼接完整资源路径
function getEntirePath(path, baseURI) {
  return new URL(path, baseURI).toString(); // 将相对路径解析为绝对路径
}

// 校验 script 的 type 是否为合法 JavaScript 类型
function isValidJavaScriptType(type) {
  const handleTypes = [
    "text/javascript",
    "module",
    "application/javascript",
    "text/ecmascript",
    "application/ecmascript",
    "importmap",
  ];
  return !type || handleTypes.indexOf(type) !== -1; // 无 type 或 type 合法则返回 true
}

/**
 * 解析标签的属性
 * @param TagOuterHTML 标签完整 outerHTML
 * @returns 返回一个键值对对象，包含标签的所有属性
 */
export function parseTagAttributes(TagOuterHTML) {
  const pattern = /<[-\w]+\s+([^>]*)>/i; // 提取标签内属性部分
  const matches = pattern.exec(TagOuterHTML);

  if (!matches) {
    return {}; // 无匹配则返回空对象
  }

  const attributesString = matches[1]; // 提取属性字符串
  const attributesPattern = /([^\s=]+)\s*=\s*(['"])(.*?)\2/g; // 匹配 key="value"
  const attributesObject = {}; // 初始化结果对象

  let attributeMatches;
  while ((attributeMatches = attributesPattern.exec(attributesString)) !== null) {
    const attributeName = attributeMatches[1]; // 属性名
    const attributeValue = attributeMatches[3]; // 属性值
    attributesObject[attributeName] = attributeValue; // 添加到对象中
  }

  return attributesObject;
}

// 检测浏览器是否支持 <script type="module">
function isModuleScriptSupported() {
  const s = window.document.createElement("script"); // 创建 script 标签
  return "noModule" in s; // 支持 noModule 属性则认为支持 module
}

// 一系列生成替换占位符的函数
export const genLinkReplaceSymbol = (linkHref, preloadOrPrefetch = false) =>
  `<!-- ${preloadOrPrefetch ? "prefetch/preload/modulepreload" : ""} link ${linkHref} replaced by wujie -->`; // 替换 link 占位符

export const getInlineStyleReplaceSymbol = (index) => `<!-- inline-style-${index} replaced by wujie -->`; // 替换内联 style 占位符
export const genScriptReplaceSymbol = (scriptSrc, type = "") =>
  `<!-- ${type} script ${scriptSrc} replaced by wujie -->`; // 替换 script 占位符
export const inlineScriptReplaceSymbol = "<!-- inline scripts replaced by wujie -->"; // 内联 script 的统一占位符
export const genIgnoreAssetReplaceSymbol = (url) => `<!-- ignore asset ${url || "file"} replaced by wujie -->`; // 忽略资源占位符
export const genModuleScriptReplaceSymbol = (scriptSrc, moduleSupport) =>
  `<!-- ${moduleSupport ? "nomodule" : "module"} script ${scriptSrc} ignored by wujie -->`; // module 忽略占位符

/**
 * 核心函数：解析 HTML 模板，提取资源信息
 * @param tpl HTML 字符串
 * @param baseURI 当前页面的基础路径
 * @param postProcessTemplate 模板后处理钩子
 */
export default function processTpl(tpl: String, baseURI: String, postProcessTemplate?: Function): TemplateResult {
  const scripts: ScriptObject[] = []; // 存储所有脚本信息
  const styles: StyleObject[] = []; // 存储所有样式信息
  let entry = null; // 应用入口
  const moduleSupport = isModuleScriptSupported(); // 是否支持 module script

  const template = tpl
    .replace(HTML_COMMENT_REGEX, "") // 移除 HTML 注释
    .replace(LINK_TAG_REGEX, (match) => { // 处理 link 标签
      const styleType = !!match.match(STYLE_TYPE_REGEX); // 是否样式 link
      if (styleType) {
        const styleHref = match.match(STYLE_HREF_REGEX); // 提取 href
        const styleIgnore = match.match(LINK_IGNORE_REGEX); // 是否忽略
        if (styleHref) {
          const href = styleHref && styleHref[2]; // 获取样式路径
          let newHref = href;
          if (href && !hasProtocol(href)) {
            newHref = getEntirePath(href, baseURI); // 拼接绝对路径
          }
          if (styleIgnore) {
            return genIgnoreAssetReplaceSymbol(newHref); // 忽略样式则替换为注释
          }
          styles.push({ src: newHref }); // 收集样式资源
          return genLinkReplaceSymbol(newHref); // 替换 link 占位符
        }
      }
      // 处理 preload/prefetch link
      const preloadOrPrefetchType =
        match.match(LINK_PRELOAD_OR_PREFETCH_REGEX) && match.match(LINK_HREF_REGEX) && !match.match(LINK_AS_FONT);
      if (preloadOrPrefetchType) {
        const [, , linkHref] = match.match(LINK_HREF_REGEX);
        return genLinkReplaceSymbol(linkHref, true); // 替换预加载占位符
      }
      return match; // 其他情况保持原样
    })
    .replace(STYLE_TAG_REGEX, (match) => { // 处理内联 style
      if (STYLE_IGNORE_REGEX.test(match)) {
        return genIgnoreAssetReplaceSymbol("style file"); // 忽略 style
      } else {
        const code = getInlineCode(match); // 提取 style 内容
        styles.push({ src: "", content: code }); // 收集样式对象
        return getInlineStyleReplaceSymbol(styles.length - 1); // 替换为占位符
      }
    })
    .replace(ALL_SCRIPT_REGEX, (match, scriptTag) => { // 处理 script 标签
      const scriptIgnore = scriptTag.match(SCRIPT_IGNORE_REGEX); // 是否 ignore
      const isModuleScript = !!scriptTag.match(SCRIPT_MODULE_REGEX); // 是否 module
      const isCrossOriginScript = scriptTag.match(CROSS_ORIGIN_REGEX); // 是否跨域
      const crossOriginType = isCrossOriginScript?.[2] || ""; // 跨域类型
      const moduleScriptIgnore =
        (moduleSupport && !!scriptTag.match(SCRIPT_NO_MODULE_REGEX)) || (!moduleSupport && isModuleScript); // 是否忽略 module
      const matchedScriptTypeMatch = scriptTag.match(SCRIPT_TYPE_REGEX); // 提取 type
      const matchedScriptType = matchedScriptTypeMatch && matchedScriptTypeMatch[2];
      if (!isValidJavaScriptType(matchedScriptType)) {
        return match; // 非 JS 脚本直接跳过
      }

      // 处理外部 script
      if (SCRIPT_TAG_REGEX.test(match) && scriptTag.match(SCRIPT_SRC_REGEX)) {
        const matchedScriptEntry = scriptTag.match(SCRIPT_ENTRY_REGEX); // 是否 entry
        const matchedScriptSrcMatch = scriptTag.match(SCRIPT_SRC_REGEX);
        let matchedScriptSrc = matchedScriptSrcMatch && matchedScriptSrcMatch[2];
        if (entry && matchedScriptEntry) {
          throw new SyntaxError("You should not set multiply entry script!"); // 不允许多个入口
        } else {
          if (matchedScriptSrc && !hasProtocol(matchedScriptSrc)) {
            matchedScriptSrc = getEntirePath(matchedScriptSrc, baseURI); // 拼接完整路径
          }
          entry = entry || (matchedScriptEntry && matchedScriptSrc); // 标记入口
        }
        if (scriptIgnore) {
          return genIgnoreAssetReplaceSymbol(matchedScriptSrc || "js file"); // 忽略脚本
        }
        if (moduleScriptIgnore) {
          return genModuleScriptReplaceSymbol(matchedScriptSrc || "js file", moduleSupport); // 忽略 module
        }

        if (matchedScriptSrc) {
          const isAsyncScript = !!scriptTag.match(SCRIPT_ASYNC_REGEX); // 是否 async
          const isDeferScript = !!scriptTag.match(DEFER_ASYNC_REGEX); // 是否 defer
          scripts.push(
            isAsyncScript || isDeferScript
              ? {
                  async: isAsyncScript,
                  defer: isDeferScript,
                  src: matchedScriptSrc,
                  module: isModuleScript,
                  crossorigin: !!isCrossOriginScript,
                  crossoriginType: crossOriginType,
                  attrs: parseTagAttributes(match),
                }
              : {
                  src: matchedScriptSrc,
                  module: isModuleScript,
                  crossorigin: !!isCrossOriginScript,
                  crossoriginType: crossOriginType,
                  attrs: parseTagAttributes(match),
                }
          );
          return genScriptReplaceSymbol(
            matchedScriptSrc,
            (isAsyncScript && "async") || (isDeferScript && "defer") || ""
          ); // 替换 script 占位符
        }

        return match;
      } else {
        if (scriptIgnore) {
          return genIgnoreAssetReplaceSymbol("js file"); // 忽略内联 script
        }
        if (moduleScriptIgnore) {
          return genModuleScriptReplaceSymbol("js file", moduleSupport); // 忽略 module 内联
        }

        // 处理内联 script
        const code = getInlineCode(match); // 提取代码
        const isPureCommentBlock = code.split(/[\r\n]+/).every((line) => !line.trim() || line.trim().startsWith("//")); // 是否纯注释
        if (!isPureCommentBlock && code) {
          scripts.push({
            src: "",
            content: code,
            module: isModuleScript,
            crossorigin: !!isCrossOriginScript,
            crossoriginType: crossOriginType,
            attrs: parseTagAttributes(match),
          });
        }
        return inlineScriptReplaceSymbol; // 用占位符替换
      }
    });

  let tplResult = {
    template,
    scripts,
    styles,
    entry: entry || scripts[scripts.length - 1], // 若无显式 entry，则取最后一个 script
  };
  if (typeof postProcessTemplate === "function") {
    tplResult = postProcessTemplate(tplResult); // 可选后处理钩子
  }

  return tplResult; // 返回模板解析结果
}
