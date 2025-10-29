import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import Layout from '@/views/Layout.vue';
import SubReact from '@/components/SubReact.vue';
import SubVue from '@/components/SubVue.vue';

const routes = [
  {
    path: '/',
    redirect: '/sub-react',
    component: Layout,
    children: [
      {
        path: '/sub-react',
        name: 'sub-react',
        component: SubReact,
        meta: { title: '子应用-react' }
      },
      {
        path: '/sub-vue',
        name: 'sub-vue',
        component: SubVue,
        meta: { title: '子应用-vue' }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
