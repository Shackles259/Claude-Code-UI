<script setup lang="ts">
import { NButton, NPopconfirm, NText } from 'naive-ui';

defineProps<{
  projectName?: string;
  model?: string;
  wsStatus?: 'connecting' | 'open' | 'closed' | 'error';
  hasSession: boolean;
  hasMessages: boolean;
  rightCollapsed: boolean;
}>();

const emit = defineEmits<{
  clear: [];
  'toggle-right': [];
}>();

function statusLabel(s?: string): string {
  if (s === 'open') return '已连接';
  if (s === 'connecting') return '连接中';
  if (s === 'closed') return '已断开';
  if (s === 'error') return '错误';
  return '未连接';
}
</script>

<template>
  <div class="chat-toolbar">
    <div class="left">
      <NText strong style="font-size: 13px;">{{ projectName || '工作区' }}</NText>
      <span v-if="model" class="chip model">{{ model }}</span>
      <span class="chip status" :data-status="wsStatus || 'closed'">
        <span class="status-dot"></span>
        {{ statusLabel(wsStatus) }}
      </span>
    </div>
    <div class="right">
      <NPopconfirm @positive-click="emit('clear')">
        <template #trigger>
          <NButton
            size="tiny"
            quaternary
            :disabled="!hasSession || !hasMessages"
          >
            清空显示
          </NButton>
        </template>
        清空当前会话的显示消息？（不影响已保存的会话历史）
      </NPopconfirm>
      <NButton size="tiny" quaternary @click="emit('toggle-right')">
        {{ rightCollapsed ? '显示面板' : '隐藏面板' }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.chat-toolbar {
  height: 40px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: var(--bg);
  gap: 12px;
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--bg-elevated);
  white-space: nowrap;
}
.chip.model {
  font-family: var(--mono);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: var(--accent-soft);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}
.chip.status[data-status='open'] .status-dot {
  background: var(--success);
}
.chip.status[data-status='connecting'] .status-dot {
  background: var(--accent);
  animation: pulse 1.2s infinite;
}
.chip.status[data-status='error'] .status-dot {
  background: var(--danger);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
