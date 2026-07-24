import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getClaudeBin, loadConfig } from '../services/config.js';
import { logger } from '../utils/logger.js';
import {
  type StreamMessage,
  type StdinUserMessage,
  type BridgeEvent,
  type ContentBlock,
  flattenToolResult,
} from './protocol.js';

export interface BridgeOptions {
  /** Working directory for the claude process (the project path). */
  cwd: string;
  /** Resume an existing session by id (optional). */
  resumeSessionId?: string;
  /** Override model (empty = use CLI default). */
  model?: string;
  /** Override permission mode (empty = use config default). */
  permissionMode?: string;
  /** Additional allowed directories. */
  addDirs?: string[];
}

/**
 * ClaudeBridge owns a single long-running `claude` process and exposes a
 * duplex stream-json channel. It stays alive across multiple user messages
 * (process-resident model) and recovers via --resume on the next send if it dies.
 */
export class ClaudeBridge extends EventEmitter {
  private proc: ChildProcess | null = null;
  private readonly opts: BridgeOptions;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private alive = false;
  private initialized = false;
  /** sessionId reported by the CLI init message. */
  public sessionId: string | undefined;
  /** Model reported by the CLI init message (e.g. glm-5.2). */
  public model: string | undefined;
  private starting: Promise<void> | null = null;
  /** Tracks the message id of the assistant message currently being streamed. */
  private currentMessageId = '';
  /** Accumulates tool_use input JSON across input_json_delta fragments. */
  private pendingToolUse: { toolUseId: string; toolName: string; inputJson: string } | null = null;

  constructor(opts: BridgeOptions) {
    super();
    this.opts = opts;
  }

  get isAlive(): boolean {
    return this.alive && this.proc !== null && !this.proc.killed;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** OS process id of the spawned claude (undefined if not running). */
  get pid(): number | undefined {
    return this.proc?.pid;
  }

  /** Build the argv for spawning claude. */
  private buildArgs(): string[] {
    const cfg = loadConfig();
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];
    const mode = this.opts.permissionMode || cfg.permissionMode;
    if (mode) args.push('--permission-mode', mode);
    const model = this.opts.model ?? cfg.model;
    if (model) args.push('--model', model);
    if (this.opts.resumeSessionId) {
      args.push('--resume', this.opts.resumeSessionId);
    }
    if (this.opts.addDirs && this.opts.addDirs.length > 0) {
      args.push('--add-dir', ...this.opts.addDirs);
    }
    if (cfg.extraArgs && cfg.extraArgs.length > 0) {
      args.push(...cfg.extraArgs);
    }
    return args;
  }

