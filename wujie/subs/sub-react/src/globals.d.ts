export {}

declare global {
  interface WujieBus {
    $emit?: (event: string, ...args: any[]) => void;
    $on?: (event: string, handler: (...args: any[]) => void) => void;
    $off?: (event: string, handler?: (...args: any[]) => void) => void;
  }

  interface WujieWindow {
    bus?: WujieBus;
    props?: {
      jump?: (path: string) => void;
      [key: string]: any;
    };
  }

  interface Window {
    $wujie?: any;
    __POWERED_BY_WUJIE__?: boolean;
    __WUJIE_MOUNT?: () => void;
    __WUJIE_UNMOUNT?: () => void;
  }
}
