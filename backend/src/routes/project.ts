import type { FastifyInstance } from 'fastify';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  touchProject,
} from '../services/project.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    return { projects: listProjects() };
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    // Opening a project counts as activity for "最近打开" ordering.
    touchProject(id);
    // Re-fetch so the returned object reflects the new lastOpened timestamp.
    return { project: getProject(id) };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = req.body as { name?: string; path?: string; dirName?: string };
    try {
      const project = createProject(body);
      return { project };
    } catch (err) {
      return reply.code(400).send({ error: String(err) });
    }
  });

  app.put('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string };
    const project = updateProject(id, body);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project };
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    deleteProject(id);
    return { ok: true };
  });
}
