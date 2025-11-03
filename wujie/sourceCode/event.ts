import { warn, error } from './utils'; // 导入警告和错误处理工具函数 // utils
import { WUJIE_ALL_EVENT, WUJIE_TIPS_NO_SUBJECT } from './constant'; // 导入常量：全局事件名和提示信息 // constant

export type EventObj = { [event: string]: Array<Function> }; // 定义事件对象类型，每个事件对应一个函数数组 // EventObj

// 全部事件存储 map
// 除了挂载到 WuJie 实例上，还挂载到全局 __WUJIE_INJECT 变量上，防止重复创建 // 全局缓存
export const appEventObjMap = (() => {
  // 创建或复用全局事件对象 Map
  if (window.__WUJIE_INJECT?.appEventObjMap)
    return window.__WUJIE_INJECT.appEventObjMap; // 如果已经存在，直接返回
  else {
    const cacheMap = window.__POWERED_BY_WUJIE__ // 判断是否在 WuJie 子应用环境下
      ? window.__WUJIE.inject.appEventObjMap // 使用 WuJie 内部注入的事件 map
      : new Map<String, EventObj>(); // 否则新建 Map
    window.__WUJIE_INJECT = {
      ...window.__WUJIE_INJECT,
      appEventObjMap: cacheMap
    }; // 挂载到全局 __WUJIE_INJECT
    return cacheMap; // 返回事件 map
  }
})();

export class EventBus {
  // 事件总线类
  private id: string; // 当前子应用或实例的唯一 id
  private eventObj: EventObj; // 当前实例对应的事件对象

  constructor(id: string) {
    // 构造函数，接收 id
    this.id = id; // 保存 id
    this.$clear(); // 清空当前实例的所有事件
    if (!appEventObjMap.get(this.id)) {
      // 如果全局 map 中不存在该 id
      appEventObjMap.set(this.id, {}); // 初始化事件对象
    }
    this.eventObj = appEventObjMap.get(this.id); // 保存事件对象引用
  }

  // 监听事件
  public $on(event: string, fn: Function): EventBus {
    // 注册事件监听函数
    const cbs = this.eventObj[event]; // 获取当前事件的回调数组
    if (!cbs) {
      // 如果不存在
      this.eventObj[event] = [fn]; // 创建数组并添加函数
      return this; // 返回实例
    }
    if (!cbs.includes(fn)) cbs.push(fn); // 如果函数未注册，则添加
    return this; // 返回实例
  }

  /** 任何 $emit 都会导致监听函数触发，第一个参数为事件名，后续的参数为 $emit 的参数 */
  public $onAll(fn: (event: string, ...args: Array<any>) => any): EventBus {
    // 注册全局事件监听
    return this.$on(WUJIE_ALL_EVENT, fn); // 使用全局事件名
  }

  // 一次性监听事件
  public $once(event: string, fn: Function): void {
    // 注册只触发一次的事件
    const on = function (...args: Array<any>) {
      // 包装回调
      this.$off(event, on); // 触发一次后移除监听
      fn(...args); // 执行原始回调
    }.bind(this); // 绑定 this
    this.$on(event, on); // 注册包装后的回调
  }

  // 取消监听
  public $off(event: string, fn: Function): EventBus {
    // 移除事件监听
    const cbs = this.eventObj[event]; // 获取回调数组
    if (!event || !cbs || !cbs.length) {
      // 如果事件不存在或回调为空
      warn(`${event} ${WUJIE_TIPS_NO_SUBJECT}`); // 警告提示
      return this; // 返回实例
    }

    let cb; // 临时变量
    let i = cbs.length; // 从后向前遍历
    while (i--) {
      cb = cbs[i]; // 当前回调
      if (cb === fn) {
        // 找到匹配回调
        cbs.splice(i, 1); // 移除
        break; // 退出循环
      }
    }
    return this; // 返回实例
  }

  // 取消监听 $onAll
  public $offAll(fn: Function): EventBus {
    // 移除全局事件回调
    return this.$off(WUJIE_ALL_EVENT, fn); // 使用全局事件名
  }

  // 发送事件
  public $emit(event: string, ...args: Array<any>): EventBus {
    // 触发事件
    let cbs = []; // 存储当前事件回调
    let allCbs = []; // 存储全局事件回调

    appEventObjMap.forEach((eventObj) => {
      // 遍历全局事件 map
      if (eventObj[event]) cbs = cbs.concat(eventObj[event]); // 合并当前事件回调
      if (eventObj[WUJIE_ALL_EVENT])
        allCbs = allCbs.concat(eventObj[WUJIE_ALL_EVENT]); // 合并全局回调
    });

    if (!event || (cbs.length === 0 && allCbs.length === 0)) {
      // 如果事件不存在或没有回调
      warn(`${event} ${WUJIE_TIPS_NO_SUBJECT}`); // 警告提示
    } else {
      try {
        // 执行回调
        for (let i = 0, l = cbs.length; i < l; i++) cbs[i](...args); // 执行当前事件回调
        for (let i = 0, l = allCbs.length; i < l; i++)
          allCbs[i](event, ...args); // 执行全局回调
      } catch (e) {
        error(e); // 捕获错误并打印
      }
    }
    return this; // 返回实例
  }

  // 清空当前所有的监听事件
  public $clear(): EventBus {
    // 清空当前实例所有事件
    const eventObj = appEventObjMap.get(this.id) ?? {}; // 获取事件对象
    const events = Object.keys(eventObj); // 获取事件名列表
    events.forEach((event) => delete eventObj[event]); // 删除所有事件
    return this; // 返回实例
  }
}
