// 私有元素属性
export const WUJIE_APP_ID = "data-wujie-id"; // 子应用 webcomponent 上保存 id 的自定义数据属性名
export const WUJIE_SCRIPT_ID = "data-wujie-script-id"; // 子应用注入脚本时用到的标识属性名
export const WUJIE_DATA_FLAG = "data-wujie-Flag"; // 子应用内部标记使用的通用数据属性名
export const CONTAINER_POSITION_DATA_FLAG = "data-container-position-flag"; // 容器定位相关的标记属性名
export const CONTAINER_OVERFLOW_DATA_FLAG = "data-container-overflow-flag"; // 容器 overflow 状态标记属性名
export const LOADING_DATA_FLAG = "data-loading-flag"; // loading DOM 使用的标记属性名
export const WUJIE_DATA_ATTACH_CSS_FLAG = "data-wujie-attach-css-flag"; // 标记样式是否已被附加的属性名

// 需要使用的某些固定变量
export const WUJIE_IFRAME_CLASS = "wujie_iframe"; // iframe 的统一 class 名，方便样式或选择器定位
export const WUJIE_ALL_EVENT = "_wujie_all_event"; // 全量事件存储或键名（用于事件劫持/记录）
export const WUJIE_SHADE_STYLE =
  "position: fixed; z-index: 2147483647; visibility: hidden; inset: 0px; backface-visibility: hidden;"; // 遮罩层默认内联样式（高 z-index、不可视、覆盖全屏）
export const WUJIE_LOADING_STYLE =
  "position: absolute; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; z-index:1;"; // loading 容器默认样式（居中显示、覆盖父级尺寸）

export const WUJIE_LOADING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="30px" viewBox="0 0 24 30">
<rect x="0" y="13" width="4" height="5" fill="#909090">
  <animate attributeName="height" attributeType="XML" values="5;21;5" begin="0s" dur="0.6s" repeatCount="indefinite"></animate>
  <animate attributeName="y" attributeType="XML" values="13; 5; 13" begin="0s" dur="0.6s" repeatCount="indefinite"></animate>
</rect>
<rect x="10" y="13" width="4" height="5" fill="#909090">
  <animate attributeName="height" attributeType="XML" values="5;21;5" begin="0.15s" dur="0.6s" repeatCount="indefinite"></animate>
  <animate attributeName="y" attributeType="XML" values="13; 5; 13" begin="0.15s" dur="0.6s" repeatCount="indefinite"></animate>
</rect>
<rect x="20" y="13" width="4" height="5" fill="#909090">
  <animate attributeName="height" attributeType="XML" values="5;21;5" begin="0.3s" dur="0.6s" repeatCount="indefinite"></animate>
  <animate attributeName="y" attributeType="XML" values="13; 5; 13" begin="0.3s" dur="0.6s" repeatCount="indefinite"></animate>
</rect>
</svg>`; // 默认 loading 的 svg 字符串

// 提醒类
export const WUJIE_TIPS_NO_URL = "url参数为空"; // 提示：未提供 url 参数
export const WUJIE_TIPS_RELOAD_DISABLED = "子应用调用reload无法生效"; // 提示：子应用中调用 reload 无效（被拦截或无权限）
export const WUJIE_TIPS_STOP_APP = "此报错可以忽略，iframe主动中断主应用代码在子应用运行"; // 提示：iframe 主动中断主应用代码（可忽略）
export const WUJIE_TIPS_STOP_APP_DETAIL = WUJIE_TIPS_STOP_APP + "，详见：https://github.com/Tencent/wujie/issues/54"; // 上面提示的详细说明（含链接）
export const WUJIE_TIPS_NO_SUBJECT = "事件订阅数量为空"; // 提示：事件总线或订阅者为空
export const WUJIE_TIPS_NO_FETCH = "window上不存在fetch属性，需要自行polyfill"; // 提示：当前环境无 fetch 需要 polyfill
export const WUJIE_TIPS_NOT_SUPPORTED = "当前浏览器不支持无界，子应用将采用iframe方式渲染"; // 提示：浏览器不支持高级功能，使用降级 iframe 方案
export const WUJIE_TIPS_SCRIPT_ERROR_REQUESTED = "脚本请求出现错误"; // 提示：请求脚本时发生错误
export const WUJIE_TIPS_CSS_ERROR_REQUESTED = "样式请求出现错误"; // 提示：请求 CSS 时发生错误
export const WUJIE_TIPS_HTML_ERROR_REQUESTED = "html请求出现错误"; // 提示：请求 HTML 时发生错误
export const WUJIE_TIPS_REPEAT_RENDER = "无界组件短时间重复渲染了两次，可能存在性能问题请检查代码"; // 提示：组件短时间重复渲染的警告（性能隐患）
export const WUJIE_TIPS_NO_SCRIPT = "目标Script尚未准备好或已经被移除"; // 提示：目标 script 未准备好或已被移除
export const WUJIE_TIPS_GET_ELEMENT_BY_ID =
  "不支持document.getElementById()传入特殊字符，请参考document.querySelector文档"; // 提示：不支持带特殊字符的 getElementById 使用，建议使用 querySelector
