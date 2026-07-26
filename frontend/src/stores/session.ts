import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api';
import { SessionSocket } from '@/api/ws';
import type { SessionRecord, BridgeEvent } from '@/types';

/** Ordered timeline parts for an assistant (or user) message. */
export type MessagePart =
  | { type: 'text'; id: string; text: string }
  | { type: 'tool'; toolUseId: string };

/** A UI-side message aggregated from bridge events. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** Flattened text for copy / search. */
  text: string;
  /** Chronological parts (text interleaved with tools). */
  parts: MessagePart[];
  /** Tool call lookup by toolUseId. */
  tools: ToolCall[];
  meta?: { costUsd?: number; durationMs?: number; isError?: boolean };
  streaming?: boolean;
  createdAt: number;
}

export interface ToolCall {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  done?: boolean;
}

function emptyAssistant(id: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    text: '',
    parts: [],
    tools: [],
    streaming: true,
    createdAt: Date.now(),
  };
}

/** Append streaming text into the last text part, or open a new one after a tool. */
function appendTextPart(msg: ChatMessage, delta: string): void {
  const last = msg.parts[msg.parts.length - 1];
  if (last && last.type === 'text') {
    last.text += delta;
  } else {
    msg.parts.push({ type: 'text', id: `t-${Date.now()}-${msg.parts.length}`, text: delta });
  }
  msg.text += delta;
}

