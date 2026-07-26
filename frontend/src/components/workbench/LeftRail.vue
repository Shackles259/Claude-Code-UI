<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NText, NEmpty, NInput, NPopconfirm, useMessage } from 'naive-ui';
import FileTree from '@/components/FileTree.vue';
import { useProjectStore } from '@/stores/project';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{
  projectId: string;
  sessionId: string | null;
  activeDiffFile?: string;
}>();

const emit = defineEmits<{
  'new-session': [];
  'switch-session': [id: string];
  'close-session': [id: string];
  'file-select': [path: string];
}>();

const message = useMessage();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();

const renamingId = ref<string | null>(null);
const renameValue = ref('');
const sessionsHeight = ref(48); // percent of left rail
const dragging = ref(false);

const projectSessions = computed(() =>
  sessionStore.sessions.filter((x) => x.projectId === props.projectId),
);

function formatTime(t: string): string {
  try {
    return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return t;
  }
}

function startRename(id: string, currentTitle: string): void {
  renamingId.value = id;
  renameValue.value = currentTitle;
}

async function commitRename(id: string): Promise<void> {
  const title = renameValue.value.trim();
  renamingId.value = null;
  if (!title) return;
  try {
    await sessionStore.renameSession(id, title);
    message.success('已重命名');
  } catch (err) {
    message.error(String(err));
  }
}

function cancelRename(): void {
  renamingId.value = null;
}

function onSplitDown(e: MouseEvent): void {
  e.preventDefault();
  dragging.value = true;
  const startY = e.clientY;
  const startPct = sessionsHeight.value;
  const rail = (e.target as HTMLElement).closest('.left-rail') as HTMLElement | null;
  if (!rail) return;
  const rect = rail.getBoundingClientRect();

  function onMove(ev: MouseEvent): void {
    const delta = ev.clientY - startY;
    const pct = startPct + (delta / rect.height) * 100;
    sessionsHeight.value = Math.min(75, Math.max(22, pct));
  }
  function onUp(): void {
    dragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

</script>

<template>
  <aside class="left-rail" :class="{ dragging }">
    <div class="sessions-pane" :style="{ height: `${sessionsHeight}%` }">
      <div class="pane-header">
        <div class="pane-title">
          <NText strong style="font-size: 12px;">
            {{ projectStore.current?.name || '项目' }}
          </NText>
          <NText depth="3" style="font-size: 11px;" class="pane-sub">会话</NText>
        </div>
        <NButton size="tiny" quaternary type="primary" @click="emit('new-session')">
          + 新建
        </NButton>
      </div>
      <div class="session-list">
        <div
          v-for="s in projectSessions"
          :key="s.id"
          class="session-item"
          :class="{ active: s.id === sessionId }"
          @click="emit('switch-session', s.id)"
        >
          <div class="session-title">
            <span class="dot" :class="s.status"></span>
            <template v-if="renamingId === s.id">
              <NInput
                v-model:value="renameValue"
                size="tiny"
                autofocus
                @blur="commitRename(s.id)"
                @keydown.enter.prevent="commitRename(s.id)"
                @keydown.esc.prevent="cancelRename"
              />
            </template>
            <template v-else>
              <span
                class="title-text"
                title="双击重命名"
                @dblclick.stop="startRename(s.id, s.title)"
              >{{ s.title }}</span>
            </template>
          </div>
          <div class="session-meta">
            <span class="time">{{ formatTime(s.updatedAt) }}</span>
            <NPopconfirm @positive-click.stop="emit('close-session', s.id)">
              <template #trigger>
                <button class="close-btn" type="button" title="关闭会话" @click.stop>×</button>
              </template>
              关闭并结束此会话进程？
            </NPopconfirm>
          </div>
        </div>
        <NEmpty
          v-if="projectSessions.length === 0"
          size="small"
          description="暂无会话"
          style="margin-top: 24px;"
        />
      </div>
    </div>

    <div class="split-handle" title="拖动调整" @mousedown="onSplitDown"></div>

    <div class="files-pane">
      <div class="pane-header compact">
        <NText depth="3" style="font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">
          文件
        </NText>
      </div>
      <div class="files-body">
        <FileTree
          :project-id="projectId"
          :active-path="activeDiffFile"
          @select="(p) => emit('file-select', p)"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.left-rail {
  width: var(--rail-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  user-select: none;
}
.left-rail.dragging {
  cursor: row-resize;
}
.sessions-pane {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.files-pane {
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.files-body {
  flex: 1;
  min-height: 0;
}
.split-handle {
  height: 5px;
  flex-shrink: 0;
  cursor: row-resize;
  background: transparent;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  position: relative;
}
.split-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 2px;
  transform: translate(-50%, -50%);
  border-radius: 1px;
  background: var(--border);
}
.split-handle:hover::after,
.dragging .split-handle::after {
  background: var(--accent);
}
.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  gap: 8px;
  flex-shrink: 0;
}
.pane-header.compact {
  padding: 8px 12px 4px;
}
.pane-title {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pane-sub {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 8px;
}
.session-item {
  padding: 7px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 2px;
  border: 1px solid transparent;
}
.session-item:hover {
  background: var(--bg-elevated);
}
.session-item.active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}
.session-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.title-text {
  font-size: 12.5px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.dot.alive {
  background: var(--success);
}
.dot.starting {
  background: var(--accent);
  animation: pulse 1.2s infinite;
}
.dot.dead {
  background: var(--danger);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.session-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 14px;
  margin-top: 2px;
}
.time {
  font-size: 10.5px;
  color: var(--text-muted);
}
.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  padding: 0 2px;
  transition: opacity 0.15s;
}
.session-item:hover .close-btn {
  opacity: 0.75;
}
.close-btn:hover {
  color: var(--danger);
}
</style>
