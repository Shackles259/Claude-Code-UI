<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useMessage } from 'naive-ui';
import ToolCallCard from './ToolCallCard.vue';
import { renderMarkdown, renderMermaidIn } from '@/utils/markdown';
import type { ChatMessage, ToolCall, MessagePart } from '@/stores/session';

const props = defineProps<{ message: ChatMessage }>();

const notify = useMessage();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');
const roleLabel = computed(() => (isUser.value ? '你' : isSystem.value ? '系统' : 'Claude'));

const bubbleRef = ref<HTMLElement | null>(null);

const timeline = computed(() => {
  const parts = props.message.parts?.length
    ? props.message.parts
    : fallbackParts(props.message);
  return parts.map((p) => resolvePart(p, props.message.tools));
});

function fallbackParts(msg: ChatMessage): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const t of msg.tools) {
    parts.push({ type: 'tool', toolUseId: t.toolUseId });
  }
  if (msg.text) {
    parts.push({ type: 'text', id: 'fallback-text', text: msg.text });
  }
  return parts;
}

function resolvePart(
  part: MessagePart,
  tools: ToolCall[],
): { kind: 'text'; id: string; html: string } | { kind: 'tool'; tool: ToolCall } | null {
  if (part.type === 'text') {
    return { kind: 'text', id: part.id, html: renderMarkdown(part.text) };
  }
  const tool = tools.find((t) => t.toolUseId === part.toolUseId);
  return tool ? { kind: 'tool', tool } : null;
}

watch(
  () => [props.message.parts, props.message.text, props.message.streaming] as const,
  ([, , streaming]) => {
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
    <div class="rail" aria-hidden="true"></div>
    <div ref="bubbleRef" class="body">
      <div class="header">
        <span class="role">{{ roleLabel }}</span>
        <button
          v-if="message.text"
          type="button"
          class="copy-btn"
          title="复制"
          @click="copyText"
        >
          复制
        </button>
      </div>

      <div class="timeline">
        <template v-for="(item, idx) in timeline" :key="idx">
          <div
            v-if="item?.kind === 'text'"
            class="markdown-body text-part"
            v-html="item.html"
          />
          <ToolCallCard
            v-else-if="item?.kind === 'tool'"
            :tool="item.tool"
          />
        </template>
      </div>

      <div v-if="message.streaming" class="typing-indicator" aria-label="正在输出">
        <span></span><span></span><span></span>
      </div>

      <div v-if="message.meta" class="meta">
        <span v-if="message.meta.costUsd != null">{{ formatCost(message.meta.costUsd) }}</span>
        <span v-if="message.meta.durationMs != null">
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
  padding: 14px 0;
}
.rail {
  width: 3px;
  flex-shrink: 0;
  border-radius: 2px;
  margin-top: 4px;
  align-self: stretch;
  min-height: 20px;
  background: transparent;
}
.message.user .rail {
  background: var(--accent);
}
.message.assistant .rail {
  background: var(--border);
}
.message.system .rail {
  background: var(--danger);
}
.body {
  flex: 1;
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.role {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.message.user .role {
  color: var(--accent);
}
.message.system .role {
  color: var(--danger);
}
.copy-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s;
}
.body:hover .copy-btn {
  opacity: 0.75;
}
.copy-btn:hover {
  color: var(--text);
}
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.text-part {
  line-height: 1.6;
}
.message.user .text-part {
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--border));
  border-radius: var(--radius-lg);
  padding: 10px 12px;
}
.message.system .text-part {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 13px;
}
.meta {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.75;
  font-family: var(--mono);
}
.typing-indicator {
  display: inline-flex;
  gap: 3px;
  padding: 6px 0 2px;
}
.typing-indicator span {
  width: 5px;
  height: 5px;
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
