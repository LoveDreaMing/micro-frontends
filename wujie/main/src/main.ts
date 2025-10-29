import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
// import { add } from 'common';
import Wujie from 'wujie-vue3';
import router from './router/index.ts';

console.log('主应用lodash', window._.join(['a', 'b'], '~'));

const { bus } = Wujie;
bus.$on('jump', (path: string) => {
  router.push(path);
});

window.a = '666'; // 设置父应用全局变量

createApp(App).use(router).use(Wujie).mount('#app');
