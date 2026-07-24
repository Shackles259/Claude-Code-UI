<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { DiffEditor, loader } from '@guolao/vue-monaco-editor';
import { NEmpty, NSelect, NSpace, NButton, NTag, useMessage } from 'naive-ui';
import { api } from '@/api';
import { useConfigStore } from '@/stores/config';

const props = defineProps<{
  projectId: string;
  /** If provided, diff this single file against HEAD. */
  file?: string;
}>();

const configStore = useConfigStore();

// Configure the monaco loader once.
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
  },
});

const message = useMessage();
const original = ref('');
const modified = ref('');
const language = ref('plaintext');
// head: working tree vs HEAD. cached: staged (index) vs HEAD.
const mode = ref<'head' | 'cached'>(props.file ? 'head' : 'head');

const langOptions = [
  { label: '文本', value: 'plaintext' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'Vue', value: 'html' },
  { label: 'JSON', value: 'json' },
  { label: 'CSS', value: 'css' },
  { label: 'Python', value: 'python' },
  { label: 'Bash', value: 'shell' },
  { label: 'Markdown', value: 'markdown' },
];

function guessLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    vue: 'html', json: 'json', css: 'css', scss: 'scss', py: 'python',
    sh: 'shell', bash: 'shell', md: 'markdown', go: 'go', rs: 'rust',
    java: 'java', c: 'c', cpp: 'cpp', html: 'html', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  };
  return map[ext] || 'plaintext';
}

async function loadDiff(): Promise<void> {
  if (!props.file) {
    original.value = '';
    modified.value = '';
    return;
  }
  language.value = guessLang(props.file);
  // "modified" side:
  //   head mode   -> working tree content (read from disk)
  //   cached mode -> staged/index content (git show :file)
  try {
    if (mode.value === 'cached') {
      const staged = await api.gitShow(props.projectId, '', props.file);
      modified.value = staged.content;
    } else {
      const curRes = await api.readFile(props.projectId, props.file);
      modified.value = curRes.content;
    }
  } catch (err) {
    message.error(String(err));
    return;
  }
  // "original" side: always HEAD via `git show HEAD:file` (exact, no reversal).
  try {
    const baseRes = await api.gitShow(props.projectId, 'HEAD', props.file);
    original.value = baseRes.content;
  } catch {
    // File is untracked or has no history at HEAD: treat as entirely new.
    original.value = '';
  }
}

watch(() => [props.file, props.projectId, mode.value], loadDiff, { immediate: true });

const hasContent = computed(() => original.value || modified.value);

// Apply the configured font size and follow the app theme (vs-dark / vs).
const editorTheme = computed(() => (configStore.theme === 'dark' ? 'vs-dark' : 'vs'));
const editorOptions = computed(() => ({
  readOnly: true,
  renderSideBySide: window.innerWidth >= 768,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: configStore.config?.fontSize ?? 13,
}));
</script>

<template>
  <div class="diff-viewer">
    <div v-if="file" class="diff-toolbar">
      <NTag size="small" type="info">{{ file }}</NTag>
      <NSpace :size="4">
        <NSelect
          v-model:value="mode"
          size="tiny"
          :options="[
            { label: '对比 HEAD (工作区)', value: 'head' },
            { label: '对比 HEAD (暂存区)', value: 'cached' },
          ]"
          style="width: 160px;"
        />
        <NSelect v-model:value="language" size="tiny" :options="langOptions" style="width: 120px;" />
      </NSpace>
    </div>
    <div v-if="file && hasContent" class="editor-wrap">
      <DiffEditor
        :original="original"
        :modified="modified"
        :language="language"
        :options="editorOptions"
        height="100%"
        :theme="editorTheme"
      />
    </div>
    <NEmpty v-else description="选择一个已修改的文件查看 Diff" style="margin-top: 60px;" />
  </div>
</template>

<style scoped>
.diff-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 6px;
}
.editor-wrap {
  flex: 1;
  min-height: 0;
}
</style>
