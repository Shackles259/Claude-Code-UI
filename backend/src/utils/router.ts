import type { FastifyReply, FastifyRequest } from 'fastify';
import { getProject } from '../services/project.js';
import { sessionManager } from '../claude/manager.js';

/** Resolve the project for a request and return its absolute path. */
export function requireProject(req: FastifyRequest, reply: FastifyReply): { id: string; path: string } | null {
  const projectId = (req.params as { projectId?: string }).projectId || (req.body as { projectId?: string })?.projectId;
  if (!projectId) {
    reply.code(400).send({ error: 'projectId is required' });
    return null;
  }
  const project = getProject(projectId);
  if (!project) {
    reply.code(404).send({ error: `Project ${projectId} not found` });
    return null;
  }
  return { id: project.id, path: project.path };
}

export function requireSession(sessionId: string, reply: FastifyReply): boolean {
  if (!sessionManager.get(sessionId)) {
    reply.code(404).send({ error: `Session ${sessionId} not found` });
    return false;
  }
  return true;
}
