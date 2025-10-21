import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import Layout from '@/views/Layout.vue';
import List from '@/components/List.vue';
import Detail from '@/components/Detail.vue';

const routes = [
  {
    path: '/',
    redirect: '/list',
    component: Layout,
    children: [
      {
        path: '/list',
        name: 'list',
        component: List,
        meta: { title: '列表' }
      },
      {
        path: '/detail',
        name: 'detail',
        component: Detail,
        meta: { title: '详情' }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHashHistory('/sub-vue'),
  routes
});

export default router;
