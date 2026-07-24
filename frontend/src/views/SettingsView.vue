<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import {
  NCard, NForm, NFormItem, NInput, NButton, NSpace, NSelect, NSwitch,
  NInputNumber, NTag, NDivider, NSpin, useMessage,
} from 'naive-ui';
import AppLayout from '@/components/AppLayout.vue';
import { useConfigStore } from '@/stores/config';
import { api } from '@/api';
import type { PermissionMode, Theme } from '@/types';

const message = useMessage();
const configStore = useConfigStore();

const form = ref({
  claudePath: '',
  workspaceRoot: '',
  model: '',
  permissionMode: 'acceptEdits' as PermissionMode,
  theme: 'dark' as Theme,
  fontSize: 14,
  extraArgs: '' as string,
});
const saving = ref(false);
const detecting = ref(false);

const permissionOptions = [
  { label: '默认（default，每次询问）', value: 'default' },
  { label: '自动接受编辑（acceptEdits）', value: 'acceptEdits' },
  { label: '自动模式（auto）', value: 'auto' },
  { label: '全部跳过权限（bypassPermissions）', value: 'bypassPermissions' },
  { label: '不询问（dontAsk）', value: 'dontAsk' },
  { label: '计划模式（plan）', value: 'plan' },
];
const themeOptions = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' },
];
const modelOptions = [
  { label: '默认（使用 CLI 当前模型，如 GLM-5.2）', value: '' },
  { label: 'GLM-5.2', value: 'glm-5.2' },
  { label: 'sonnet', value: 'sonnet' },
  { label: 'opus', value: 'opus' },
  { label: 'haiku', value: 'haiku' },
];

onMounted(async () => {
  await configStore.load();
  const c = configStore.config;
  if (c) {
    form.value = {
      claudePath: c.claudePath,
      workspaceRoot: c.workspaceRoot,
      model: c.model,
      permissionMode: c.permissionMode,
      theme: c.theme,
      fontSize: c.fontSize,
      extraArgs: (c.extraArgs || []).join(' '),
    };
  }
});

async function detectClaude(): Promise<void> {
  detecting.value = true;
  try {
    const res = await api.detectClaude();
    form.value.claudePath = res.claudePath;
    message.success(res.claudePath ? `检测到: ${res.claudePath}` : '未检测到 claude');
  } catch (err) {
    message.error(String(err));
  } finally {
    detecting.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await configStore.save({
      ...form.value,
      extraArgs: form.value.extraArgs.trim() ? form.value.extraArgs.trim().split(/\s+/) : [],
    });
    message.success('设置已保存');
  } catch (err) {
    message.error(String(err));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppLayout>
    <div class="settings">
      <h2>设置</h2>
      <NSpin v-if="configStore.loading && !configStore.config" />
      <NCard v-else style="max-width: 720px;">
        <NForm label-placement="top">
          <NFormItem label="Claude CLI 路径">
            <NSpace style="width: 100%;" align="flex-start">
              <NInput v-model:value="form.claudePath" placeholder="/opt/homebrew/bin/claude" style="flex: 1;" />
              <NButton :loading="detecting" @click="detectClaude">自动检测</NButton>
            </NSpace>
          </NFormItem>

          <NFormItem label="Workspace 根目录（新建项目默认存放处）">
            <NInput v-model:value="form.workspaceRoot" placeholder="/path/to/workspace" />
          </NFormItem>

          <NDivider>Claude 会话</NDivider>

          <NFormItem label="模型（--model，留空使用 CLI 当前配置，如 GLM-5.2）">
            <NSelect v-model:value="form.model" :options="modelOptions" />
          </NFormItem>

          <NFormItem label="权限模式（默认 acceptEdits，即自动放行）">
            <NSelect v-model:value="form.permissionMode" :options="permissionOptions" />
          </NFormItem>

          <NFormItem label="额外启动参数（空格分隔，透传给 claude）">
            <NInput v-model:value="form.extraArgs" placeholder="--verbose --debug" />
          </NFormItem>

          <NDivider>外观</NDivider>

          <NFormItem label="主题">
            <NSelect v-model:value="form.theme" :options="themeOptions" />
          </NFormItem>

          <NFormItem label="字体大小">
            <NInputNumber v-model:value="form.fontSize" :min="10" :max="24" />
          </NFormItem>

          <NSpace justify="end" style="margin-top: 16px;">
            <NButton type="primary" :loading="saving" @click="save">保存设置</NButton>
          </NSpace>
        </NForm>
      </NCard>

      <NCard title="关于" style="max-width: 720px; margin-top: 16px;" size="small">
        <p style="color: var(--text-muted); font-size: 13px;">
          Claude Code WebUI 通过 Claude Code CLI 的 stream-json 协议对接，
          CLI 仅作为工具调用框架，实际推理模型由 CLI 配置决定（当前环境：GLM-5.2）。
        </p>
      </NCard>
    </div>
  </AppLayout>
</template>

<style scoped>
.settings {
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
}
.settings h2 {
  margin: 0 0 16px;
}
</style>
