<template>
  <WujieVue
    name="sub-vue"
    url="http://localhost:5175/"
    :props="{ jump }"
    :sync="true"
    :beforeLoad="beforeLoad"
    :beforeMount="beforeMount"
    :afterMount="afterMount"
    :beforeUnmount="beforeUnmount"
    :afterUnmount="afterUnmount"
    :plugins="[
      {
        jsExcludes: [
          'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js'
        ],
        jsBeforeLoaders: [{ content: 'window._ = window.parent._' }]
      }
    ]"
  />
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
const jump = (path: string) => {
  router.push(path);
};

const beforeLoad = () => {
  console.log('sub-vue beforeLoad');
};
const beforeMount = () => {
  console.log('sub-vue beforeMount');
};
const afterMount = () => {
  console.log('sub-vue afterMount');
  console.log(
    'vue子应用全局变量',
    (
      window.document.querySelector(
        "iframe[name='sub-vue']"
      ) as HTMLIFrameElement
    )?.contentWindow?.b
  );
};
const beforeUnmount = () => {
  console.log('sub-vue beforeUnmount');
};
const afterUnmount = () => {
  console.log('sub-vue afterUnmount');
};
</script>
