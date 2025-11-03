<template>
  <div class="layout">
    <div class="layout-title">子应用-vue</div>
    <div class="layout-tabs">
      <div
        v-for="(item, index) in paths"
        :key="index"
        class="layout-tab"
        :class="{ active: route.path === item.path }"
        @click="handleChangeTab(item)"
      >
        {{ item.name }}
      </div>
    </div>
    <div class="layout-view">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const { jump } = window.$wujie?.props || {};

const paths = [
  {
    name: '列表',
    path: '/list'
  },
  {
    name: '详情',
    path: '/detail'
  },
  {
    name: '跳转React子应用',
    path: '/sub-react'
  }
];

const handleChangeTab = (item: { name: string; path: string }) => {
  if (item.path === '/sub-react') {
    // jump(item.path); // 方式一
    window.$wujie?.bus.$emit('jump', item.path); // 方式二
  } else {
    router.push(item.path);
  }
};
</script>

<style scoped lang="scss">
.layout {
  padding: 20px;
  background-color: #f0f0f0;
  .layout-title {
    font-size: 24px;
    font-weight: bold;
    color: #333;
  }
  .layout-tabs {
    margin-top: 20px;
    display: flex;
    .layout-tab {
      margin: 0 10px;
      cursor: pointer;
      &.active {
        font-weight: bold;
        color: #007bff;
      }
    }
  }
  .layout-view {
    margin-top: 20px;
    padding: 10px;
    background-color: #fff;
    border-radius: 8px;
  }
}
</style>
