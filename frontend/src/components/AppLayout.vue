<script setup lang="ts">
import { NLayout, NLayoutHeader, NSpace, NButton, NText, NTag } from 'naive-ui';
import { RouterLink, useRoute } from 'vue-router';
import { computed } from 'vue';
import { useConfigStore } from '@/stores/config';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const configStore = useConfigStore();
const sessionStore = useSessionStore();
const active = computed(() => route.name as string);

// Show the runtime model of the active session (from the init event),
// not the --model override (which may be empty while the real model is glm-5.2).
const displayModel = computed(() => {
  const cur = sessionStore.currentSessionId;
  if (cur && sessionStore.modelBySession[cur]) return sessionStore.modelBySession[cur];
  return configStore.model || '';
});
</script>

<template>
  <NLayout position="absolute" style="height: 100vh">
    <NLayoutHeader bordered style="height: 48px; padding: 0 20px; display: flex; align-items: center;">
      <div class="logo">
        <span class="logo-mark">⚡</span>
        <NText strong>Claude Code WebUI</NText>
      </div>
      <NSpace :size="4" align="center" style="margin-left: 32px;">
        <RouterLink to="/">
          <NButton :type="active === 'home' ? 'primary' : 'default'" size="small" quaternary>首页</NButton>
        </RouterLink>
        <RouterLink to="/settings">
          <NButton :type="active === 'settings' ? 'primary' : 'default'" size="small" quaternary>设置</NButton>
        </RouterLink>
        <RouterLink to="/logs">
          <NButton :type="active === 'logs' ? 'primary' : 'default'" size="small" quaternary>日志</NButton>
        </RouterLink>
      </NSpace>
      <div class="header-right">
        <NTag v-if="displayModel" size="small" type="warning" round>
          模型: {{ displayModel }}
        </NTag>
        <NTag v-else size="small" round>模型: 未连接</NTag>
      </div>
    </NLayoutHeader>
    <div class="content">
      <slot />
    </div>
  </NLayout>
</template>

<style scoped>
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-mark {
  font-size: 18px;
}
.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.content {
  height: calc(100vh - 48px);
  overflow: hidden;
}
</style>
