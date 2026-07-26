import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  readTree,
  readFileContent,
  writeFileContent,
  deletePath,
  createDirectory,
  renamePath,
  safeResolve,
} from '../services/file.js';
import { getProject } from '../services/project.js';

/**
 * Open a directory (or a file's containing folder) in the OS file manager.
 * Cross-platform: Finder (macOS), Explorer (Windows), xdg-open (Linux).
 */
function getUserHome(): string {
  return os.homedir();
}

function revealInFileManager(target: string, isFile: boolean): void {
  const dir = isFile ? path.dirname(target) : target;
  switch (process.platform) {
    case 'darwin':
      // `open -R` reveals the file in Finder; for a dir, just `open`.
      spawn('open', isFile ? ['-R', target] : [dir], { detached: true, stdio: 'ignore' }).unref();
      break;
    case 'win32':
      // explorer selects the file if given, or opens the folder.
      spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
      break;
    default:
      spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
  }
}

function resolveInProject(projectId: string, target: string | undefined): { projectPath: string; abs: string } | { error: string; code: number } {
  const project = getProject(projectId);
  if (!project) return { error: 'Project not found', code: 404 };
  if (!target) return { error: 'path is required', code: 400 };
  try {
    const abs = safeResolve(project.path, target);
    return { projectPath: project.path, abs };
  } catch (err) {
    return { error: String(err), code: 400 };
  }
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // File tree for a project.
  app.get('/api/projects/:projectId/tree', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const depth = parseInt((req.query as { depth?: string }).depth || '4', 10);
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const tree = readTree(project.path, depth);
    return { tree };
  });

  // Read a file's content.
  app.get('/api/projects/:projectId/file', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const target = (req.query as { path?: string }).path;
    const res = resolveInProject(projectId, target);
    if ('error' in res) return reply.code(res.code).send({ error: res.error });
    if (!fs.existsSync(res.abs)) return reply.code(404).send({ error: 'File not found' });
    const stat = fs.statSync(res.abs);
    if (stat.isDirectory()) return reply.code(400).send({ error: 'Path is a directory' });
    return {
      path: target,
      content: readFileContent(res.abs),
      size: stat.size,
    };
  });

  // Write a file.
  app.put('/api/projects/:projectId/file', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = req.body as { path: string; content: string };
    const res = resolveInProject(projectId, body.path);
    if ('error' in res) return reply.code(res.code).send({ error: res.error });
    writeFileContent(res.abs, body.content);
    return { ok: true, path: body.path };
  });

  // Delete a file or directory.
  app.delete('/api/projects/:projectId/file', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const target = (req.query as { path?: string }).path;
    const res = resolveInProject(projectId, target);
    if ('error' in res) return reply.code(res.code).send({ error: res.error });
    if (!fs.existsSync(res.abs)) return reply.code(404).send({ error: 'Not found' });
    deletePath(res.abs);
    return { ok: true };
  });

  // Create a directory.
  app.post('/api/projects/:projectId/dir', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = req.body as { path: string };
    const res = resolveInProject(projectId, body.path);
    if ('error' in res) return reply.code(res.code).send({ error: res.error });
    createDirectory(res.abs);
    return { ok: true };
  });

  // Rename / move.
  app.post('/api/projects/:projectId/rename', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = req.body as { from: string; to: string };
    const fromRes = resolveInProject(projectId, body.from);
    if ('error' in fromRes) return reply.code(fromRes.code).send({ error: fromRes.error });
    const toRes = resolveInProject(projectId, body.to);
    if ('error' in toRes) return reply.code(toRes.code).send({ error: toRes.error });
    renamePath(fromRes.abs, toRes.abs);
    return { ok: true };
  });

  // Reveal the project root directory in the OS file manager.
  app.post('/api/projects/:projectId/reveal', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!fs.existsSync(project.path)) {
      return reply.code(404).send({ error: '项目目录不存在' });
    }
    revealInFileManager(project.path, false);
    return { ok: true };
  });

  // Reveal a specific file/dir inside the project in the OS file manager.
  app.post('/api/projects/:projectId/reveal-file', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = req.body as { path: string };
    const res = resolveInProject(projectId, body.path);
    if ('error' in res) return reply.code(res.code).send({ error: res.error });
    if (!fs.existsSync(res.abs)) {
      return reply.code(404).send({ error: '路径不存在' });
    }
    const stat = fs.statSync(res.abs);
    revealInFileManager(res.abs, stat.isFile());
    return { ok: true };
  });

  // Browse the filesystem to pick an existing directory (for "open folder").
  // Returns subdirectories of the given path (or user home / drives if empty).
  app.get('/api/browse', async (req, reply) => {
    const target = (req.query as { path?: string }).path;
    let dir: string;
    if (target) {
      dir = path.resolve(target);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return reply.code(404).send({ error: '目录不存在' });
      }
    } else {
      dir = getUserHome();
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return reply.code(403).send({ error: `无法读取: ${String(err)}` });
    }
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      current: dir,
      parent: path.dirname(dir) !== dir ? path.dirname(dir) : null,
      dirs,
    };
  });
}
