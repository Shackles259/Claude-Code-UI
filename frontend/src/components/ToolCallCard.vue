<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ToolCall } from '@/stores/session';

const props = defineProps<{ tool: ToolCall }>();

const expanded = ref(false);

const label = computed(() => toolLabel(props.tool.toolName, props.tool.input));
const shortName = computed(() => {
  const n = props.tool.toolName;
  if (n.includes('Bash')) return 'bash';
  if (n.includes('Edit')) return 'edit';
  if (n.includes('Write')) return 'write';
  if (n.includes('Read')) return 'read';
  if (n.includes('Grep')) return 'grep';
  if (n.includes('Glob')) return 'glob';
  if (n.includes('WebFetch')) return 'fetch';
  if (n.includes('WebSearch')) return 'search';
  if (n.includes('Todo')) return 'todo';
  return n.replace(/^mcp__/, '').slice(0, 16);
});

const status = computed<'running' | 'done' | 'error'>(() => {
  if (props.tool.isError) return 'error';
  if (props.tool.done) return 'done';
  return 'running';
});

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return `$ ${truncate(String(input.command || ''), 90)}`;
    case 'Edit':
    case 'Write':
      return `${truncate(String(input.file_path || ''), 90)}`;
    case 'Read':
      return truncate(String(input.file_path || ''), 90);
    case 'Grep':
      return truncate(String(input.pattern || ''), 50);
    case 'Glob':
      return truncate(String(input.pattern || ''), 50);
    case 'WebFetch':
      return truncate(String(input.url || ''), 70);
    case 'WebSearch':
      return truncate(String(input.query || ''), 70);
    case 'TodoWrite':
      return 'Update todos';
    default:
      return name;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const inputJson = computed(() => JSON.stringify(props.tool.input, null, 2));
</script>

<template>
  <div class="tool-card" :class="status">
    <button type="button" class="tool-header" @click="expanded = !expanded">
      <span class="tool-name">{{ shortName }}</span>
      <code class="tool-label">{{ label }}</code>
      <span class="status-mark" :data-status="status">
        <template v-if="status === 'running'">…</template>
        <template v-else-if="status === 'error'">!</template>
        <template v-else>✓</template>
      </span>
      <span class="caret">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-if="expanded" class="tool-detail">
      <div class="detail-block">
        <div class="detail-label">输入</div>
        <pre class="detail-pre">{{ inputJson }}</pre>
      </div>
      <div v-if="tool.result" class="detail-block">
        <div class="detail-label">输出</div>
        <pre class="detail-pre" :class="{ error: status === 'error' }">{{ tool.result }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  overflow: hidden;
}
.tool-card.running {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.tool-card.error {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
}
.tool-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
}
.tool-header:hover {
  background: color-mix(in srgb, var(--bg) 50%, transparent);
}
.tool-name {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--code-bg);
  border: 1px solid var(--border);
  font-family: var(--mono);
}
.tool-card.running .tool-name {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  animation: soft-pulse 1.4s ease-in-out infinite;
}
.tool-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: var(--mono);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-mark {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-muted);
}
.status-mark[data-status='done'] {
  color: var(--success);
}
.status-mark[data-status='error'] {
  color: var(--danger);
  font-weight: 700;
}
.status-mark[data-status='running'] {
  color: var(--accent);
}
.caret {
  color: var(--text-muted);
  font-size: 10px;
  flex-shrink: 0;
}
.tool-detail {
  border-top: 1px solid var(--border);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detail-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.detail-pre {
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  max-height: 280px;
  overflow: auto;
  margin: 0;
}
.detail-pre.error {
  color: var(--danger);
}
@keyframes soft-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
</style>
