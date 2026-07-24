import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { PATHS, ensureDirs } from './utils/paths.js';
import { logger, rotateAllLogs } from './utils/logger.js';
import { getDb, closeDb } from './db/index.js';
import { loadConfig } from './services/config.js';
import { sessionManager } from './claude/manager.js';

import { sessionRoutes } from './routes/session.js';
import { projectRoutes } from './routes/project.js';
import { configRoutes } from './routes/config.js';
import { fileRoutes } from './routes/file.js';
import { gitRoutes } from './routes/git.js';
import { uploadRoutes } from './routes/upload.js';
import { logRoutes } from './routes/log.js';
import { wsRoutes } from './ws/handler.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  ensureDirs();
  rotateAllLogs();
  logger.info('Starting Claude Code WebUI backend', { port: PORT, host: HOST, root: PATHS.root });

  // Initialize subsystems.
  getDb();
  loadConfig();
  sessionManager.load();

  // Use our file-backed logger as Fastify's logger instance. It implements the
  // full pino-shaped interface (fatal/error/warn/info/debug/trace/child) so
  // internal code (multipart plugin etc.) that calls req.log.trace works.
  const app = Fastify({
    loggerInstance: logger as any,
    bodyLimit: 50 * 1024 * 1024, // 50MB for file uploads
  });

  // Plugins.
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow vite dev server and same-origin.
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });
  await app.register(websocket, { options: { maxPayload: 50 * 1024 * 1024 } });
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // REST routes.
  await app.register(sessionRoutes);
  await app.register(projectRoutes);
  await app.register(configRoutes);
  await app.register(fileRoutes);
  await app.register(gitRoutes);
  await app.register(uploadRoutes);
  await app.register(logRoutes);

  // WebSocket routes.
  await app.register(wsRoutes);

  // Health check.
  app.get('/api/health', async () => ({ ok: true, ts: Date.now() }));

  // Graceful shutdown from the launcher/browser. Allows the start script to
  // stop the server when the user closes the app window.
  app.post('/api/shutdown', async (_req, _reply) => {
    logger.info('Shutdown requested via API');
    // Respond before dying so the client gets a confirmation.
    setImmediate(() => void shutdown('api-shutdown'));
    return { ok: true };
  });

  // Serve the built frontend in production.
  if (fs.existsSync(PATHS.frontendDist)) {
    await app.register(fastifyStatic, {
      root: PATHS.frontendDist,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback: non-API routes return index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        reply.code(404).send({ error: 'Not found' });
      } else {
        return reply.sendFile('index.html');
      }
    });
    logger.info('Serving frontend from build', { dir: PATHS.frontendDist });
  } else {
    logger.info('Frontend build not found; running in API-only mode', { dir: PATHS.frontendDist });
  }

  // Graceful shutdown. A hard-timeout fallback guarantees exit even if some
  // WebSocket or bridge refuses to close promptly.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      // Second signal: force-exit immediately.
      logger.warn(`Second ${signal} received, force-exiting`);
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    // Hard timeout: never let shutdown hang longer than 8s.
    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timed out, force-exiting');
      process.exit(1);
    }, 8000);
    forceTimer.unref();

    (async () => {
      try {
        // Notify WebSocket clients first so they can reconnect elsewhere.
        const wsServer = (app as unknown as { websocketServer?: { clients: Set<{ close: (code: number, reason: string) => void }> } }).websocketServer;
        if (wsServer) {
          for (const client of wsServer.clients) {
            try { client.close(1001, 'server shutting down'); } catch { /* noop */ }
          }
        }
        await sessionManager.shutdown();
        closeDb();
        await app.close();
      } catch (err) {
        logger.error('Error during shutdown', { error: String(err) });
      }
      clearTimeout(forceTimer);
      process.exit(0);
    })().catch((err) => {
      logger.error('Shutdown threw', { error: String(err) });
      process.exit(1);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Global error handlers: never let an unhandled rejection crash silently.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: String(err), stack: err.stack });
  });

  await app.listen({ port: PORT, host: HOST });
  // Print a machine-parseable line so launcher scripts can read the actual port
  // (useful when the launcher picks a free port and passes it via PORT).
  logger.info(`Backend listening on http://${HOST}:${PORT}`);
  process.stdout.write(`CLAUDE_UI_READY port=${PORT}\n`);
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});
