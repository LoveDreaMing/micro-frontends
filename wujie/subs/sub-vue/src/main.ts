import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
// import { add } from 'common';
import router from './router/index';

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
