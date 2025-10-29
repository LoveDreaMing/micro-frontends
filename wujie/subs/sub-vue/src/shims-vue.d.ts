declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare interface Window {
  $wujie?: any;
  __POWERED_BY_WUJIE__?: boolean;
  __UNBOUND_APP__?: any;
  __WUJIE_MOUNT?: () => void;
  __WUJIE_UNMOUNT?: () => void;
  a: string;
  b: string;
  _: any;
}