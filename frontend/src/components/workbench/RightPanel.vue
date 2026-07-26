<script setup lang="ts">
import { ref, watch } from 'vue';
import DiffViewer from '@/components/DiffViewer.vue';
import GitPanel from '@/components/GitPanel.vue';

const props = defineProps<{
  projectId: string;
  activeFile?: string;
  collapsed: boolean;
  tab?: 'diff' | 'git';
}>();

const emit = defineEmits<{
  'update:collapsed': [v: boolean];
  'update:tab': [t: 'diff' | 'git'];
  'update:activeFile': [f: string | undefined];
}>();

const localTab = ref<'diff' | 'git'>(props.tab || 'diff');

watch(
  () => props.tab,
  (t) => {
    if (t) localTab.value = t;
  },
);

function setTab(t: 'diff' | 'git'): void {
  localTab.value = t;
  emit('update:tab', t);
}

function onOpenDiff(file: string): void {
  emit('update:activeFile', file);
  setTab('diff');
}
</script>

<template>
  <aside class="right-panel" :class="{ collapsed }">
    <template v-if="!collapsed">
      <div class="panel-tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: localTab === 'diff' }"
          @click="setTab('diff')"
        >
          Diff
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: localTab === 'git' }"
          @click="setTab('git')"
        >
          Git
        </button>
        <button
          type="button"
          class="collapse-btn"
          title="折叠面板"
          @click="emit('update:collapsed', true)"
        >
          ›
        </button>
      </div>
      <div class="panel-body">
        <div v-show="localTab === 'diff'" class="panel-pane">
          <DiffViewer :project-id="projectId" :file="activeFile" />
        </div>
        <div v-show="localTab === 'git'" class="panel-pane">
          <GitPanel :project-id="projectId" @open-diff="onOpenDiff" />
        </div>
      </div>
    </template>
    <button
      v-else
      type="button"
      class="expand-strip"
      title="展开 Diff / Git"
      @click="emit('update:collapsed', false)"
    >
      <span>Diff</span>
      <span>Git</span>
    </button>
  </aside>
</template>

<style scoped>
.right-panel {
  width: var(--panel-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border);
  transition: width 0.15s ease;
}
.right-panel.collapsed {
  width: 28px;
}
.panel-tabs {
  height: 40px;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  padding-right: 4px;
}
.tab {
  padding: 0 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.collapse-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  padding: 0 8px;
  line-height: 1;
}
.collapse-btn:hover {
  color: var(--text);
}
.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.panel-pane {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.expand-strip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  padding-top: 16px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
.expand-strip:hover {
  color: var(--accent);
  background: var(--bg-elevated);
}
.expand-strip span {
  writing-mode: vertical-rl;
}
</style>
