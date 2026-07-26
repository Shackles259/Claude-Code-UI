<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { NButton, NText } from 'naive-ui';

const route = useRoute();
const active = computed(() => route.name as string);
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="logo">
        <span class="logo-mark" aria-hidden="true"></span>
        <NText strong>Claude Code</NText>
      </RouterLink>
      <nav class="nav">
        <RouterLink to="/">
          <NButton :type="active === 'home' ? 'primary' : 'default'" size="tiny" quaternary>
            项目
          </NButton>
        </RouterLink>
        <RouterLink to="/settings">
          <NButton :type="active === 'settings' ? 'primary' : 'default'" size="tiny" quaternary>
            设置
          </NButton>
        </RouterLink>
        <RouterLink to="/logs">
          <NButton :type="active === 'logs' ? 'primary' : 'default'" size="tiny" quaternary>
            日志
          </NButton>
        </RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}
.app-header {
  height: var(--header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  gap: 20px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
}
.logo-mark {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: linear-gradient(135deg, var(--accent), #ea580c);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}
.nav {
  display: flex;
  align-items: center;
  gap: 2px;
}
.app-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
