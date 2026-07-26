<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme, zhCN, dateZhCN } from 'naive-ui';
import { useConfigStore } from '@/stores/config';

const configStore = useConfigStore();

onMounted(async () => {
  await configStore.load();
});

const themeOverrides = computed(() => {
  const dark = configStore.theme === 'dark';
  return {
    common: {
      primaryColor: dark ? '#e8950a' : '#c2410c',
      primaryColorHover: dark ? '#f0a722' : '#9a3412',
      primaryColorPressed: dark ? '#c47a08' : '#7c2d12',
      primaryColorSuppl: dark ? '#e8950a' : '#c2410c',
      borderRadius: '6px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
      ...(dark
        ? {
            bodyColor: '#0f1115',
            cardColor: '#161a22',
            modalColor: '#161a22',
            popoverColor: '#1a1f28',
            inputColor: '#1a1f28',
            borderColor: '#2a2f3a',
            dividerColor: '#2a2f3a',
            textColorBase: '#e6e8ec',
            textColor1: '#e6e8ec',
            textColor2: '#c4c8d0',
            textColor3: '#8b929e',
          }
        : {}),
    },
  };
});

const naiveTheme = computed(() => (configStore.theme === 'dark' ? darkTheme : null));
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <NMessageProvider>
      <NDialogProvider>
        <RouterView />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
