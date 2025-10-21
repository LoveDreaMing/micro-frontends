declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare interface Window {
  $wujie?: any;
  __WUJIE_EVENT__?: any;
  __POWERED_BY_WUJIE__?: boolean;
}