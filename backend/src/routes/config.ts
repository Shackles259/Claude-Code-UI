import type { FastifyInstance } from 'fastify';
import { loadConfig, saveConfig, detectClaudePath, type AppConfig } from '../services/config.js';

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async () => {
    return { config: loadConfig() };
  });

  app.put('/api/config', async (req, reply) => {
    const patch = req.body as Partial<AppConfig>;
    const config = saveConfig(patch);
    return { config };
  });

  app.post('/api/config/detect-claude', async () => {
    return { claudePath: detectClaudePath() };
  });
}
