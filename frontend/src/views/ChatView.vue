<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NLayout, NLayoutSider, NLayoutContent,
  NButton, NSpace, NText, NTag, NEmpty, NScrollbar,
  NDrawer, NDrawerContent, NTabs, NTabPane, NPopconfirm,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import MessageItem from '@/components/MessageItem.vue';
import ChatInput from '@/components/ChatInput.vue';
import FileTree from '@/components/FileTree.vue';
import DiffViewer from '@/components/DiffViewer.vue';
import GitPanel from '@/components/GitPanel.vue';
import { useProjectStore } from '@/stores/project';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();

const projectId = computed(() => route.params.projectId as string);
const sessionId = computed(() => (route.params.sessionId as string) || null);

const showDrawer = ref(false);
const drawerTab = ref<'diff' | 'git'>('diff');
const leftPanel = ref<'sessions' | 'files'>('sessions');
const bottomAnchor = ref<HTMLElement | null>(null);
const activeDiffFile = ref<string | undefined>();
const renamingId = ref<string | null>(null);
const renameValue = ref('');
// Responsive drawer width: cap at 620 but leave a margin on narrow screens.
const drawerWidth = computed(() => Math.min(620, Math.max(320, window.innerWidth - 32)));

const isStreaming = computed(() =>
  sessionId.value ? !!sessionStore.streaming[sessionId.value] : false,
);
const model = computed(() =>
  sessionId.value ? sessionStore.modelBySession[sessionId.value] : undefined,
);
const wsStatus = computed(() =>
  sessionId.value ? sessionStore.statusBySession[sessionId.value] : undefined,
);

onMounted(async () => {
  try {
    await projectStore.select(projectId.value);
    await sessionStore.loadSessions(projectId.value);
    if (sessionId.value) {
      await activateSession(sessionId.value);
    }
  } catch (err) {
    message.error(String(err));
  }
});

onUnmounted(() => {
  // Keep WS connections alive across navigation (processes stay resident).
});

// Token to guard against rapid session-switch races: only the most recent
// activation should take effect.
let activateToken = 0;

async function activateSession(id: string): Promise<void> {
  const token = ++activateToken;
  sessionStore.currentSessionId = id;
  sessionStore.connect(id);
  await nextTick();
  // Bail if a newer activation superseded this one.
  if (token !== activateToken) return;
  scrollToBottom();
}

watch(sessionId, async (id) => {
  if (id) await activateSession(id);
});

watch(
  () => sessionStore.currentMessages.length,
  () => scrollToBottom(),
);
watch(
  () => sessionStore.currentMessages.at(-1)?.text,
  () => scrollToBottom(),
);

function scrollToBottom(): void {
  nextTick(() => {
    // Use a sentinel element + scrollIntoView for reliable auto-scroll that
    // works regardless of NScrollbar's internal DOM structure.
    bottomAnchor.value?.scrollIntoView({ behavior: 'auto', block: 'end' });
  });
}

async function newSession(): Promise<void> {
  try {
    const session = await sessionStore.createSession(projectId.value);
    router.push(`/chat/${projectId.value}/${session.id}`);
  } catch (err) {
    message.error(String(err));
  }
}

async function switchSession(id: string): Promise<void> {
  router.push(`/chat/${projectId.value}/${id}`);
}

async function closeSession(id: string): Promise<void> {
  try {
    await sessionStore.deleteSession(id);
    message.success('会话已关闭');
    const remaining = sessionStore.sessions.filter((s) => s.projectId === projectId.value);
    if (remaining.length > 0) {
      router.push(`/chat/${projectId.value}/${remaining[0].id}`);
    } else {
      router.push(`/chat/${projectId.value}`);
    }
  } catch (err) {
    message.error(String(err));
  }
}

function handleSend(content: string, attachments: Array<{ path: string; isImage: boolean }>): void {
  if (!sessionId.value) return;
  sessionStore.sendMessage(sessionId.value, content, attachments);
  scrollToBottom();
}

function handleInterrupt(): void {
  if (!sessionId.value) return;
  sessionStore.interrupt(sessionId.value);
}

function clearChat(): void {
  if (!sessionId.value) return;
  sessionStore.clearMessages(sessionId.value);
  message.success('已清空显示');
}

function startRename(id: string, currentTitle: string): void {
  renamingId.value = id;
  renameValue.value = currentTitle;
}

async function commitRename(id: string): Promise<void> {
  const title = renameValue.value.trim();
  renamingId.value = null;
  if (!title) return;
  try {
    await sessionStore.renameSession(id, title);
    message.success('已重命名');
  } catch (err) {
    message.error(String(err));
  }
}

function cancelRename(): void {
  renamingId.value = null;
}

function onFileSelect(path: string): void {
  activeDiffFile.value = path;
  showDrawer.value = true;
  drawerTab.value = 'diff';
}

function onOpenDiff(file: string): void {
  activeDiffFile.value = file;
  drawerTab.value = 'diff';
}

function formatTime(t: string): string {
  try {
    return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return t;
  }
}
</script>