  /** Spawn the claude process. Resolves as soon as the process is spawned. */
  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.isAlive) return;
    this.starting = this._start();
    return this.starting;
  }

  private _start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const bin = getClaudeBin();
      const args = this.buildArgs();
      logger.info('Spawning claude', { bin, args, cwd: this.opts.cwd });

      // Track whether the start promise has settled, so exit/error handlers
      // can reject if the process dies before we consider it started.
      let settled = false;
      const resolveOnce = (): void => { if (!settled) { settled = true; resolve(); } };
      const rejectOnce = (err: Error): void => { if (!settled) { settled = true; reject(err); } };

      try {
        this.proc = spawn(bin, args, {
          cwd: this.opts.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });
      } catch (err) {
        rejectOnce(new Error(`Failed to spawn claude: ${String(err)}`));
        return;
      }

      this.alive = true;

      // Consider the process "started" once it survives a brief grace period.
      // If it exits/errors within this window, the handlers below reject.
      const spawnCheck = setTimeout(() => {
        resolveOnce();
      }, 300);

      this.proc.stdout?.setEncoding('utf8');
      this.proc.stdout?.on('data', (chunk: string) => {
        this.stdoutBuffer += chunk;
        this.drainStdout();
      });

      this.proc.stderr?.setEncoding('utf8');
      this.proc.stderr?.on('data', (chunk: string) => {
        this.stderrBuffer += chunk;
        // stderr may carry useful lines; log them.
        const lines = this.stderrBuffer.split('\n');
        this.stderrBuffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            logger.claude(`[stderr] ${line}`);
            this.emitRawLine(line);
          }
        }
      });

      this.proc.on('error', (err) => {
        clearTimeout(spawnCheck);
        logger.error('claude process error', { error: String(err) });
        this.handleDeath(String(err));
        rejectOnce(new Error(`claude process error: ${String(err)}`));
      });

      this.proc.on('exit', (code, signal) => {
        clearTimeout(spawnCheck);
        logger.info('claude process exited', { code, signal });
        this.handleDeath(`exit code=${code} signal=${signal}`);
        // If the process exits before the grace period resolved the promise,
        // reject so callers (manager.ensure) don't hang forever.
        rejectOnce(new Error(`claude exited before startup (code=${code} signal=${signal})`));
      });
    });
  }

  /** Parse complete lines from the stdout buffer. */
  private drainStdout(): void {
    let idx: number;
    while ((idx = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, idx);
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (line.trim()) this.handleLine(line);
    }
  }

  private emitRawLine(line: string): void {
    logger.claude(line);
  }

  /** Parse one stream-json line and translate it into BridgeEvents. */
  private handleLine(line: string): void {
    this.emitRawLine(line);
    let msg: StreamMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      // Non-JSON line (e.g. banner); ignore.
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          const init = msg as Extract<StreamMessage, { type: 'system'; subtype: 'init' }>;
          this.sessionId = init.session_id;
          this.model = init.model;
          this.initialized = true;
          this.emitEvent({
            type: 'init',
            sessionId: init.session_id,
            model: init.model,
            tools: init.tools || [],
            cwd: init.cwd,
            raw: init,
          });
        }
        // subtype 'status' is informational; ignored.
        break;
      }
      case 'stream_event': {
        // Fine-grained streaming deltas (text + tool_use input).
        const se = (msg as Extract<StreamMessage, { type: 'stream_event' }>).event;
        if (!se) break;
        if (se.type === 'message_start' && se.message?.id) {
          this.currentMessageId = se.message.id;
        } else if (se.type === 'content_block_start') {
          const cb = se.content_block;
          if (cb?.type === 'tool_use') {
            // Tool use begins; emit with empty input, will be filled on stop.
            this.pendingToolUse = {
              toolUseId: cb.id || '',
              toolName: cb.name || '',
              inputJson: '',
            };
            this.emitEvent({
              type: 'tool_use',
              toolName: cb.name || '',
              toolUseId: cb.id || '',
              input: {},
              messageId: this.currentMessageId,
            });
          }
        } else if (se.type === 'content_block_delta') {
          const d = se.delta;
          if (d?.type === 'text_delta' && typeof d.text === 'string') {
            this.emitEvent({
              type: 'streaming_text',
              text: d.text,
              messageId: this.currentMessageId,
            });
          } else if (d?.type === 'input_json_delta' && typeof d.partial_json === 'string') {
            // Accumulate tool input JSON fragments.
            if (this.pendingToolUse) this.pendingToolUse.inputJson += d.partial_json;
          }
        } else if (se.type === 'content_block_stop') {
          // Finalize a tool_use block: re-emit with parsed input.
          if (this.pendingToolUse) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = this.pendingToolUse.inputJson
                ? JSON.parse(this.pendingToolUse.inputJson)
                : {};
            } catch { /* keep empty on malformed */ }
            this.emitEvent({
              type: 'tool_use',
              toolName: this.pendingToolUse.toolName,
              toolUseId: this.pendingToolUse.toolUseId,
              input: parsedInput,
              messageId: this.currentMessageId,
            });
            this.pendingToolUse = null;
          }
        } else if (se.type === 'message_stop') {
          this.emitEvent({ type: 'message_done', messageId: this.currentMessageId });
          this.currentMessageId = '';
        }
        break;
      }
      case 'assistant': {
        // The finalized assistant message. We already streamed its text via
        // stream_event deltas, so here we only forward tool_use blocks that
        // may not have been captured (defensive) — text is skipped to avoid
        // duplication.
        const a = msg as Extract<StreamMessage, { type: 'assistant' }>;
        const messageId = a.message?.id || '';
        for (const block of a.message?.content || []) {
          if (block.type === 'tool_use') {
            this.emitEvent({
              type: 'tool_use',
              toolName: block.name,
              toolUseId: block.id,
              input: block.input || {},
              messageId,
            });
          }
        }
        break;
      }
      case 'user': {
        // Tool results echoed back by the CLI.
        const u = msg as Extract<StreamMessage, { type: 'user' }>;
        for (const block of u.message?.content || []) {
          if (block.type === 'tool_result') {
            this.emitEvent({
              type: 'tool_result',
              toolUseId: block.tool_use_id,
              content: flattenToolResult(block.content),
              isError: !!block.is_error,
            });
          }
        }
        break;
      }
      case 'result': {
        const r = msg as Extract<StreamMessage, { type: 'result' }>;
        // A real result arrived: cancel any pending interrupt fallback timer.
        if (this.interruptTimer) {
          clearTimeout(this.interruptTimer);
          this.interruptTimer = null;
        }
        this.emitEvent({
          type: 'result',
          result: r.result || '',
          costUsd: typeof r.total_cost_usd === 'number' ? r.total_cost_usd : 0,
          durationMs: typeof r.duration_ms === 'number' ? r.duration_ms : 0,
          sessionId: r.session_id || this.sessionId || '',
          isError: !!r.is_error,
        });
        break;
      }
      default: {
        this.emitEvent({ type: 'raw', message: msg });
        break;
      }
    }
  }

  private emitEvent(ev: BridgeEvent): void {
    this.emit('event', ev);
  }

  private handleDeath(reason: string): void {
    const wasAlive = this.alive;
    this.alive = false;
    this.initialized = false;
    this.proc = null;
    this.starting = null;
    if (this.interruptTimer) {
      clearTimeout(this.interruptTimer);
      this.interruptTimer = null;
    }
    // Reset per-stream parsing state so a late line from a dying process
    // can't finalize a stale tool_use or append to a stale message.
    this.pendingToolUse = null;
    this.currentMessageId = '';
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    if (wasAlive) {
      this.emitEvent({ type: 'error', error: `claude process died (${reason})` });
    }
  }

  /**
   * Send a user message to claude via stdin (stream-json).
   * Auto-starts (or restarts with --resume) the process if needed.
   */
  async send(content: string | ContentBlock[]): Promise<void> {
    if (!this.isAlive) {
      await this.start();
    }
    if (!this.proc?.stdin) {
      throw new Error('claude stdin not available');
    }
    const msg: StdinUserMessage = {
      type: 'user',
      message: { role: 'user', content },
    };
    const line = JSON.stringify(msg) + '\n';
    return new Promise((resolve, reject) => {
      this.proc!.stdin!.write(line, (err) => {
        if (err) reject(new Error(`Failed to write to claude stdin: ${String(err)}`));
        else resolve();
      });
    });
  }

  /** Active interrupt fallback timer (so we can cancel it when a result arrives). */
  private interruptTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Interrupt the current turn (Ctrl+C equivalent).
   * Sends SIGINT to the process; the CLI handles it gracefully. As a safety
   * net, if no `result`/`error` event arrives within a grace window, we
   * synthesize an error so the client can reset its streaming state instead
   * of locking up forever.
   */
  interrupt(): void {
    if (this.proc && this.isAlive) {
      try {
        this.proc.kill('SIGINT');
        logger.info('Sent SIGINT to claude', { sessionId: this.sessionId });
      } catch (err) {
        logger.error('Failed to interrupt claude', { error: String(err) });
      }
    }
    // Fallback: clear the interrupt timer if pending, then arm a new one.
    if (this.interruptTimer) clearTimeout(this.interruptTimer);
    this.interruptTimer = setTimeout(() => {
      this.interruptTimer = null;
      if (!this.isAlive) return;
      // Still alive and no result arrived — synthesize an error to unblock the UI.
      logger.warn('Interrupt grace window elapsed with no result; synthesizing error', { sessionId: this.sessionId });
      this.emitEvent({ type: 'result', result: '', costUsd: 0, durationMs: 0, sessionId: this.sessionId || '', isError: true });
    }, 15000);
  }

  /** Terminate the process. Called when a session is closed. */
  async kill(): Promise<void> {
    if (this.proc && this.isAlive) {
      try {
        this.proc.stdin?.end();
      } catch { /* noop */ }
      try {
        this.proc.kill('SIGTERM');
      } catch { /* noop */ }
      // Force kill after grace period
      const proc = this.proc;
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL');
        } catch { /* noop */ }
      }, 3000);
    }
    this.alive = false;
    this.initialized = false;
    this.proc = null;
    this.starting = null;
  }
}
