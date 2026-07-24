<script setup lang="ts">
import { onMounted } from 'vue';
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme, zhCN, dateZhCN } from 'naive-ui';
import { useConfigStore } from '@/stores/config';
import { computed } from 'vue';

const configStore = useConfigStore();

onMounted(async () => {
  await configStore.load();
});

// Override Naive UI's theme object with our accent color.
const themeOverrides = computed(() => ({
  common: {
    primaryColor: '#d97706',
    primaryColorHover: '#b45309',
    primaryColorPressed: '#92400e',
    primaryColorSuppl: '#d97706',
  },
}));

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
