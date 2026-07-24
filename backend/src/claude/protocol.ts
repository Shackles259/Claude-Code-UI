/**
 * Type definitions for Claude Code CLI's `stream-json` protocol.
 *
 * The CLI is used purely as the tool-calling / streaming framework; the actual
 * model behind it is configured by the user (in this environment: GLM-5.2).
 * These types are independent of the underlying model.
 */

// ---- Inbound: stdout lines emitted by `claude -p --output-format stream-json` ----

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers?: unknown[];
  model: string;
  permissionMode?: string;
  slash_commands?: string[];
  agents?: string[];
  skills?: string[];
  [k: string]: unknown;
}

/** A system status update (subtype: 'status'). */
export interface SystemStatusMessage {
  type: 'system';
  subtype: 'status';
  status: string; // e.g. "requesting"
  session_id?: string;
  [k: string]: unknown;
}

/**
 * A raw upstream stream event, wrapped by the CLI when --include-partial-messages
 * is enabled. The inner `event` mirrors the Anthropic streaming API:
 * message_start / content_block_start / content_block_delta / content_block_stop / message_delta / message_stop.
 */
export interface StreamEventMessage {
  type: 'stream_event';
  event: {
    type: string;
    index?: number;
    delta?: { type: string; text?: string; partial_json?: string };
    content_block?: { type: string; text?: string; id?: string; name?: string; input?: unknown };
    message?: { id?: string; usage?: Record<string, number> };
    usage?: Record<string, number>;
  };
  session_id?: string;
  parent_tool_use_id?: string | null;
  ttft_ms?: number;
  [k: string]: unknown;
}

/** A single content block inside an assistant/user message. */
export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}
export interface ImageBlock {
  type: 'image';
  source: { type: string; media_type: string; data: string };
}
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

export interface AssistantMessage {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
    stop_sequence: string | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  parent_tool_use_id?: string | null;
  session_id: string;
  [k: string]: unknown;
}

export interface UserEchoMessage {
  type: 'user';
  message: {
    role: 'user';
    content: ContentBlock[];
  };
  session_id: string;
  parent_tool_use_id?: string | null;
  [k: string]: unknown;
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  is_error: boolean;
  api_error_status?: string | null;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  stop_reason?: string;
  session_id: string;
  total_cost_usd: number;
  usage?: Record<string, unknown>;
  permission_denials?: unknown[];
  terminal_reason?: string;
  [k: string]: unknown;
}

/** A parsed stream-json line from claude stdout. */
export type StreamMessage =
  | SystemInitMessage
  | SystemStatusMessage
  | StreamEventMessage
  | AssistantMessage
  | UserEchoMessage
  | ResultMessage
  | { type: string; [k: string]: unknown };

// ---- Outbound: messages we write to claude stdin (--input-format stream-json) ----

export interface StdinUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | ContentBlock[];
  };
}

// ---- Normalized events emitted by the bridge to the rest of the app ----

export type BridgeEvent =
  | { type: 'init'; sessionId: string; model: string; tools: string[]; cwd: string; raw: SystemInitMessage }
  | { type: 'streaming_text'; text: string; messageId: string }
  | { type: 'message_done'; messageId: string }
  | { type: 'text'; text: string; messageId: string }
  | { type: 'tool_use'; toolName: string; toolUseId: string; input: Record<string, unknown>; messageId: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'result'; result: string; costUsd: number; durationMs: number; sessionId: string; isError: boolean }
  | { type: 'raw'; message: StreamMessage }
  | { type: 'error'; error: string };

/** Helper: flatten a tool_result content (string | array) into a string. */
export function flattenToolResult(content: ToolResultBlock['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'object' && c !== null && 'text' in c ? c.text || '' : ''))
      .join('\n');
  }
  return String(content ?? '');
}