function ensureToolPart(msg: ChatMessage, toolUseId: string): void {
  if (!msg.parts.some((p) => p.type === 'tool' && p.toolUseId === toolUseId)) {
    msg.parts.push({ type: 'tool', toolUseId });
  }
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionRecord[]>([]);
  const messagesBySession = ref<Record<string, ChatMessage[]>>({});
  const sockets = ref<Record<string, SessionSocket>>({});
  const statusBySession = ref<Record<string, 'connecting' | 'open' | 'closed' | 'error'>>({});
  const modelBySession = ref<Record<string, string>>({});
  const streaming = ref<Record<string, boolean>>({});
  const drafts = ref<Record<string, string>>({});

  const currentSessionId = ref<string | null>(null);

  const currentDraft = computed<string>({
    get: () => (currentSessionId.value ? drafts.value[currentSessionId.value] || '' : ''),
    set: (v) => {
      if (currentSessionId.value) drafts.value[currentSessionId.value] = v;
    },
  });

  const currentMessages = computed<ChatMessage[]>(() =>
    currentSessionId.value ? messagesBySession.value[currentSessionId.value] || [] : [],
  );

  async function loadSessions(projectId?: string): Promise<void> {
    const res = await api.listSessions(projectId);
    sessions.value = res.sessions;
  }

  async function createSession(projectId: string, title?: string): Promise<SessionRecord> {
    const res = await api.createSession({ projectId, title });
    sessions.value.unshift(res.session);
    return res.session;
  }

  async function deleteSession(id: string): Promise<void> {
    const sock = sockets.value[id];
    if (sock) {
      sock.close();
      delete sockets.value[id];
    }
    await api.deleteSession(id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
    delete messagesBySession.value[id];
  }

  function connect(id: string): void {
    if (sockets.value[id]) return;
    const sock = new SessionSocket(id);
    sock.onStatus((st) => {
      statusBySession.value[id] = st;
      if (st === 'closed' || st === 'error') {
        streaming.value[id] = false;
        const msgs = messagesBySession.value[id];
        if (msgs) {
          for (const m of msgs) {
            if (m.role === 'assistant') m.streaming = false;
          }
          messagesBySession.value[id] = [...msgs];
        }
      }
    });
    sock.onEvent((ev) => handleEvent(id, ev));
    sock.onControl((control) => {
      if (control === 'replay_start') {
        messagesBySession.value[id] = [];
      } else if (control === 'replayed') {
        const msgs = messagesBySession.value[id];
        if (msgs) {
          let changed = false;
          for (const m of msgs) {
            if (m.role === 'assistant' && m.streaming) {
              m.streaming = false;
              changed = true;
            }
          }
          if (changed) messagesBySession.value[id] = [...msgs];
        }
        streaming.value[id] = false;
      }
    });
    sock.connect();
    sockets.value[id] = sock;
  }

  function disconnect(id: string): void {
    const sock = sockets.value[id];
    if (sock) {
      sock.close();
      delete sockets.value[id];
    }
  }

  function sendMessage(
    sessionId: string,
    content: string,
    attachments?: Array<{ path: string; isImage: boolean }>,
  ): void {
    const sock = sockets.value[sessionId];
    if (!sock) {
      connect(sessionId);
    }
    const list = messagesBySession.value[sessionId] || [];
    list.push({
      id: `u-${Date.now()}`,
      role: 'user',
      text: content,
      parts: [{ type: 'text', id: `t-${Date.now()}`, text: content }],
      tools: [],
      createdAt: Date.now(),
    });
    messagesBySession.value[sessionId] = list;
    streaming.value[sessionId] = true;

    const s = sockets.value[sessionId];
    if (s) s.send({ type: 'chat', content, attachments });

    autoNameSession(sessionId, content);
  }

  function autoNameSession(sessionId: string, content: string): void {
    const rec = sessions.value.find((s) => s.id === sessionId);
    if (!rec || (rec.title && rec.title !== '新会话')) return;
    const title = content.trim().replace(/\s+/g, ' ').slice(0, 40) || '新会话';
    api.renameSession(sessionId, title).then((res) => {
      const idx = sessions.value.findIndex((s) => s.id === sessionId);
      if (idx >= 0) sessions.value[idx] = res.session;
    }).catch(() => { /* non-critical */ });
  }

  async function renameSession(sessionId: string, title: string): Promise<void> {
    const res = await api.renameSession(sessionId, title);
    const idx = sessions.value.findIndex((s) => s.id === sessionId);
    if (idx >= 0) sessions.value[idx] = res.session;
  }

  function interrupt(sessionId: string): void {
    const sock = sockets.value[sessionId];
    if (sock) sock.send({ type: 'interrupt' });
  }

  function handleEvent(sessionId: string, ev: BridgeEvent): void {
    const list = messagesBySession.value[sessionId] || [];

    switch (ev.type) {
      case 'init': {
        modelBySession.value[sessionId] = ev.model;
        break;
      }
      case 'streaming_text': {
        let msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        if (!msg) {
          msg = emptyAssistant(ev.messageId || `a-${Date.now()}`);
          list.push(msg);
        }
        appendTextPart(msg, ev.text);
        msg.streaming = true;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'message_done': {
        const msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        if (msg && !msg.tools.length) msg.streaming = false;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'text': {
        let msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        if (!msg) {
          msg = emptyAssistant(ev.messageId || `a-${Date.now()}`);
          msg.streaming = false;
          msg.text = ev.text;
          msg.parts = [{ type: 'text', id: `t-${Date.now()}`, text: ev.text }];
          list.push(msg);
        } else if (!msg.text) {
          appendTextPart(msg, ev.text);
        }
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'tool_use': {
        let last = [...list].reverse().find((m) => m.role === 'assistant' && m.id === ev.messageId);
        if (!last) {
          last = emptyAssistant(ev.messageId || `a-${Date.now()}`);
          list.push(last);
        }
        const existing = last.tools.find((t) => t.toolUseId === ev.toolUseId);
        if (existing) {
          if (ev.input && Object.keys(ev.input).length) existing.input = ev.input;
        } else {
          last.tools.push({
            toolUseId: ev.toolUseId,
            toolName: ev.toolName,
            input: ev.input,
            done: false,
          });
          ensureToolPart(last, ev.toolUseId);
        }
        last.streaming = true;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'tool_result': {
        for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i];
          if (m.role !== 'assistant') continue;
          const tc = m.tools.find((t) => t.toolUseId === ev.toolUseId);
          if (tc) {
            tc.result = ev.content;
            tc.isError = ev.isError;
            tc.done = true;
            messagesBySession.value[sessionId] = [...list];
            break;
          }
        }
        break;
      }
      case 'result': {
        let lastAssistant: ChatMessage | undefined;
        for (const m of list) {
          if (m.role === 'assistant') {
            m.streaming = false;
            lastAssistant = m;
          }
        }
        if (lastAssistant) {
          lastAssistant.meta = {
            costUsd: ev.costUsd,
            durationMs: ev.durationMs,
            isError: ev.isError,
          };
          if (!lastAssistant.text && ev.result) {
            appendTextPart(lastAssistant, ev.result);
          }
        }
        streaming.value[sessionId] = false;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'error': {
        streaming.value[sessionId] = false;
        list.push({
          id: `err-${Date.now()}`,
          role: 'system',
          text: ev.error,
          parts: [{ type: 'text', id: `t-${Date.now()}`, text: ev.error }],
          tools: [],
          createdAt: Date.now(),
        });
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      default:
        break;
    }
  }

  function clearMessages(sessionId: string): void {
    messagesBySession.value[sessionId] = [];
  }

  return {
    sessions,
    currentSessionId,
    currentMessages,
    messagesBySession,
    statusBySession,
    modelBySession,
    streaming,
    drafts,
    currentDraft,
    loadSessions,
    createSession,
    deleteSession,
    connect,
    disconnect,
    sendMessage,
    interrupt,
    handleEvent,
    clearMessages,
    renameSession,
  };
});
