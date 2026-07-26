<script setup lang="ts">
import { onMounted, ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NEmpty, NScrollbar, useMessage } from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import MessageItem from '@/components/MessageItem.vue';
import ChatInput from '@/components/ChatInput.vue';
import LeftRail from '@/components/workbench/LeftRail.vue';
import ChatToolbar from '@/components/workbench/ChatToolbar.vue';
import RightPanel from '@/components/workbench/RightPanel.vue';
import { useProjectStore } from '@/stores/project';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();

const projectId = computed(() => route.params.projectId as string);
const sessionId = computed(() => (route.params.sessionId as string) || null);

const bottomAnchor = ref<HTMLElement | null>(null);
const activeDiffFile = ref<string | undefined>();
const rightCollapsed = ref(false);
const rightTab = ref<'diff' | 'git'>('diff');

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

let activateToken = 0;

async function activateSession(id: string): Promise<void> {
  const token = ++activateToken;
  sessionStore.currentSessionId = id;
  sessionStore.connect(id);
  await nextTick();
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
watch(
  () => sessionStore.currentMessages.at(-1)?.parts?.length,
  () => scrollToBottom(),
);

function scrollToBottom(): void {
  nextTick(() => {
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

function onFileSelect(path: string): void {
  activeDiffFile.value = path;
  rightCollapsed.value = false;
  rightTab.value = 'diff';
}
</script>

<template>
  <AppLayout>
    <div class="workbench">
      <LeftRail
        :project-id="projectId"
        :session-id="sessionId"
        :active-diff-file="activeDiffFile"
        @new-session="newSession"
        @switch-session="switchSession"
        @close-session="closeSession"
        @file-select="onFileSelect"
      />

      <section class="chat-column">
        <ChatToolbar
          :project-name="projectStore.current?.name"
          :model="model"
          :ws-status="wsStatus"
          :has-session="!!sessionId"
          :has-messages="sessionStore.currentMessages.length > 0"
          :right-collapsed="rightCollapsed"
          @clear="clearChat"
          @toggle-right="rightCollapsed = !rightCollapsed"
        />

        <div v-if="!sessionId" class="no-session">
          <NEmpty description="选择左侧会话，或新建一个会话开始对话">
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
      </section>

      <RightPanel
        v-model:collapsed="rightCollapsed"
        v-model:tab="rightTab"
        v-model:active-file="activeDiffFile"
        :project-id="projectId"
      />
    </div>
  </AppLayout>
</template>

<style scoped>
.workbench {
  height: 100%;
  display: flex;
  min-width: 0;
}
.chat-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
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
  max-width: 820px;
  margin: 0 auto;
  padding: 20px 24px 28px;
}
.bottom-anchor {
  height: 1px;
}
</style>
