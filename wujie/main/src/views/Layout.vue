<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const router = useRouter();
const route = useRoute();

const apps = [
  {
    path: '/sub-react',
    label: '子应用-react'
  },
  {
    path: '/sub-vue',
    label: '子应用-vue'
  }
];

const breadcrumb = computed(() => {
  return route.meta.title || '首页';
});

const handleMenuClick = (path: string) => {
  router.push(path);
};
</script>

<template>
  <div class="app-wrap">
    <aside class="sidebar">
      <div class="logo">无界</div>
      <nav class="menu">
        <a
          class="menu-item"
          :class="{ active: item.path === route.path }"
          v-for="(item, index) in apps"
          :key="index"
          @click="handleMenuClick(item.path)"
          >{{ item.label }}</a
        >
      </nav>
    </aside>
    <div class="main-area">
      <header class="header">
        <div class="header-left">
          <h1 class="title">头部</h1>
        </div>
        <div class="header-right">
          <div class="user">用户名</div>
        </div>
      </header>
      <section class="content">
        <div class="breadcrumb">{{ breadcrumb }}</div>
        <div class="view">
          <!-- 主路由视图占位 -->
          <router-view />
        </div>
      </section>
      <footer class="footer">© 2025 Company. All rights reserved.</footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 根容器（父级包裹子级） */
.app-wrap {
  height: 100vh;
  display: flex;
  background: #f5f7fa;
  color: #333;
  overflow: hidden;

  /* 侧边栏 */
  .sidebar {
    width: 150px;
    background: #2d3a4b;
    color: #fff;
    display: flex;
    flex-direction: column;
    transition: width 0.2s ease;
    min-width: 150px;

    .logo {
      padding: 20px;
      font-weight: 700;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .menu {
      padding: 12px;
      flex: 1;

      .menu-item {
        display: block;
        padding: 10px 12px;
        color: #d7e0ea;
        border-radius: 4px;
        margin-bottom: 8px;
        text-decoration: none;
        cursor: pointer;
        &.active {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
      }

      .menu-item:hover {
        background: rgba(255, 255, 255, 0.04);
      }
    }
  }

  /* 主区域 */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;

    .header {
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      background: #fff;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);

      .header-left {
        display: flex;
        align-items: center;

        .title {
          margin: 0;
          font-size: 16px;
        }
      }

      .header-right {
        display: flex;
        align-items: center;

        .user {
          padding: 6px 10px;
          background: #f0f3f7;
          border-radius: 4px;
        }
      }
    }

    .content {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      .breadcrumb {
        margin-bottom: 12px;
        color: #7b8a95;
      }

      .view {
        background: #fff;
        padding: 16px;
        border-radius: 6px;
        flex: 1;
        overflow: auto;
      }
    }

    .footer {
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9aa6b0;
      font-size: 12px;
      background: #fff;
      border-top: 1px solid rgba(0, 0, 0, 0.04);
    }
  }
}
</style>
