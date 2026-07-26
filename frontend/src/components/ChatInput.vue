<script setup lang="ts">
import { ref, computed } from 'vue';
import { NInput, NButton, NUpload, NTag, useMessage } from 'naive-ui';
import type { UploadCustomRequestOptions } from 'naive-ui';
import { api } from '@/api';
import { useSessionStore } from '@/stores/session';

const props = defineProps<{
  streaming: boolean;
  disabled?: boolean;
  projectId: string;
}>();
const emit = defineEmits<{
  send: [content: string, attachments: Array<{ path: string; isImage: boolean }>];
  interrupt: [];
}>();

const message = useMessage();
const sessionStore = useSessionStore();
const text = computed<string>({
  get: () => sessionStore.currentDraft,
  set: (v) => { sessionStore.currentDraft = v; },
});
const attachments = ref<Array<{ name: string; path: string; isImage: boolean; ext: string }>>([]);

const canSend = computed(() => text.value.trim().length > 0 && !props.streaming);

async function handleSend(): Promise<void> {
  if (!canSend.value) return;
  const content = text.value.trim();
  text.value = '';
  const atts = attachments.value.map((a) => ({ path: a.path, isImage: a.isImage }));
  attachments.value = [];
  emit('send', content, atts);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void handleSend();
  }
}

async function handleUpload({ file, onFinish, onError }: UploadCustomRequestOptions): Promise<void> {
  if (!file.file) return;
  try {
    const res = await api.uploadFile(props.projectId, file.file);
    if (res.ok) {
      attachments.value.push({
        name: res.file.name,
        path: res.file.relPath,
        isImage: res.file.isImage,
        ext: res.file.ext,
      });
      onFinish();
    } else {
      message.error(res.error || '上传失败');
      onError();
    }
  } catch (err) {
    message.error(String(err));
    onError();
  }
}

function removeAttachment(idx: number): void {
  attachments.value.splice(idx, 1);
}
</script>

<template>
  <div class="chat-input">
    <div v-if="attachments.length > 0" class="attachments">
      <NTag
        v-for="(a, i) in attachments"
        :key="a.path"
        :type="a.isImage ? 'success' : 'default'"
        closable
        size="small"
        @close="removeAttachment(i)"
      >
        {{ a.isImage ? '图片' : '文件' }} · {{ a.name }}
      </NTag>
    </div>
    <div class="input-row">
      <div class="input-actions">
        <NUpload
          :show-file-list="false"
          :default-upload="true"
          :custom-request="handleUpload"
          multiple
        >
          <NButton quaternary size="small" title="上传文件">附件</NButton>
        </NUpload>
      </div>
      <div class="input-field">
        <NInput
          v-model:value="text"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          :disabled="disabled"
          @keydown="onKeydown"
        />
      </div>
      <div class="input-actions">
        <NButton
          v-if="!streaming"
          type="primary"
          :disabled="!canSend || disabled"
          @click="handleSend"
        >
          发送
        </NButton>
        <NButton
          v-else
          type="error"
          ghost
          @click="emit('interrupt')"
        >
          中断
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  border-top: 1px solid var(--border);
  padding: 12px 16px 14px;
  background: var(--bg-sidebar);
}
.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  max-width: 820px;
  margin-left: auto;
  margin-right: auto;
}
.input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
}
.input-actions {
  flex: 0 0 auto;
}
.input-actions :deep(.n-upload) {
  width: auto;
  display: inline-block;
}
.input-field {
  flex: 1 1 auto;
  min-width: 0;
}
.input-field :deep(.n-input) {
  width: 100%;
}
.input-field :deep(.n-input .n-input__textarea-el) {
  background: var(--bg-input) !important;
}
</style>
