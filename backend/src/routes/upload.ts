import type { FastifyInstance } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { PATHS } from '../utils/paths.js';
import { getProject } from '../services/project.js';
import { safeResolve } from '../services/file.js';

const ALLOWED_EXT = new Set([
  'pdf', 'docx', 'txt', 'java', 'ts', 'tsx', 'js', 'vue', 'py',
  'png', 'jpeg', 'jpg', 'gif', 'webp', 'md', 'json',
]);

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/**
 * Save an uploaded multipart file to disk, awaiting full completion.
 * Uses stream.pipeline so errors propagate and the response isn't sent
 * before the file is fully written.
 */
async function saveUpload(file: MultipartFile, dest: string): Promise<void> {
  const writeStream = fs.createWriteStream(dest);
  await pipeline(file.file, writeStream);
}

/**
 * Reduce a client-supplied filename to a safe basename: strips any directory
 * components and path separators so an attacker can't write outside the
 * uploads directory via names like "../../evil.png".
 */
function safeBasename(filename: string): string {
  const base = path.basename(filename || '');
  // Reject anything that still contains separators or is empty after stripping.
  if (!base || base.includes('/') || base.includes('\\') || base.includes(path.sep)) {
    return `upload-${Date.now()}`;
  }
  return base;
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:projectId/upload', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const safeName = safeBasename(data.filename);
    const ext = (safeName.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return reply.code(400).send({ error: `File type .${ext} is not allowed` });
    }

    // Save under project's .uploads dir.
    const uploadDir = path.join(project.path, '.uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const id = randomUUID();
    const savedName = `${id}-${safeName}`;
    const savedPath = path.join(uploadDir, savedName);

    try {
      await saveUpload(data, savedPath);
    } catch (err) {
      return reply.code(500).send({ error: `Upload failed: ${String(err)}` });
    }

    const isImage = IMAGE_EXTS.includes(ext);
    return {
      ok: true,
      file: {
        name: safeName,
        savedName,
        path: path.relative(project.path, savedPath),
        relPath: path.join('.uploads', savedName),
        ext,
        isImage,
        mimetype: data.mimetype,
      },
    };
  });

  // Generic uploads endpoint (not tied to a project) for attachments staging.
  app.post('/api/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });
    const safeName = safeBasename(data.filename);
    const ext = (safeName.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return reply.code(400).send({ error: `File type .${ext} is not allowed` });
    }
    fs.mkdirSync(PATHS.uploads, { recursive: true });
    const id = randomUUID();
    const savedName = `${id}-${safeName}`;
    const savedPath = path.join(PATHS.uploads, savedName);
    try {
      await saveUpload(data, savedPath);
    } catch (err) {
      return reply.code(500).send({ error: `Upload failed: ${String(err)}` });
    }
    const isImage = IMAGE_EXTS.includes(ext);
    return {
      ok: true,
      file: {
        name: safeName,
        savedName,
        path: savedPath,
        ext,
        isImage,
        mimetype: data.mimetype,
      },
    };
  });
}