<template>
  <AppLayout>
    <NLayout has-sider position="absolute" style="top: 48px; height: calc(100vh - 48px);">
      <!-- Left: sessions / files toggle -->
      <NLayoutSider
        bordered
        :width="240"
        :collapsed-width="0"
        show-trigger="arrow-circle"
        collapse-mode="width"
      >
        <div class="sidebar">
          <div class="sidebar-tabs">
            <button
              class="tab-btn"
              :class="{ active: leftPanel === 'sessions' }"
              @click="leftPanel = 'sessions'"
            >会话</button>
            <button
              class="tab-btn"
              :class="{ active: leftPanel === 'files' }"
              @click="leftPanel = 'files'"
            >文件</button>
          </div>
          <div class="sidebar-body">
            <!-- Sessions panel -->
            <template v-if="leftPanel === 'sessions'">
              <div class="panel-header">
                <NText strong style="font-size: 13px;">{{ projectStore.current?.name || '项目' }}</NText>
                <NButton size="tiny" type="primary" quaternary @click="newSession">+ 新会话</NButton>
              </div>
              <div class="session-list">
                <div
                  v-for="s in sessionStore.sessions.filter(x => x.projectId === projectId)"
                  :key="s.id"
                  class="session-item"
                  :class="{ active: s.id === sessionId }"
                  @click="switchSession(s.id)"
                >
                  <div class="session-title">
                    <span class="dot" :class="s.status"></span>
                    <template v-if="renamingId === s.id">
                      <NInput
                        v-model:value="renameValue"
                        size="tiny"
                        autofocus
                        @blur="commitRename(s.id)"
                        @keydown.enter.prevent="commitRename(s.id)"
                        @keydown.esc.prevent="cancelRename"
                      />
                    </template>
                    <template v-else>
                      <span
                        class="title-text"
                        :title="'双击重命名'"
                        @dblclick.stop="startRename(s.id, s.title)"
                      >{{ s.title }}</span>
                    </template>
                  </div>
                  <div class="session-meta">
                    <NText depth="3" style="font-size: 11px;">{{ formatTime(s.updatedAt) }}</NText>
                    <NPopconfirm @positive-click.stop="closeSession(s.id)">
                      <template #trigger>
                        <button class="close-btn" @click.stop>×</button>
                      </template>
                      关闭并结束此会话进程？
                    </NPopconfirm>
                  </div>
                </div>
                <NEmpty
                  v-if="sessionStore.sessions.filter(x => x.projectId === projectId).length === 0"
                  size="small"
                  description="无会话"
                  style="margin-top: 40px;"
                />
              </div>
            </template>
            <!-- Files panel -->
            <template v-else>
              <FileTree
                :project-id="projectId"
                :active-path="activeDiffFile"
                @select="onFileSelect"
              />
            </template>
          </div>
        </div>
      </NLayoutSider>

      <!-- Center: chat -->
      <NLayoutContent>
        <div class="chat-area">
          <div class="chat-toolbar">
            <NSpace align="center" :size="8">
              <NTag v-if="model" size="small" type="warning" round>{{ model }}</NTag>
              <NTag
                v-if="wsStatus"
                size="tiny"
                round
                :type="wsStatus === 'open' ? 'success' : wsStatus === 'error' ? 'error' : 'default'"
              >
                {{ wsStatus === 'open' ? '已连接' : wsStatus === 'connecting' ? '连接中' : wsStatus === 'closed' ? '已断开' : '错误' }}
              </NTag>
            </NSpace>
            <NSpace :size="4">
              <NPopconfirm @positive-click="clearChat">
                <template #trigger>
                  <NButton size="small" quaternary :disabled="!sessionId || sessionStore.currentMessages.length === 0">
                    清空
                  </NButton>
                </template>
                清空当前会话的显示消息？（不影响已保存的会话历史）
              </NPopconfirm>
              <NButton size="small" quaternary :type="drawerTab === 'diff' ? 'primary' : 'default'" @click="drawerTab = 'diff'; showDrawer = true">
                Diff
              </NButton>
              <NButton size="small" quaternary :type="drawerTab === 'git' ? 'primary' : 'default'" @click="drawerTab = 'git'; showDrawer = true">
                Git
              </NButton>
            </NSpace>
          </div>

          <div v-if="!sessionId" class="no-session">
            <NEmpty description="选择左侧会话或新建一个会话开始对话">
              <template #extra>
                <NButton type="primary" @click="newSession">新建会话</NButton>
              </template>
            </NEmpty>
          </div>
          <template v-else>
            <NScrollbar class="messages-scroll">
              <div class="messages">
                <MessageItem
                  v-for="m in sessionStore.currentMessages"
                  :key="m.id"
                  :message="m"
                />
                <div ref="bottomAnchor" class="bottom-anchor"></div>
              </div>
            </NScrollbar>
            <ChatInput
              :streaming="isStreaming"
              :project-id="projectId"
              @send="handleSend"
              @interrupt="handleInterrupt"
            />
          </template>
        </div>
      </NLayoutContent>

      <!-- Right: drawer for diff / git -->
      <NDrawer v-model:show="showDrawer" :width="drawerWidth" placement="right">
        <NDrawerContent title="工作区" closable>
          <NTabs v-model:value="drawerTab" type="line" animated>
            <NTabPane name="diff" tab="Diff">
              <DiffViewer :project-id="projectId" :file="activeDiffFile" />
            </NTabPane>
            <NTabPane name="git" tab="Git">
              <GitPanel :project-id="projectId" @open-diff="onOpenDiff" />
            </NTabPane>
          </NTabs>
        </NDrawerContent>
      </NDrawer>
    </NLayout>
  </AppLayout>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.tab-btn {
  flex: 1;
  padding: 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 13px;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: var(--text);
}
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.sidebar-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.session-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
}
.session-item:hover {
  background: var(--bg-elevated);
}
.session-item.active {
  background: var(--bg-elevated);
  border-left: 3px solid var(--accent);
}
.session-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title-text {
  font-size: 13px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
.dot.alive {
  background: var(--success);
}
.dot.starting {
  background: var(--accent);
  animation: pulse 1.2s infinite;
}
.dot.dead {
  background: var(--danger);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.session-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 14px;
  margin-top: 2px;
}
.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s;
}
.session-item:hover .close-btn {
  opacity: 0.7;
}
.chat-area {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chat-toolbar {
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.no-session {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.messages-scroll {
  flex: 1;
  min-height: 0;
}
.messages {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px 24px;
}
</style>
