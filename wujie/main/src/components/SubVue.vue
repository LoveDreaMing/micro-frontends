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
};
const beforeUnmount = () => {
  console.log('sub-vue beforeUnmount');
};
const afterUnmount = () => {
  console.log('sub-vue afterUnmount');
};
</script>
