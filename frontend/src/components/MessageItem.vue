<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { NText, useMessage } from 'naive-ui';
import ToolCallCard from './ToolCallCard.vue';
import { renderMarkdown, renderMermaidIn } from '@/utils/markdown';
import type { ChatMessage } from '@/stores/session';

const props = defineProps<{ message: ChatMessage }>();

const notify = useMessage();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');
const html = computed(() => renderMarkdown(props.message.text));

const bubbleRef = ref<HTMLElement | null>(null);

// Only render mermaid diagrams once the message is no longer streaming,
// to avoid spawning a render attempt on every token delta.
watch(
  () => [html.value, props.message.streaming] as const,
  ([, streaming]) => {
    if (streaming) return;
    nextTick(() => {
      if (bubbleRef.value) void renderMermaidIn(bubbleRef.value);
    });
  },
);

function copyText(): void {
  navigator.clipboard.writeText(props.message.text).then(
    () => notify.success('已复制到剪贴板'),
    () => notify.error('复制失败（可能需要 HTTPS 或授权）'),
  );
}

function formatCost(v: unknown): string {
  return typeof v === 'number' && isFinite(v) ? `$${v.toFixed(4)}` : '';
}
function formatDuration(v: unknown): string {
  return typeof v === 'number' && isFinite(v) ? `${(v / 1000).toFixed(1)}s` : '';
}
</script>

<template>
  <div class="message" :class="message.role">
    <div class="avatar">
      <template v-if="isUser">🧑</template>
      <template v-else-if="isSystem">⚠️</template>
      <template v-else>🤖</template>
    </div>
    <div ref="bubbleRef" class="bubble">
      <div class="bubble-header">
        <NText depth="3" style="font-size: 12px;">
          {{ isUser ? '你' : isSystem ? '系统' : 'Claude' }}
        </NText>
        <button v-if="message.text" class="copy-btn" title="复制" @click="copyText">复制</button>
      </div>
      <div class="tools-list">
        <ToolCallCard v-for="t in message.tools" :key="t.toolUseId" :tool="t" />
      </div>
      <div
        v-if="message.text"
        class="markdown-body"
        v-html="html"
      />
      <div v-if="message.streaming" class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
      <div v-if="message.meta" class="meta">
        <span v-if="message.meta.costUsd !== undefined && message.meta.costUsd !== null">
          {{ formatCost(message.meta.costUsd) }}
        </span>
        <span v-if="message.meta.durationMs !== undefined && message.meta.durationMs !== null">
          · {{ formatDuration(message.meta.durationMs) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 12px;
  padding: 12px 0;
}
.message.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.bubble {
  max-width: 78%;
  min-width: 0;
}
.message.user .bubble {
  background: var(--accent);
  color: var(--accent-fg);
  border-radius: 12px 12px 2px 12px;
  padding: 8px 14px;
}
.message.assistant .bubble,
.message.system .bubble {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px 12px 12px 2px;
  padding: 8px 14px;
}
.message.system .bubble {
  border-color: var(--danger);
}
.bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}
.message.user .bubble-header :deep(.n-text) {
  color: var(--accent-fg) !important;
  opacity: 0.85;
}
.copy-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s;
}
.message.user .copy-btn {
  color: var(--accent-fg);
}
.bubble:hover .copy-btn {
  opacity: 0.7;
}
.tools-list {
  margin-bottom: 4px;
}
.meta {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.7;
}
.message.user .meta {
  color: var(--accent-fg);
}
.typing-indicator {
  display: inline-flex;
  gap: 3px;
  padding: 4px 0;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: blink 1.4s infinite both;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; }
  40% { opacity: 1; }
}
</style>
