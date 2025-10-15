import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { add } from 'common';

console.log(add(4, 5));

createApp(App).mount('#app');
