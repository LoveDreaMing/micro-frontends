<template>
  <WujieVue
    name="sub-react"
    url="http://localhost:5174/sub-react/"
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
  console.log('sub-react beforeLoad');
};
const beforeMount = () => {
  console.log('sub-react beforeMount');
};
const afterMount = () => {
  console.log('sub-react afterMount');
};
const beforeUnmount = () => {
  console.log('sub-react beforeUnmount');
};
const afterUnmount = () => {
  console.log('sub-react afterUnmount');
};
</script>
