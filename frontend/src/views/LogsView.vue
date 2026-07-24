<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import {
  NCard, NSpace, NButton, NSelect, NCode, NScrollbar, NTag, NPopconfirm, useMessage,
} from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import { api } from '@/api';

const message = useMessage();
const logs = ref<Array<{ name: string; path: string; size: number }>>([]);
const current = ref('server');
const content = ref('');
const lines = ref(500);
const autoRefresh = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const lineOptions = [
  { label: '100 行', value: 100 },
  { label: '500 行', value: 500 },
  { label: '2000 行', value: 2000 },
];

onMounted(async () => {
  await loadList();
  await loadContent();
});

async function loadList(): Promise<void> {
  const res = await api.listLogs();
  logs.value = res.logs;
}

async function loadContent(): Promise<void> {
  try {
    const res = await api.getLog(current.value, lines.value);
    content.value = res.content;
  } catch (err) {
    message.error(String(err));
  }
}

async function clearLog(): Promise<void> {
  await api.clearLog(current.value);
  content.value = '';
  message.success('日志已清空');
}

function toggleAutoRefresh(v: boolean): void {
  autoRefresh.value = v;
  if (timer) { clearInterval(timer); timer = null; }
  if (v) {
    timer = setInterval(() => void loadContent(), 2000);
  }
}

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <AppLayout>
    <div class="logs">
      <div class="logs-header">
        <h2>日志</h2>
        <NSpace align="center" :size="12">
          <NSelect
            v-model:value="current"
            :options="logs.map(l => ({ label: `${l.name} (${sizeText(l.size)})`, value: l.name }))"
            style="width: 240px;"
            @update:value="loadContent"
          />
          <NSelect v-model:value="lines" :options="lineOptions" style="width: 120px;" @update:value="loadContent" />
          <NButton size="small" @click="loadContent">刷新</NButton>
          <NPopconfirm @positive-click="clearLog">
            <template #trigger>
              <NButton size="small" type="error" ghost>清空</NButton>
            </template>
            确认清空当前日志文件？
          </NPopconfirm>
          <NSpace align="center" :size="4">
            <NTag size="small" :type="autoRefresh ? 'success' : 'default'">自动刷新</NTag>
            <NButton size="small" quaternary @click="toggleAutoRefresh(!autoRefresh)">
              {{ autoRefresh ? '停止' : '开启' }}
            </NButton>
          </NSpace>
        </NSpace>
      </div>
      <NCard style="height: calc(100% - 100px);">
        <NScrollbar style="height: 100%;">
          <NCode :code="content || '(空)'" language="bash" word-wrap show-line-numbers />
        </NScrollbar>
      </NCard>
    </div>
  </AppLayout>
</template>

<style scoped>
.logs {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
}
.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.logs-header h2 {
  margin: 0;
}
</style>
