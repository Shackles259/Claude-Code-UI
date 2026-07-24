import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './paths.js';

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';

function ts(): string {
  return new Date().toISOString();
}

function writeLine(file: string, line: string): void {
  try {
    fs.appendFileSync(file, line + '\n');
  } catch {
    // ignore write failures (e.g. disk full)
  }
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v, metaReplacer);
  } catch {
    return String(v);
  }
}

/**
 * JSON.stringify replacer that drops noisy/circular request fields Fastify
 * injects (req/res with sockets, raw streams) and keeps only useful bits.
 */
function metaReplacer(this: any, key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value !== null && typeof value === 'object') {
    // Avoid walking into Node request/response internals (circular, huge).
    if (key === 'req' || key === 'res' || key === 'request' || key === 'response') {
      const v = value as Record<string, unknown>;
      return {
        method: v.method,
        url: v.url,
        statusCode: v.statusCode,
      };
    }
    if (key === 'socket' || key === 'raw' || key === 'context') return undefined;
  }
  return value;
}

function fmt(level: Level, msg: string, meta?: unknown): string {
  const metaStr = meta !== undefined && meta !== null ? ' ' + safeStr(meta) : '';
  return `[${ts()}] [${level.toUpperCase()}] ${msg}${metaStr}`;
}

/**
 * Internal: write a level to the right file + mirror to stdout/stderr.
 * Supports both calling conventions:
 *   write('info', 'a message', { meta: 1 })           // our app style
 *   write('info', { reqId: 1, msg: 'request' }, ...)  // pino / Fastify style
 * where the first arg may be a merging object whose `msg` field is the text.
 */
function write(level: 'info' | 'warn' | 'error', a: any, b?: any): void {
  let msgStr: string;
  let meta: unknown;
  if (a !== null && typeof a === 'object') {
    // pino-style: first arg is a merging object.
    const obj = a as Record<string, unknown>;
    meta = { ...obj };
    msgStr = typeof obj.msg === 'string' ? obj.msg : (typeof b === 'string' ? b : '');
    // Drop the redundant msg key from meta to avoid duplication.
    if ('msg' in (meta as Record<string, unknown>)) delete (meta as Record<string, unknown>).msg;
  } else {
    msgStr = typeof a === 'string' ? a : safeStr(a);
    meta = b;
  }
  const line = fmt(level, msgStr || '(no message)', meta);
  if (level === 'error') {
    writeLine(PATHS.errorLog, line);
    writeLine(PATHS.serverLog, line);
    process.stderr.write(line + '\n');
  } else {
    writeLine(PATHS.serverLog, line);
    process.stdout.write(line + '\n');
  }
}

/** Shape of our logger; also used as the return type of child(). */
export interface AppLogger {
  fatal(msg: any, meta?: any): void;
  error(msg: any, meta?: any): void;
  warn(msg: any, meta?: any): void;
  info(msg: any, meta?: any): void;
  debug(msg: any, meta?: any): void;
  trace(msg: any, meta?: any): void;
  child(bindings?: Record<string, unknown>): AppLogger;
  claude(line: string): void;
}

/**
 * Minimal logger compatible with Fastify's logger interface
 * (requires fatal/error/warn/info/debug/trace/child).
 * Writes to rotating files (server.log / error.log) and mirrors to stdout.
 */
export const logger: AppLogger = {
  fatal(msg: any, meta?: any): void { write('error', msg, meta); },
  error(msg: any, meta?: any): void { write('error', msg, meta); },
  warn(msg: any, meta?: any): void { write('warn', msg, meta); },
  info(msg: any, meta?: any): void { write('info', msg, meta); },
  debug(msg: any, meta?: any): void {
    const line = fmt('debug', typeof msg === 'string' ? msg : safeStr(msg), meta);
    process.stdout.write(line + '\n');
  },
  trace(msg: any, meta?: any): void {
    const line = fmt('trace', typeof msg === 'string' ? msg : safeStr(msg), meta);
    // trace is very chatty; only to stdout, not the file.
    if (process.env.DEBUG_TRACE) process.stdout.write(line + '\n');
  },
  /** Create a "child" logger (Fastify calls this). Shares the same sinks. */
  child(_bindings?: Record<string, unknown>): AppLogger {
    return logger;
  },
  /** Raw claude process output (stdout/stderr lines). */
  claude(line: string): void {
    writeLine(PATHS.claudeLog, line);
  },
};

/** Truncate a log file if it grows beyond maxBytes. */
export function rotateLog(file: string, maxBytes = 5 * 1024 * 1024): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size > maxBytes) {
      const backup = file + '.1';
      try { fs.unlinkSync(backup); } catch { /* noop */ }
      fs.renameSync(file, backup);
    }
  } catch {
    // file may not exist yet
  }
}

export function rotateAllLogs(): void {
  for (const f of [PATHS.serverLog, PATHS.claudeLog, PATHS.errorLog]) {
    rotateLog(f);
  }
  // Touch files so they exist
  for (const f of [PATHS.serverLog, PATHS.claudeLog, PATHS.errorLog]) {
    const dir = path.dirname(f);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(f)) fs.writeFileSync(f, '');
  }
}
