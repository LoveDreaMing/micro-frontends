import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
// import { add } from 'common';
import router from './router/index';

console.log('父应用全局变量', window.parent?.a);

console.log('子应用lodash', window._.join(['c', 'd'], '~'));

window.b = '777'; // 设置vue子应用全局变量

if (window.__POWERED_BY_WUJIE__) {
  let app: ReturnType<typeof createApp>;
  window.__WUJIE_MOUNT = () => {
    app = createApp(App);
    app.use(router).mount('#app');
  };
  window.__WUJIE_UNMOUNT = () => {
    app.unmount();
  };
} else {
  createApp(App).use(router).mount('#app');
}
