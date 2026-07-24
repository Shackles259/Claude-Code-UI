import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api';
import { SessionSocket } from '@/api/ws';
import type { SessionRecord, BridgeEvent } from '@/types';

/** A UI-side message aggregated from bridge events. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** Rendered text (markdown). For assistant this accumulates text blocks. */
  text: string;
  /** Tool calls associated with this message. */
  tools: ToolCall[];
  /** Metadata: cost, duration, etc. for the final result. */
  meta?: { costUsd?: number; durationMs?: number; isError?: boolean };
  /** Streaming flag. */
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

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionRecord[]>([]);
  /** Map of sessionId -> messages. */
  const messagesBySession = ref<Record<string, ChatMessage[]>>({});
  /** Map of sessionId -> active socket. */
  const sockets = ref<Record<string, SessionSocket>>({});
  /** Map of sessionId -> connection status. */
  const statusBySession = ref<Record<string, 'connecting' | 'open' | 'closed' | 'error'>>({});
  /** Map of sessionId -> model (from init event). */
  const modelBySession = ref<Record<string, string>>({});
  const streaming = ref<Record<string, boolean>>({});
  /** Per-session unsent draft text, survives session switching/unmount. */
  const drafts = ref<Record<string, string>>({});

  const currentSessionId = ref<string | null>(null);

  /** Draft for the currently active session (or the sessionless buffer). */
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

  /** Connect (or reconnect) the WebSocket for a session. */
  function connect(id: string): void {
    if (sockets.value[id]) return;
    const sock = new SessionSocket(id);
    sock.onStatus((st) => {
      statusBySession.value[id] = st;
      // If the socket drops while a turn is streaming, un-stick the streaming
      // flag so the input isn't permanently locked on the "中断" button.
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
        // Server is about to replay buffered history: reset the message list
        // so we rebuild from scratch instead of duplicating on reconnect.
        messagesBySession.value[id] = [];
      } else if (control === 'replayed') {
        // Replay finished: any assistant message still flagged streaming is
        // from a truncated buffer (no closing result event). Clear it so the
        // typing indicator doesn't spin forever on stale history.
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
        // A replayed history means no turn is currently running here.
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

  /** Send a chat message. */
  function sendMessage(sessionId: string, content: string, attachments?: Array<{ path: string; isImage: boolean }>): void {
    const sock = sockets.value[sessionId];
    if (!sock) {
      connect(sessionId);
    }
    // Optimistic: append the user message locally.
    const list = messagesBySession.value[sessionId] || [];
    list.push({
      id: `u-${Date.now()}`,
      role: 'user',
      text: content,
      tools: [],
      createdAt: Date.now(),
    });
    messagesBySession.value[sessionId] = list;
    streaming.value[sessionId] = true;

    const s = sockets.value[sessionId];
    if (s) s.send({ type: 'chat', content, attachments });

    // Auto-name the session from the first user message if it's still default.
    autoNameSession(sessionId, content);
  }

  /** If the session still has its default title, derive one from the content. */
  function autoNameSession(sessionId: string, content: string): void {
    const rec = sessions.value.find((s) => s.id === sessionId);
    if (!rec || (rec.title && rec.title !== '新会话')) return;
    const title = content.trim().replace(/\s+/g, ' ').slice(0, 40) || '新会话';
    api.renameSession(sessionId, title).then((res) => {
      const idx = sessions.value.findIndex((s) => s.id === sessionId);
      if (idx >= 0) sessions.value[idx] = res.session;
    }).catch(() => { /* non-critical */ });
  }

  /** Rename a session (user-initiated). */
  async function renameSession(sessionId: string, title: string): Promise<void> {
    const res = await api.renameSession(sessionId, title);
    const idx = sessions.value.findIndex((s) => s.id === sessionId);
    if (idx >= 0) sessions.value[idx] = res.session;
  }

  function interrupt(sessionId: string): void {
    const sock = sockets.value[sessionId];
    if (sock) sock.send({ type: 'interrupt' });
  }

  /** Process a bridge event into the message list. */
  function handleEvent(sessionId: string, ev: BridgeEvent): void {
    const list = messagesBySession.value[sessionId] || [];

    switch (ev.type) {
      case 'init': {
        modelBySession.value[sessionId] = ev.model;
        break;
      }
      case 'streaming_text': {
        // Append token delta to the assistant message matching messageId.
        let msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        if (!msg) {
          msg = {
            id: ev.messageId || `a-${Date.now()}`,
            role: 'assistant',
            text: '',
            tools: [],
            streaming: true,
            createdAt: Date.now(),
          };
          list.push(msg);
        }
        msg.text += ev.text;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'message_done': {
        const msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        // A message_done only marks a single assistant turn finished, not the
        // whole round (tools may follow). Keep streaming flag until 'result'.
        if (msg && !msg.tools.length) msg.streaming = false;
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'text': {
        // Finalized text (non-streaming fallback). Only used if no deltas seen.
        let msg = list.find((m) => m.id === ev.messageId && m.role === 'assistant');
        if (!msg) {
          msg = {
            id: ev.messageId || `a-${Date.now()}`,
            role: 'assistant',
            text: ev.text,
            tools: [],
            streaming: false,
            createdAt: Date.now(),
          };
          list.push(msg);
        }
        messagesBySession.value[sessionId] = [...list];
        break;
      }
      case 'tool_use': {
        // Attach to the assistant message of this round. If input is empty and a
        // tool with this id already exists, this is the finalized version: update it.
        let last = [...list].reverse().find((m) => m.role === 'assistant' && m.id === ev.messageId);
        if (!last) {
          last = {
            id: ev.messageId || `a-${Date.now()}`,
            role: 'assistant',
            text: '',
            tools: [],
            streaming: true,
            createdAt: Date.now(),
          };
          list.push(last);
        }
        const existing = last.tools.find((t) => t.toolUseId === ev.toolUseId);
        if (existing) {
          // Finalized tool_use: fill in the parsed input.
          if (ev.input && Object.keys(ev.input).length) existing.input = ev.input;
        } else {
          last.tools.push({
            toolUseId: ev.toolUseId,
            toolName: ev.toolName,
            input: ev.input,
            done: false,
          });
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
        // The round is over: clear the streaming flag on EVERY assistant
        // message in this round (text → tool → text chains may leave
        // intermediate messages still flagged streaming).
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
          // If no text was captured but result exists, use it.
          if (!lastAssistant.text && ev.result) lastAssistant.text = ev.result;
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
          text: `⚠️ ${ev.error}`,
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
