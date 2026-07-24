import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { PATHS } from '../utils/paths.js';

const LOG_FILES = {
  server: PATHS.serverLog,
  claude: PATHS.claudeLog,
  error: PATHS.errorLog,
} as const;

type LogName = keyof typeof LOG_FILES;

export async function logRoutes(app: FastifyInstance): Promise<void> {
  // Tail a log file (last N lines).
  app.get('/api/logs/:name', async (req, reply) => {
    const { name } = req.params as { name: LogName };
    const file = LOG_FILES[name];
    if (!file) return reply.code(404).send({ error: 'Unknown log' });
    const lines = parseInt((req.query as { lines?: string }).lines || '500', 10);
    try {
      if (!fs.existsSync(file)) return { name, content: '', lines: [] };
      const content = fs.readFileSync(file, 'utf8');
      const all = content.split('\n');
      const tail = all.slice(-lines);
      return { name, content: tail.join('\n'), lines: tail.filter(Boolean) };
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // List available logs with sizes.
  app.get('/api/logs', async () => {
    const result = [];
    for (const [name, file] of Object.entries(LOG_FILES)) {
      let size = 0;
      try { size = fs.statSync(file).size; } catch { /* missing */ }
      result.push({ name, path: file, size });
    }
    return { logs: result };
  });

  // Clear a log file.
  app.delete('/api/logs/:name', async (req, reply) => {
    const { name } = req.params as { name: LogName };
    const file = LOG_FILES[name];
    if (!file) return reply.code(404).send({ error: 'Unknown log' });
    fs.writeFileSync(file, '');
    return { ok: true };
  });
}
