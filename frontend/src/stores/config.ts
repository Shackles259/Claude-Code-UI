import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api';
import type { AppConfig, Theme } from '@/types';

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig | null>(null);
  const loading = ref(false);

  const theme = computed<Theme>(() => config.value?.theme ?? 'dark');
  const permissionMode = computed(() => config.value?.permissionMode ?? 'acceptEdits');
  const model = computed(() => config.value?.model || '');

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await api.getConfig();
      config.value = res.config;
      applyTheme(res.config.theme);
      applyFontSize(res.config.fontSize);
    } finally {
      loading.value = false;
    }
  }

  async function save(patch: Partial<AppConfig>): Promise<void> {
    const res = await api.saveConfig(patch);
    config.value = res.config;
    applyTheme(res.config.theme);
    applyFontSize(res.config.fontSize);
  }

  const fontSize = computed(() => config.value?.fontSize ?? 14);

  function applyTheme(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
  }

  /** Push font-size into a CSS var so chat/markdown/monaco all follow it. */
  function applyFontSize(size: number): void {
    document.documentElement.style.setProperty('--app-font-size', `${size}px`);
  }

  return { config, loading, theme, permissionMode, model, fontSize, load, save, applyTheme, applyFontSize };
});
