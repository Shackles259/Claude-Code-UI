import type { FastifyInstance } from 'fastify';
import {
  getStatus,
  getDiff,
  getDiffHead,
  getLog,
  getBranches,
  add,
  commit,
  checkout,
  ensureRepo,
  showFile,
} from '../services/git.js';
import { getProject } from '../services/project.js';

export async function gitRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:projectId/git/status', async (req, reply) => {
    const project = getProject((req.params as { projectId: string }).projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { status: await getStatus(project.path) };
  });

  // Read a file's content at a git revision (e.g. HEAD). Used by the diff
  // viewer to get the original version without client-side patch reversal.
  app.get('/api/projects/:projectId/git/show', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const q = req.query as { ref?: string; file?: string };
    if (!q.file) return reply.code(400).send({ error: 'file is required' });
    try {
      const content = await showFile(project.path, q.ref || 'HEAD', q.file);
      return { content };
    } catch (err) {
      // Likely the file is untracked or doesn't exist at that ref.
      return reply.code(404).send({ error: String(err) });
    }
  });

  app.get('/api/projects/:projectId/git/diff', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const q = req.query as { cached?: string; file?: string; head?: string };
    let diff: string;
    if (q.head !== undefined) {
      diff = await getDiffHead(project.path, q.file);
    } else {
      diff = await getDiff(project.path, { cached: q.cached === '1', file: q.file });
    }
    return { diff };
  });

  app.get('/api/projects/:projectId/git/log', async (req, reply) => {
    const project = getProject((req.params as { projectId: string }).projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { log: await getLog(project.path) };
  });

  app.get('/api/projects/:projectId/git/branches', async (req, reply) => {
    const project = getProject((req.params as { projectId: string }).projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return await getBranches(project.path);
  });

  app.post('/api/projects/:projectId/git/init', async (req, reply) => {
    const project = getProject((req.params as { projectId: string }).projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    await ensureRepo(project.path);
    return { ok: true };
  });

  app.post('/api/projects/:projectId/git/add', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const body = req.body as { files: string[] };
    await add(project.path, body.files || ['.']);
    return { ok: true };
  });

  app.post('/api/projects/:projectId/git/commit', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const body = req.body as { message: string };
    if (!body.message) return reply.code(400).send({ error: 'message is required' });
    await commit(project.path, body.message);
    return { ok: true };
  });

  app.post('/api/projects/:projectId/git/checkout', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const body = req.body as { branch: string };
    await checkout(project.path, body.branch);
    return { ok: true };
  });
}
