<script setup lang="ts">
import { computed, ref } from 'vue';
import { NCollapse, NCollapseItem, NTag, NCode, NScrollbar } from 'naive-ui';
import type { ToolCall } from '@/stores/session';

const props = defineProps<{ tool: ToolCall }>();

const expanded = ref(false);

const icon = computed(() => toolIcon(props.tool.toolName));
const label = computed(() => toolLabel(props.tool.toolName, props.tool.input));
const status = computed<'running' | 'done' | 'error'>(() => {
  if (props.tool.isError) return 'error';
  if (props.tool.done) return 'done';
  return 'running';
});

function toolIcon(name: string): string {
  if (name.includes('Bash')) return '⚡';
  if (name.includes('Edit') || name.includes('Write')) return '✏️';
  if (name.includes('Read')) return '📖';
  if (name.includes('Grep') || name.includes('Glob')) return '🔍';
  if (name.includes('Web')) return '🌐';
  if (name.includes('Todo')) return '📋';
  return '🔧';
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return `$ ${truncate(String(input.command || ''), 80)}`;
    case 'Edit':
    case 'Write':
      return `${name}: ${truncate(String(input.file_path || ''), 80)}`;
    case 'Read':
      return `Read: ${truncate(String(input.file_path || ''), 80)}`;
    case 'Grep':
      return `Grep: ${truncate(String(input.pattern || ''), 40)}`;
    case 'Glob':
      return `Glob: ${truncate(String(input.pattern || ''), 40)}`;
    case 'WebFetch':
      return `Fetch: ${truncate(String(input.url || ''), 60)}`;
    case 'WebSearch':
      return `Search: ${truncate(String(input.query || ''), 60)}`;
    case 'TodoWrite':
      return 'Update todos';
    default:
      return name;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const resultPreview = computed(() => {
  if (!props.tool.result) return '';
  return truncate(props.tool.result, 200);
});
</script>

<template>
  <div class="tool-card" :class="{ error: status === 'error' }">
    <div class="tool-header" @click="expanded = !expanded">
      <span class="tool-icon">{{ icon }}</span>
      <code class="tool-label">{{ label }}</code>
      <NTag
        v-if="status === 'running'"
        size="tiny"
        type="info"
        round
        :bordered="false"
      >运行中</NTag>
      <NTag v-else-if="status === 'error'" size="tiny" type="error" round :bordered="false">错误</NTag>
      <NTag v-else size="tiny" type="success" round :bordered="false">完成</NTag>
      <span class="caret">{{ expanded ? '▾' : '▸' }}</span>
    </div>
    <div v-if="expanded" class="tool-detail">
      <NCollapse display-directive="show">
        <NCollapseItem title="输入" name="input">
          <NScrollbar style="max-height: 240px;">
            <NCode :code="JSON.stringify(tool.input, null, 2)" language="json" word-wrap />
          </NScrollbar>
        </NCollapseItem>
        <NCollapseItem v-if="tool.result" title="输出" name="output">
          <NScrollbar style="max-height: 320px;">
            <pre class="tool-output" :class="{ error: status === 'error' }">{{ tool.result }}</pre>
          </NScrollbar>
        </NCollapseItem>
      </NCollapse>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin: 6px 0;
  background: var(--bg-elevated);
  overflow: hidden;
}
.tool-card.error {
  border-color: var(--danger);
}
.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}
.tool-icon {
  font-size: 14px;
}
.tool-label {
  flex: 1;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret {
  color: var(--text-muted);
  font-size: 10px;
}
.tool-detail {
  border-top: 1px solid var(--border);
  padding: 8px;
}
.tool-output {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}
.tool-output.error {
  color: var(--danger);
}
</style>
