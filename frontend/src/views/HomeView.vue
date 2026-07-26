<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton, NSpace, NEmpty, NSpin,
  NModal, NForm, NFormItem, NInput, NPopconfirm,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import FolderBrowser from '@/components/FolderBrowser.vue';
import { useProjectStore } from '@/stores/project';
import { useSessionStore } from '@/stores/session';
import { api } from '@/api';

const router = useRouter();
const message = useMessage();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();

const showModal = ref(false);
const showBrowser = ref(false);
const browserMode = ref<'open' | 'new'>('open');
const form = ref({ name: '', path: '', dirName: '' });
const creating = ref(false);

onMounted(async () => {
  await projectStore.load();
});

async function openFolder(): Promise<void> {
  browserMode.value = 'open';
  showBrowser.value = true;
}

function browserForNew(): void {
  browserMode.value = 'new';
  showBrowser.value = true;
}

function folderName(folderPath: string): string {
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || folderPath;
}

async function onFolderSelected(folderPath: string): Promise<void> {
  if (browserMode.value === 'new') {
    form.value.path = folderPath;
    if (!form.value.name) form.value.name = folderName(folderPath);
    return;
  }
  try {
    const project = await projectStore.create({ path: folderPath });
    message.success(`已打开「${project.name}」`);
    await openProject(project.id);
  } catch (err) {
    message.error(String(err));
  }
}

async function openProject(projectId: string): Promise<void> {
  await projectStore.select(projectId);
  await sessionStore.loadSessions(projectId);
  const recent = sessionStore.sessions[0];
  if (recent) {
    router.push(`/chat/${projectId}/${recent.id}`);
  } else {
    router.push(`/chat/${projectId}`);
  }
}

async function createProject(): Promise<void> {
  if (!form.value.name && !form.value.path) {
    message.warning('请输入项目名称或路径');
    return;
  }
  creating.value = true;
  try {
    const project = await projectStore.create({
      name: form.value.name || undefined,
      path: form.value.path || undefined,
      dirName: form.value.dirName || undefined,
    });
    message.success(`项目「${project.name}」已创建`);
    showModal.value = false;
    form.value = { name: '', path: '', dirName: '' };
    await openProject(project.id);
  } catch (err) {
    message.error(String(err));
  } finally {
    creating.value = false;
  }
}

async function deleteProject(id: string): Promise<void> {
  try {
    await projectStore.remove(id);
    message.success('项目已删除');
  } catch (err) {
    message.error(String(err));
  }
}

async function revealProject(id: string): Promise<void> {
  try {
    await api.revealProject(id);
    message.success('已在文件管理器中打开');
  } catch (err) {
    message.error(String(err));
  }
}

function formatTime(t: string | null): string {
  if (!t) return '从未';
  try {
    return new Date(t).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return t;
  }
}
</script>

<template>
  <AppLayout>
    <div class="home">
      <div class="home-hero">
        <div class="hero-copy">
          <h1>Claude Code</h1>
          <p>结构化对话、会话与文件同屏管理——告别原生终端刷屏。</p>
        </div>
        <NSpace :size="10">
          <NButton type="primary" size="medium" @click="openFolder">打开文件夹</NButton>
          <NButton quaternary @click="showModal = true">新建空白项目</NButton>
        </NSpace>
      </div>

      <div class="section-label">最近项目</div>

      <div class="home-body">
        <NSpin v-if="projectStore.loading" />
        <NEmpty
          v-else-if="projectStore.projects.length === 0"
          description="还没有项目，打开一个本地文件夹即可开始"
          style="margin-top: 48px;"
        >
          <template #extra>
            <NButton type="primary" @click="openFolder">打开文件夹</NButton>
          </template>
        </NEmpty>
        <div v-else class="project-grid">
          <button
            v-for="p in projectStore.projects"
            :key="p.id"
            type="button"
            class="project-card"
            @click="openProject(p.id)"
          >
            <div class="project-name">{{ p.name }}</div>
            <div class="project-path">{{ p.path }}</div>
            <div class="project-footer">
              <span class="project-time">最近打开 {{ formatTime(p.lastOpened) }}</span>
              <span class="project-actions" @click.stop>
                <button type="button" class="link-btn" @click="revealProject(p.id)">在访达中显示</button>
                <NPopconfirm @positive-click="deleteProject(p.id)">
                  <template #trigger>
                    <button type="button" class="link-btn danger">删除</button>
                  </template>
                  确认删除项目「{{ p.name }}」？（不会删除磁盘文件）
                </NPopconfirm>
              </span>
            </div>
          </button>
        </div>
      </div>

      <NModal
        v-model:show="showModal"
        preset="card"
        title="新建项目"
        style="width: 520px;"
        :mask-closable="false"
      >
        <NForm label-placement="top">
          <NFormItem label="项目名称">
            <NInput v-model:value="form.name" placeholder="例如：我的项目" />
          </NFormItem>
          <NFormItem label="工作目录（绝对路径，留空则在 workspace 根下创建）">
            <NSpace style="width: 100%;" align="flex-start">
              <NInput v-model:value="form.path" placeholder="/path/to/existing/project" style="flex: 1;" />
              <NButton quaternary @click="browserForNew">浏览…</NButton>
            </NSpace>
          </NFormItem>
          <NFormItem v-if="!form.path" label="目录名（workspace 下的子目录名）">
            <NInput v-model:value="form.dirName" placeholder="留空则用项目名称" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showModal = false">取消</NButton>
            <NButton type="primary" :loading="creating" @click="createProject">创建</NButton>
          </NSpace>
        </template>
      </NModal>

      <FolderBrowser
        :show="showBrowser"
        @update:show="(v) => (showBrowser = v)"
        @select="onFolderSelected"
      />
    </div>
  </AppLayout>
</template>

<style scoped>
.home {
  height: 100%;
  overflow-y: auto;
  padding: 36px 40px 48px;
  max-width: 1100px;
  margin: 0 auto;
}
.home-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 36px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}
.hero-copy h1 {
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
.hero-copy p {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  max-width: 420px;
  line-height: 1.5;
}
.section-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.project-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.project-card:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent-soft) 50%, var(--bg-elevated));
}
.project-name {
  font-size: 14px;
  font-weight: 600;
}
.project-path {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-muted);
  word-break: break-all;
  line-height: 1.4;
}
.project-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.project-time {
  font-size: 11px;
  color: var(--text-muted);
}
.project-actions {
  display: flex;
  gap: 8px;
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--text-muted);
}
.link-btn:hover {
  color: var(--accent);
}
.link-btn.danger:hover {
  color: var(--danger);
}
</style>
