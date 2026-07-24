import { ClaudeBridge, type BridgeOptions } from './bridge.js';
import { type BridgeEvent, type ContentBlock } from './protocol.js';
import { logger } from '../utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../utils/paths.js';

export interface SessionRecord {
  id: string;
  projectId: string;
  /** The CLI session id (from init message). Used for --resume. */
  cliSessionId?: string;
  pid?: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'starting' | 'alive' | 'dead';
  cwd: string;
  model?: string;
}

export interface CreateSessionInput {
  id: string;
  projectId: string;
  cwd: string;
  title?: string;
  /** If resuming an existing CLI session. */
  cliSessionId?: string;
}

type EventListener = (sessionId: string, ev: BridgeEvent) => void;

/**
 * SessionManager keeps one long-lived ClaudeBridge per tab/session.
 * Processes stay resident after the browser closes; on server restart the
 * DB records are loaded but bridges are lazily recreated (with --resume).
 */
export class SessionManager {
  private bridges = new Map<string, ClaudeBridge>();
  private records = new Map<string, SessionRecord>();
  private listeners = new Set<EventListener>();
  /** Buffer of recent events per session for late-joining WS clients. */
  private replay = new Map<string, BridgeEvent[]>();
  private readonly maxReplay = 200;

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(sessionId: string, ev: BridgeEvent): void {
    const buf = this.replay.get(sessionId) || [];
    buf.push(ev);
    if (buf.length > this.maxReplay) buf.splice(0, buf.length - this.maxReplay);
    this.replay.set(sessionId, buf);
    for (const l of this.listeners) {
      try { l(sessionId, ev); } catch { /* listener errors are isolated */ }
    }
  }

  /** Replay buffered events to a freshly connected client. */
  getReplay(sessionId: string): BridgeEvent[] {
    return this.replay.get(sessionId) || [];
  }

  list(): SessionRecord[] {
    return Array.from(this.records.values());
  }

  get(id: string): SessionRecord | undefined {
    return this.records.get(id);
  }

  getBridge(id: string): ClaudeBridge | undefined {
    return this.bridges.get(id);
  }

  /** Persist session records so they survive server restarts. */
  private persist(): void {
    try {
      const data = Array.from(this.records.values());
      fs.mkdirSync(path.dirname(PATHS.dbFile), { recursive: true });
      fs.writeFileSync(
        path.join(PATHS.configDir, 'sessions.json'),
        JSON.stringify(data, null, 2),
        'utf8',
      );
    } catch (err) {
      logger.error('Failed to persist sessions', { error: String(err) });
    }
  }

  /** Load records from disk on startup. Bridges are created lazily on send. */
  load(): void {
    try {
      const file = path.join(PATHS.configDir, 'sessions.json');
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const data: SessionRecord[] = JSON.parse(raw);
        for (const r of data) {
          // All previously-alive processes are gone after restart.
          r.status = 'dead';
          r.pid = undefined;
          this.records.set(r.id, r);
        }
        logger.info('Loaded sessions from disk', { count: data.length });
      }
    } catch (err) {
      logger.error('Failed to load sessions', { error: String(err) });
    }
  }

  async create(input: CreateSessionInput): Promise<SessionRecord> {
    if (this.records.has(input.id)) {
      throw new Error(`Session ${input.id} already exists`);
    }
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectId: input.projectId,
      cliSessionId: input.cliSessionId,
      title: input.title || '新会话',
      createdAt: now,
      updatedAt: now,
      status: 'starting',
      cwd: input.cwd,
    };
    this.records.set(input.id, record);

    const opts: BridgeOptions = {
      cwd: input.cwd,
      resumeSessionId: input.cliSessionId,
    };
    const bridge = new ClaudeBridge(opts);
    this.attach(input.id, bridge, record);
    this.bridges.set(input.id, bridge);
    this.persist();
    return record;
  }

  private attach(sessionId: string, bridge: ClaudeBridge, record: SessionRecord): void {
    bridge.on('event', (ev: BridgeEvent) => {
      switch (ev.type) {
        case 'init':
          record.cliSessionId = ev.sessionId;
          record.model = ev.model;
          record.status = 'alive';
          record.pid = bridge.pid;
          record.updatedAt = new Date().toISOString();
          this.persist();
          break;
        case 'result':
        case 'text':
        case 'tool_use':
        case 'tool_result':
          record.updatedAt = new Date().toISOString();
          break;
        case 'error':
          record.status = 'dead';
          record.pid = undefined;
          this.persist();
          break;
      }
      this.emit(sessionId, ev);
    });
  }

  /** Ensure the bridge for a session is alive (create or restart with resume). */
  async ensure(id: string): Promise<ClaudeBridge> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Session ${id} not found`);
    const existing = this.bridges.get(id);
    if (existing && existing.isAlive) return existing;
    // Clean up any dead/zombie bridge before recreating, to avoid orphan
    // processes and stale event listeners that could fire on late exit/error
    // events and clobber the freshly-restarted session's state.
    if (existing) {
      existing.removeAllListeners();
      try { await existing.kill(); } catch { /* already dead */ }
      this.bridges.delete(id);
    }
    // (Re)create with resume if we have a cli session id.
    const bridge = new ClaudeBridge({
      cwd: record.cwd,
      resumeSessionId: record.cliSessionId,
    });
    this.bridges.set(id, bridge);
    record.status = 'starting';
    this.attach(id, bridge, record);
    await bridge.start();
    return bridge;
  }

  /** Send a chat message to a session. */
  async send(id: string, content: string | ContentBlock[]): Promise<void> {
    const bridge = await this.ensure(id);
    // Backend-side auto-naming fallback: if the session still has its default
    // title, derive one from the first user message. This also covers clients
    // that talk to the WS directly (the frontend does its own optimistic rename).
    this.autoNameFromContent(id, content);
    await bridge.send(content);
  }

  private autoNameFromContent(id: string, content: string | ContentBlock[]): void {
    const record = this.records.get(id);
    if (!record || (record.title && record.title !== '新会话')) return;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ');
    }
    const title = text.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (title) {
      record.title = title;
      this.persist();
    }
  }

  /** Interrupt the current turn of a session. */
  interrupt(id: string): void {
    const bridge = this.bridges.get(id);
    if (bridge) bridge.interrupt();
  }

  /** Rename a session. Returns the updated record, or undefined if not found. */
  rename(id: string, title: string): SessionRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.title = title.slice(0, 80) || record.title;
    record.updatedAt = new Date().toISOString();
    this.persist();
    return record;
  }

  /** Permanently close a session: kill process and remove records. */
  async destroy(id: string): Promise<void> {
    const bridge = this.bridges.get(id);
    if (bridge) {
      await bridge.kill();
      this.bridges.delete(id);
    }
    this.records.delete(id);
    this.replay.delete(id);
    this.persist();
  }

  /** Kill all processes (graceful shutdown). */
  async shutdown(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const [, bridge] of this.bridges) {
      tasks.push(bridge.kill());
    }
    await Promise.allSettled(tasks);
    this.bridges.clear();
    this.persist();
  }
}

export const sessionManager = new SessionManager();
