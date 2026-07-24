<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  NTree, NButton, NSpace, NIcon, NSpin, NPopconfirm, NInput,
  useMessage,
} from 'naive-ui';
import type { TreeOption } from 'naive-ui';
import { api } from '@/api';
import type { FileNode } from '@/types';

const props = defineProps<{
  projectId: string;
  /** Path relative to project root that should be highlighted. */
  activePath?: string;
}>();
const emit = defineEmits<{
  select: [path: string];
}>();

const message = useMessage();
const loading = ref(false);
const rawTree = ref<FileNode | null>(null);
const expandedKeys = ref<string[]>([]);
const selectedKeys = ref<string[]>([]);
const filter = ref('');

function toTreeOption(node: FileNode): TreeOption {
  const isDir = node.type === 'directory';
  return {
    key: node.path,
    label: node.name,
    isLeaf: !isDir,
    children: isDir ? node.children?.map(toTreeOption) : undefined,
    _type: node.type,
  } as TreeOption;
}

const treeData = computed<TreeOption[]>(() => {
  if (!rawTree.value) return [];
  const opts = rawTree.value.children?.map(toTreeOption) || [];
  return filter.value ? filterTree(opts, filter.value) : opts;
});

function filterTree(nodes: TreeOption[], q: string): TreeOption[] {
  const lower = q.toLowerCase();
  const result: TreeOption[] = [];
  for (const n of nodes) {
    if (n.children && n.children.length) {
      const filtered = filterTree(n.children, q);
      if (filtered.length || String(n.label).toLowerCase().includes(lower)) {
        result.push({ ...n, children: filtered });
      }
    } else if (String(n.label).toLowerCase().includes(lower)) {
      result.push(n);
    }
  }
  return result;
}

async function loadTree(): Promise<void> {
  loading.value = true;
  try {
    const res = await api.getTree(props.projectId, 5);
    rawTree.value = res.tree;
    // Expand top-level dirs by default.
    expandedKeys.value = res.tree.children
      ?.filter((c) => c.type === 'directory')
      .map((c) => c.path) || [];
  } catch (err) {
    message.error(String(err));
  } finally {
    loading.value = false;
  }
}

watch(() => props.projectId, loadTree, { immediate: true });

function onSelect(keys: string[], option: Array<TreeOption | null>) {
  selectedKeys.value = keys;
  const opt = option[0];
  if (opt && (opt as TreeOption & { _type?: string })._type === 'file') {
    emit('select', opt.key as string);
  }
}

function nodeProps({ option }: { option: TreeOption }) {
  return {
    onClick: () => {
      if ((option as TreeOption & { _type?: string })._type === 'file') {
        emit('select', option.key as string);
      }
    },
  };
}

async function refresh(): Promise<void> {
  await loadTree();
  message.success('已刷新');
}

async function deleteSelected(): Promise<void> {
  if (selectedKeys.value.length === 0) return;
  const path = selectedKeys.value[0];
  try {
    await api.deleteFile(props.projectId, path);
    message.success('已删除');
    await loadTree();
  } catch (err) {
    message.error(String(err));
  }
}

watch(() => props.activePath, (p) => {
  if (p) selectedKeys.value = [p];
});
</script>

<template>
  <div class="file-tree">
    <div class="tree-toolbar">
      <NInput v-model:value="filter" size="tiny" placeholder="过滤..." clearable />
      <NSpace :size="2">
        <NButton size="tiny" quaternary @click="refresh" title="刷新">↻</NButton>
        <NPopconfirm v-if="selectedKeys.length" @positive-click="deleteSelected">
          <template #trigger>
            <NButton size="tiny" quaternary type="error" title="删除选中">🗑</NButton>
          </template>
          删除「{{ selectedKeys[0] }}」？
        </NPopconfirm>
      </NSpace>
    </div>
    <NSpin v-if="loading" size="small" style="margin: 20px auto; display: block;" />
    <NScrollbar v-else style="max-height: 100%;">
      <NTree
        :data="treeData"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :pattern="''"
        block-line
        expand-on-click
        selectable
        :node-props="nodeProps"
        @update:expanded-keys="(k) => (expandedKeys = k as string[])"
        @update:selected-keys="(k) => onSelect(k as string[], [])"
      />
    </NScrollbar>
  </div>
</template>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tree-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.tree-toolbar :deep(.n-input) {
  flex: 1;
}
</style>
