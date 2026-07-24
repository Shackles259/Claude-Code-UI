// Shared types mirroring the backend. Kept in sync manually.

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastOpened: string | null;
}

export interface SessionRecord {
  id: string;
  projectId: string;
  cliSessionId?: string;
  pid?: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'starting' | 'alive' | 'dead';
  cwd: string;
  model?: string;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type Theme = 'light' | 'dark';

export interface AppConfig {
  claudePath: string;
  workspaceRoot: string;
  model: string;
  permissionMode: PermissionMode;
  theme: Theme;
  fontSize: number;
  extraArgs: string[];
}

// ---- Bridge / protocol events (subset relevant to the UI) ----

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type BridgeEvent =
  | { type: 'init'; sessionId: string; model: string; tools: string[]; cwd: string }
  | { type: 'streaming_text'; text: string; messageId: string }
  | { type: 'message_done'; messageId: string }
  | { type: 'text'; text: string; messageId: string }
  | { type: 'tool_use'; toolName: string; toolUseId: string; input: Record<string, unknown>; messageId: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'result'; result: string; costUsd: number; durationMs: number; sessionId: string; isError: boolean }
  | { type: 'raw'; message: Record<string, unknown> }
  | { type: 'error'; error: string };

export type ServerMessage =
  | { type: 'event'; sessionId: string; event: BridgeEvent }
  | { type: 'replay_start'; sessionId: string; count: number }
  | { type: 'replayed'; sessionId: string }
  | { type: 'error'; message: string };

// ---- File tree ----
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

// ---- Git ----
export interface GitStatusEntry {
  file: string;
  path: string;
  index: string;
  working: string;
}
export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitStatusEntry[];
  clean: boolean;
}
export interface GitLogEntry {
  hash: string;
  date: string;
  author: string;
  message: string;
}
