<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  NSpace, NButton, NTag, NEmpty, NSpin, NInput, NList, NListItem, NThing,
  NText, NCode, NPopconfirm, NScrollbar, useMessage,
} from 'naive-ui';
import { api } from '@/api';
import type { GitStatus, GitLogEntry } from '@/types';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{
  openDiff: [file: string];
}>();

const message = useMessage();
const status = ref<GitStatus | null>(null);
const log = ref<GitLogEntry[]>([]);
const loading = ref(false);
const selectedFiles = ref<Set<string>>(new Set());
const commitMsg = ref('');
const committing = ref(false);
const tab = ref<'changes' | 'history'>('changes');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [s, l] = await Promise.all([
      api.gitStatus(props.projectId).catch(() => null),
      api.gitLog(props.projectId).catch(() => ({ log: [] })),
    ]);
    if (s) status.value = s.status;
    log.value = (l as { log: GitLogEntry[] }).log || [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.projectId, load, { immediate: true });

async function ensureRepo(): Promise<void> {
  try {
    await api.gitInit(props.projectId);
    message.success('已初始化 Git 仓库');
    await load();
  } catch (err) {
    message.error(String(err));
  }
}

function toggleFile(path: string): void {
  if (selectedFiles.value.has(path)) selectedFiles.value.delete(path);
  else selectedFiles.value.add(path);
  selectedFiles.value = new Set(selectedFiles.value);
}

function statusLabel(s: GitStatus['files'][number]): string {
  const { index, working } = s;
  const parts: string[] = [];
  if (index === '?') return '未跟踪';
  if (index !== ' ' && index !== '?') parts.push(index);
  if (working !== ' ') parts.push(working);
  return parts.join(' ') || '已暂存';
}

function statusType(s: GitStatus['files'][number]): 'default' | 'success' | 'warning' | 'error' {
  if (s.index === '?' || s.working === '?') return 'warning';
  if (s.index === 'D' || s.working === 'D') return 'error';
  if (s.index === 'A') return 'success';
  return 'default';
}

async function stageAll(): Promise<void> {
  try {
    await api.gitAdd(props.projectId, ['.']);
    message.success('已暂存全部');
    await load();
  } catch (err) {
    message.error(String(err));
  }
}

async function stageSelected(): Promise<void> {
  const files = Array.from(selectedFiles.value);
  if (!files.length) return;
  try {
    await api.gitAdd(props.projectId, files);
    message.success(`已暂存 ${files.length} 个文件`);
    selectedFiles.value = new Set();
    await load();
  } catch (err) {
    message.error(String(err));
  }
}

async function commit(): Promise<void> {
  if (!commitMsg.value.trim()) {
    message.warning('请输入提交信息');
    return;
  }
  committing.value = true;
  try {
    await api.gitCommit(props.projectId, commitMsg.value.trim());
    message.success('提交成功');
    commitMsg.value = '';
    await load();
  } catch (err) {
    message.error(String(err));
  } finally {
    committing.value = false;
  }
}

function openDiff(file: string): void {
  emit('openDiff', file);
}

function shortHash(h: string): string {
  return h.slice(0, 7);
}

function formatDate(d: string): string {
  try {
    return new Date(d).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return d;
  }
}
</script>

<template>
  <div class="git-panel">
    <NSpin v-if="loading" size="small" />
    <template v-else>
      <div v-if="!status?.isRepo" class="no-repo">
        <NEmpty description="此项目还不是 Git 仓库">
          <template #extra>
            <NButton size="small" type="primary" @click="ensureRepo">初始化仓库</NButton>
          </template>
        </NEmpty>
      </div>
      <template v-else>
        <div class="git-header">
          <NSpace align="center" :size="6">
            <NTag size="small" type="info" round>分支: {{ status.branch || '-' }}</NTag>
            <NTag v-if="status.ahead" size="tiny" type="success">↑{{ status.ahead }}</NTag>
            <NTag v-if="status.behind" size="tiny" type="warning">↓{{ status.behind }}</NTag>
          </NSpace>
          <NSpace :size="4">
            <NButton
              size="tiny"
              :type="tab === 'changes' ? 'primary' : 'default'"
              quaternary
              @click="tab = 'changes'"
            >变更 ({{ status.files.length }})</NButton>
            <NButton
              size="tiny"
              :type="tab === 'history' ? 'primary' : 'default'"
              quaternary
              @click="tab = 'history'"
            >历史</NButton>
          </NSpace>
        </div>

        <div v-if="tab === 'changes'" class="changes">
          <div v-if="status.clean" class="clean-hint">
            <NText depth="3">工作区干净，无变更</NText>
          </div>
          <template v-else>
            <div class="changes-actions">
              <NButton size="tiny" quaternary @click="stageSelected" :disabled="selectedFiles.size === 0">
                暂存所选 ({{ selectedFiles.size }})
              </NButton>
              <NButton size="tiny" quaternary @click="stageAll">全部暂存</NButton>
            </div>
            <NScrollbar style="flex: 1;">
              <NList hoverable clickable size="small">
                <NListItem v-for="f in status.files" :key="f.path" @click="openDiff(f.path)">
                  <template #suffix>
                    <input
                      type="checkbox"
                      :checked="selectedFiles.has(f.path)"
                      @click.stop
                      @change="toggleFile(f.path)"
                    />
                  </template>
                  <NThing>
                    <template #header>
                      <span class="file-path">{{ f.path }}</span>
                    </template>
                    <template #description>
                      <NTag :type="statusType(f)" size="tiny" round>{{ statusLabel(f) }}</NTag>
                    </template>
                  </NThing>
                </NListItem>
              </NList>
            </NScrollbar>
            <div class="commit-area">
              <NInput v-model:value="commitMsg" size="small" placeholder="提交信息..." />
              <NPopconfirm @positive-click="commit">
                <template #trigger>
                  <NButton size="small" type="primary" :loading="committing" :disabled="!commitMsg.trim()">
                    提交
                  </NButton>
                </template>
                确认提交？
              </NPopconfirm>
            </div>
          </template>
        </div>

        <div v-else class="history">
          <NScrollbar style="max-height: 100%;">
            <NList size="small">
              <NListItem v-for="entry in log" :key="entry.hash">
                <NThing>
                  <template #header>
                    <NText code style="font-size: 11px;">{{ shortHash(entry.hash) }}</NText>
                    <NText style="margin-left: 8px;">{{ entry.message }}</NText>
                  </template>
                  <template #description>
                    <NText depth="3" style="font-size: 11px;">
                      {{ entry.author }} · {{ formatDate(entry.date) }}
                    </NText>
                  </template>
                </NThing>
              </NListItem>
            </NList>
            <NEmpty v-if="log.length === 0" size="small" description="无提交历史" />
          </NScrollbar>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.git-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.git-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 6px;
}
.no-repo {
  padding: 40px 0;
}
.changes, .history {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.changes-actions {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.clean-hint {
  padding: 30px;
  text-align: center;
}
.file-path {
  font-size: 12px;
  word-break: break-all;
}
.commit-area {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
}
.commit-area :deep(.n-input) {
  flex: 1;
}
</style>
