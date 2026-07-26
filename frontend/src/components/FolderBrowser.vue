<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NModal, NButton, NSpace, NInput, NSpin, NBreadcrumb, NBreadcrumbItem, NEmpty, useMessage,
} from 'naive-ui';
import { api } from '@/api';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{
  'update:show': [v: boolean];
  select: [path: string];
}>();

const message = useMessage();
const loading = ref(false);
const current = ref('');
const parent = ref<string | null>(null);
const dirs = ref<Array<{ name: string; path: string }>>([]);
const manualPath = ref('');

async function load(target?: string): Promise<void> {
  loading.value = true;
  try {
    const res = await api.browse(target);
    current.value = res.current;
    parent.value = res.parent;
    dirs.value = res.dirs;
    manualPath.value = res.current;
  } catch (err) {
    message.error(String(err));
  } finally {
    loading.value = false;
  }
}

watch(() => props.show, (v) => {
  if (v) load();
});

function enter(p: string): void {
  void load(p);
}

function goParent(): void {
  if (parent.value) void load(parent.value);
}

function selectCurrent(): void {
  if (current.value) {
    emit('select', current.value);
    emit('update:show', false);
  }
}

async function goManual(): Promise<void> {
  if (manualPath.value.trim()) {
    await load(manualPath.value.trim());
  }
}

/** Split absolute path into breadcrumb segments (POSIX + Windows). */
function crumbs(): Array<{ label: string; path: string }> {
  if (!current.value) return [];
  const raw = current.value.replace(/\\/g, '/');
  const isWin = /^[A-Za-z]:/.test(raw);
  const parts = raw.split('/').filter(Boolean);
  const out: Array<{ label: string; path: string }> = [];
  let acc = isWin ? '' : '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (isWin && i === 0) {
      acc = part + '/';
      out.push({ label: part, path: part + '\\' });
    } else if (isWin) {
      acc = acc.endsWith('/') ? acc + part : acc + '/' + part;
      out.push({ label: part, path: acc.replace(/\//g, '\\') });
    } else {
      acc = acc + '/' + part;
      out.push({ label: part, path: acc });
    }
  }
  return out;
}

function rootPath(): string {
  if (!current.value) return '/';
  const raw = current.value.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(raw)) {
    return raw.slice(0, 2) + '\\';
  }
  return '/';
}
</script>

<template>
  <NModal
    :show="show"
    @update:show="(v) => emit('update:show', v)"
    preset="card"
    title="选择文件夹"
    style="width: 640px;"
    :mask-closable="true"
  >
    <div class="path-bar">
      <NInput
        v-model:value="manualPath"
        size="small"
        placeholder="输入或粘贴路径，回车前往"
        @keydown.enter.prevent="goManual"
      />
      <NButton size="small" type="primary" @click="goManual">前往</NButton>
    </div>

    <NBreadcrumb v-if="current" class="breadcrumb">
      <NBreadcrumbItem @click="load(rootPath())">根目录</NBreadcrumbItem>
      <NBreadcrumbItem
        v-for="(c, i) in crumbs()"
        :key="i"
        @click="enter(c.path)"
      >
        {{ c.label }}
      </NBreadcrumbItem>
    </NBreadcrumb>

    <div class="browser-body">
      <NSpin v-if="loading" size="small" />
      <template v-else>
        <div v-if="parent" class="row parent" @click="goParent">
          <span class="icon">↑</span>
          <span class="name">上级目录</span>
        </div>
        <div
          v-for="d in dirs"
          :key="d.path"
          class="row"
          @click="enter(d.path)"
          @dblclick="enter(d.path)"
        >
          <span class="icon folder"></span>
          <span class="name">{{ d.name }}</span>
        </div>
        <NEmpty
          v-if="dirs.length === 0 && !parent"
          description="此目录为空"
          style="margin: 30px 0;"
        />
      </template>
    </div>

    <div class="footer">
      <NSpace justify="space-between" align="center" style="width: 100%;">
        <NInput :value="current" readonly size="small" style="flex: 1;" placeholder="当前选择的目录" />
        <NButton type="primary" :disabled="!current" @click="selectCurrent">
          打开此目录
        </NButton>
      </NSpace>
    </div>
  </NModal>
</template>

<style scoped>
.path-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.breadcrumb {
  margin-bottom: 8px;
  font-size: 12px;
}
.browser-body {
  height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px;
  background: var(--bg);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.row:hover {
  background: var(--bg-elevated);
}
.row.parent .name {
  color: var(--text-muted);
}
.icon {
  width: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  flex-shrink: 0;
}
.icon.folder {
  width: 12px;
  height: 10px;
  border: 1.5px solid var(--text-muted);
  border-radius: 2px;
  position: relative;
}
.icon.folder::before {
  content: '';
  position: absolute;
  top: -3px;
  left: 1px;
  width: 5px;
  height: 2px;
  background: var(--text-muted);
  border-radius: 1px 1px 0 0;
}
.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer {
  margin-top: 12px;
}
.footer :deep(.n-space) {
  flex-wrap: nowrap;
}
</style>
