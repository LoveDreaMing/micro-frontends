import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
// import { add } from 'common';
import Wujie from 'wujie-vue3';
import router from './router/index.ts';

const { bus } = Wujie;

bus.$on('jump', (path: string) => {
  router.push(path);
});

createApp(App).use(router).use(Wujie).mount('#app');
