import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { sessionManager } from '../claude/manager.js';
import { type BridgeEvent, type ContentBlock } from '../claude/protocol.js';
import { logger } from '../utils/logger.js';

// ---- Messages sent TO the server from the client ----
type ClientMessage =
  | { type: 'chat'; content: string; attachments?: Array<{ path: string; isImage: boolean }> }
  | { type: 'interrupt' }
  | { type: 'replay' };

// ---- Messages sent FROM the server to the client ----
export type ServerMessage =
  | { type: 'event'; sessionId: string; event: BridgeEvent }
  | { type: 'replay_start'; sessionId: string; count: number }
  | { type: 'replayed'; sessionId: string }
  | { type: 'error'; message: string };

const IMG_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * Resolve an attachment path (relative to the project cwd, or absolute inside it)
 * and read it as base64. Returns null if missing or escaping the workspace.
 */
function readImageBase64(cwd: string, rel: string): { data: string; mime: string } | null {
  const abs = path.resolve(cwd, rel);
  const inside = path.relative(cwd, abs);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    logger.warn('Image attachment escapes workspace, skipping', { rel });
    return null;
  }
  const ext = (abs.split('.').pop() || '').toLowerCase();
  const mime = IMG_EXT_TO_MIME[ext];
  if (!mime) return null;
  try {
    const buf = fs.readFileSync(abs);
    return { data: buf.toString('base64'), mime };
  } catch {
    return null;
  }
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/:sessionId', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };

    const record = sessionManager.get(sessionId);
    if (!record) {
      socket.send(JSON.stringify({ type: 'error', message: `Session ${sessionId} not found` }));
      socket.close(1008, 'session not found');
      return;
    }

    logger.info('WS connected', { sessionId });

    // Forward all future bridge events to this socket.
    const unsubscribe = sessionManager.onEvent((sid, ev) => {
      if (sid !== sessionId) return;
      const msg: ServerMessage = { type: 'event', sessionId, event: ev };
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(JSON.stringify(msg));
      }
    });

    // Replay buffered events on connect so a fresh page load catches up.
    // Wrap with replay_start/replayed markers so the client can rebuild its
    // message list from a clean slate instead of duplicating on reconnect.
    const replayed = sessionManager.getReplay(sessionId);
    socket.send(JSON.stringify({ type: 'replay_start', sessionId, count: replayed.length } as ServerMessage));
    for (const ev of replayed) {
      socket.send(JSON.stringify({ type: 'event', sessionId, event: ev } as ServerMessage));
    }
    socket.send(JSON.stringify({ type: 'replayed', sessionId } as ServerMessage));

    socket.on('message', async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies ServerMessage));
        return;
      }
      try {
        switch (msg.type) {
          case 'chat': {
            // Build content blocks: a text block plus, for image attachments,
            // real image blocks (base64) so the model can actually see them.
            // Non-image files stay as text references (Claude reads them via tools).
            const blocks: ContentBlock[] = [];
            const record = sessionManager.get(sessionId);
            const cwd = record?.cwd || process.cwd();
            const fileRefs: string[] = [];
            if (msg.attachments && msg.attachments.length > 0) {
              for (const a of msg.attachments) {
                if (a.isImage) {
                  const img = readImageBase64(cwd, a.path);
                  if (img) {
                    blocks.push({
                      type: 'image',
                      source: { type: 'base64', media_type: img.mime, data: img.data },
                    });
                  } else {
                    fileRefs.push(`[image: ${a.path} (无法读取)]`);
                  }
                } else {
                  fileRefs.push(`[file: ${a.path}]`);
                }
              }
            }
            const text = fileRefs.length > 0
              ? `${msg.content}\n\n附件:\n${fileRefs.join('\n')}`
              : msg.content;
            // Text block first so the model sees the instruction before images.
            blocks.unshift({ type: 'text', text });
            await sessionManager.send(sessionId, blocks);
            break;
          }
          case 'interrupt': {
            sessionManager.interrupt(sessionId);
            break;
          }
          case 'replay': {
            const events = sessionManager.getReplay(sessionId);
            socket.send(JSON.stringify({ type: 'replay_start', sessionId, count: events.length } as ServerMessage));
            for (const ev of events) {
              socket.send(JSON.stringify({ type: 'event', sessionId, event: ev } as ServerMessage));
            }
            socket.send(JSON.stringify({ type: 'replayed', sessionId } as ServerMessage));
            break;
          }
          default: {
            socket.send(JSON.stringify({ type: 'error', message: `Unknown message type` } satisfies ServerMessage));
          }
        }
      } catch (err) {
        logger.error('WS message handling failed', { sessionId, error: String(err) });
        socket.send(JSON.stringify({ type: 'error', message: String(err) } satisfies ServerMessage));
      }
    });

    socket.on('close', () => {
      logger.info('WS disconnected', { sessionId });
      unsubscribe();
      // The bridge process stays resident — it is only killed on DELETE /session/:id.
    });

    socket.on('error', (err: Error) => {
      logger.error('WS error', { sessionId, error: String(err) });
      unsubscribe();
    });
  });
}
