import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from './config.js';

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastOpened: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  last_opened: string | null;
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastOpened: r.last_opened,
  };
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY COALESCE(last_opened, created_at) DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : undefined;
}

export function getProjectByPath(p: string): Project | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE path = ?').get(p) as ProjectRow | undefined;
  return row ? rowToProject(row) : undefined;
}

export interface CreateProjectInput {
  name?: string;
  /** Absolute path to an existing directory, or empty to create under workspace root. */
  path?: string;
  /** Subdirectory name under the workspace root (used if path is empty). */
  dirName?: string;
}

export function createProject(input: CreateProjectInput): Project {
  const db = getDb();
  const cfg = loadConfig();
  let absPath: string;
  if (input.path) {
    absPath = path.resolve(input.path);
  } else {
    const dirName = input.dirName || (input.name || 'project').replace(/[^a-zA-Z0-9-_]/g, '-');
    absPath = path.join(cfg.workspaceRoot, dirName);
  }
  // Ensure the directory exists.
  fs.mkdirSync(absPath, { recursive: true });
  const id = randomUUID();
  const name = input.name || path.basename(absPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, name, absPath, now, now);
  logger.info('Project created', { id, name, path: absPath });
  return getProject(id)!;
}

export function updateProject(id: string, patch: { name?: string; lastOpened?: string }): Project | undefined {
  const db = getDb();
  const cur = getProject(id);
  if (!cur) return undefined;
  const name = patch.name ?? cur.name;
  const lastOpened = patch.lastOpened ?? cur.lastOpened;
  const now = new Date().toISOString();
  db.prepare('UPDATE projects SET name = ?, last_opened = ?, updated_at = ? WHERE id = ?')
    .run(name, lastOpened, now, id);
  return getProject(id);
}

export function touchProject(id: string): void {
  const db = getDb();
  db.prepare("UPDATE projects SET last_opened = datetime('now') WHERE id = ?").run(id);
}

export function deleteProject(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  logger.info('Project deleted', { id });
}
