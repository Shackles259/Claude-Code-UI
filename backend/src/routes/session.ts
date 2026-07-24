import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { sessionManager } from '../claude/manager.js';
import { getProject, touchProject } from '../services/project.js';
import { requireProject } from '../utils/router.js';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // List all sessions (optionally filtered by project).
  app.get('/api/session', async (req) => {
    const projectId = (req.query as { projectId?: string }).projectId;
    let list = sessionManager.list();
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    return { sessions: list };
  });

  // Get one session.
  app.get('/api/session/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rec = sessionManager.get(id);
    if (!rec) return reply.code(404).send({ error: 'Session not found' });
    return { session: rec };
  });

  // Create a new session under a project. Spawns the claude process.
  app.post('/api/session', async (req, reply) => {
    const body = req.body as {
      projectId: string;
      title?: string;
      cliSessionId?: string; // to resume an existing CLI session
    };
    const project = requireProject(req, reply);
    if (!project) return;
    const fullProject = getProject(project.id)!;
    touchProject(project.id);

    const id = randomUUID();
    try {
      const record = await sessionManager.create({
        id,
        projectId: project.id,
        cwd: fullProject.path,
        title: body.title,
        cliSessionId: body.cliSessionId,
      });
      return { session: record };
    } catch (err) {
      req.log.error({ err: String(err) }, 'Failed to create session');
      return reply.code(500).send({ error: String(err) });
    }
  });

  // Interrupt the current turn.
  app.post('/api/session/:id/interrupt', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!sessionManager.get(id)) return reply.code(404).send({ error: 'Session not found' });
    sessionManager.interrupt(id);
    return { ok: true };
  });

  // Rename a session.
  app.patch('/api/session/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { title?: string };
    if (!body.title || !body.title.trim()) {
      return reply.code(400).send({ error: 'title is required' });
    }
    const record = sessionManager.rename(id, body.title.trim());
    if (!record) return reply.code(404).send({ error: 'Session not found' });
    return { session: record };
  });

  // Destroy a session (kills the process).
  app.delete('/api/session/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await sessionManager.destroy(id);
    return { ok: true };
  });
}
