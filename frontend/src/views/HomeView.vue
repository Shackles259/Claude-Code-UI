<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NCard, NButton, NSpace, NEmpty, NSpin, NIcon, NText, NThing,
  NModal, NForm, NFormItem, NInput, NSwitch, NPopconfirm, NTag,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import { useProjectStore } from '@/stores/project';
import { useSessionStore } from '@/stores/session';
import { api } from '@/api';

const router = useRouter();
const message = useMessage();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();

const showModal = ref(false);
const form = ref({ name: '', path: '', dirName: '' });
const creating = ref(false);

onMounted(async () => {
  await projectStore.load();
});

async function openProject(projectId: string): Promise<void> {
  await projectStore.select(projectId);
  await sessionStore.loadSessions(projectId);
  // If there is an existing session, open the most recent; else go to chat to create one.
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
      <div class="home-header">
        <div>
          <h2>项目</h2>
          <NText depth="3" style="font-size: 13px;">
            选择一个项目开始，或新建项目
          </NText>
        </div>
        <NButton type="primary" @click="showModal = true">+ 新建项目</NButton>
      </div>

      <div class="home-body">
        <NSpin v-if="projectStore.loading" />
        <NEmpty
          v-else-if="projectStore.projects.length === 0"
          description="还没有项目，点击右上角创建一个吧"
          style="margin-top: 80px;"
        >
          <template #extra>
            <NButton type="primary" @click="showModal = true">新建项目</NButton>
          </template>
        </NEmpty>
        <div v-else class="project-grid">
          <NCard
            v-for="p in projectStore.projects"
            :key="p.id"
            class="project-card"
            hoverable
            @click="openProject(p.id)"
          >
            <NThing>
              <template #header>
                <span class="project-name">{{ p.name }}</span>
              </template>
              <template #description>
                <NText depth="3" code style="font-size: 12px; word-break: break-all;">
                  {{ p.path }}
                </NText>
              </template>
              <template #action>
                <NSpace size="small" align="center">
                  <NText depth="3" style="font-size: 12px;">
                    最近打开: {{ formatTime(p.lastOpened) }}
                  </NText>
                  <NButton size="tiny" quaternary @click.stop="revealProject(p.id)">📁 打开目录</NButton>
                  <NPopconfirm @positive-click.stop="deleteProject(p.id)">
                    <template #trigger>
                      <NButton size="tiny" quaternary type="error" @click.stop>删除</NButton>
                    </template>
                    确认删除项目「{{ p.name }}」？（不会删除磁盘文件）
                  </NPopconfirm>
                </NSpace>
              </template>
            </NThing>
          </NCard>
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
            <NInput v-model:value="form.path" placeholder="/path/to/existing/project" />
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
    </div>
  </AppLayout>
</template>

<style scoped>
.home {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
}
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.home-header h2 {
  margin: 0;
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.project-card {
  cursor: pointer;
}
.project-name {
  font-size: 15px;
  font-weight: 600;
}
</style>
