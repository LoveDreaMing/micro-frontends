import { plugin, ScriptObjectLoader } from './index'; // 导入插件类型和 ScriptObjectLoader 类型
import { StyleObject } from './template'; // 导入样式对象类型
import { compose, getAbsolutePath } from './utils'; // 导入函数组合工具和路径处理工具

interface loaderOption {
  plugins: Array<plugin>; // 插件数组
  replace: (code: string) => string; // 可选代码替换函数
}

/**
 * 获取柯里化 cssLoader
 */
export function getCssLoader({ plugins, replace }: loaderOption) {
  // 返回柯里化函数，接收 code、src、base
  return (code: string, src: string = '', base: string): string =>
    compose(plugins.map((plugin) => plugin.cssLoader))(
      replace ? replace(code) : code, // 如果有 replace 函数，先处理 code
      src, // 原始 CSS 文件路径
      base // 基础路径
    );
}

/**
 * 获取柯里化 jsLoader
 */
export function getJsLoader({ plugins, replace }: loaderOption) {
  // 返回柯里化函数，接收 code、src、base
  return (code: string, src: string = '', base: string): string =>
    compose(plugins.map((plugin) => plugin.jsLoader))(
      replace ? replace(code) : code, // 如果有 replace 函数，先处理 code
      src, // 原始 JS 文件路径
      base // 基础路径
    );
}

/**
 * 获取预置插件
 */
type presetLoadersType =
  | 'cssBeforeLoaders'
  | 'cssAfterLoaders'
  | 'jsBeforeLoaders'
  | 'jsAfterLoaders'; // 预置插件类型
export function getPresetLoaders(
  loaderType: presetLoadersType,
  plugins: Array<plugin>
): plugin[presetLoadersType] {
  // 获取插件中对应类型的 loader
  const loaders: (StyleObject | ScriptObjectLoader)[][] = plugins
    .map((plugin) => plugin[loaderType]) // 遍历插件获取 loaderType 对应的 loader
    .filter((loaders) => loaders?.length); // 过滤空数组或 undefined
  const res = loaders.reduce(
    (preLoaders, curLoaders) => preLoaders.concat(curLoaders),
    []
  ); // 扁平化 loader 数组
  return loaderType === 'cssBeforeLoaders' ? res.reverse() : res; // cssBeforeLoaders 需要倒序
}

/**
 * 获取影响插件
 */
type effectLoadersType =
  | 'jsExcludes'
  | 'cssExcludes'
  | 'jsIgnores'
  | 'cssIgnores'; // 影响 loader 类型
export function getEffectLoaders(
  loaderType: effectLoadersType,
  plugins: Array<plugin>
): plugin[effectLoadersType] {
  return plugins
    .map((plugin) => plugin[loaderType]) // 获取插件中对应类型 loader
    .filter((loaders) => loaders?.length) // 过滤空数组
    .reduce((preLoaders, curLoaders) => preLoaders.concat(curLoaders), []); // 扁平化合并所有 loader
}

// 判断 url 是否符合 loader 的规则
export function isMatchUrl(
  url: string,
  effectLoaders: plugin[effectLoadersType]
): boolean {
  return effectLoaders.some((loader) =>
    typeof loader === 'string' ? url === loader : loader.test(url)
  ); // 字符串直接匹配，正则使用 test
}

/**
 * 转换子应用 css 内的相对地址成绝对地址
 */
function cssRelativePathResolve(code: string, src: string, base: string) {
  const baseUrl = src ? getAbsolutePath(src, base) : base; // 计算基础路径
  /**
   * https://developer.mozilla.org/en-US/docs/Web/CSS/url
   *
   * 修正正则匹配 url(xxx) 内的路径，兼容嵌套括号及 base64 data URI
   */
  const urlReg = /url\((['"]?)((?:[^()]+|\((?:[^()]+|\([^()]*\))*\))*)(\1)\)/g; // 匹配 url(...) 内容

  return code.replace(urlReg, (_m, pre, url, post) => {
    const base64Regx = /^data:/; // data: 前缀正则
    const isBase64 = base64Regx.test(url); // 判断是否为 base64

    /** 如果是 base64，不替换路径 */
    if (isBase64) {
      return _m; // 原样返回
    }

    return `url(${pre}${getAbsolutePath(url, baseUrl)}${post})`; // 转换为绝对路径
  });
}

const defaultPlugin = {
  cssLoader: cssRelativePathResolve, // 默认 cssLoader
  // fix https://github.com/Tencent/wujie/issues/455
  cssBeforeLoaders: [{ content: 'html {view-transition-name: none;}' }] // 默认 cssBeforeLoaders
};

export function getPlugins(plugins: Array<plugin>): Array<plugin> {
  return Array.isArray(plugins) ? [defaultPlugin, ...plugins] : [defaultPlugin]; // 合并默认插件和用户插件
}

export default defaultPlugin; // 默认导出 defaultPlugin
