import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

/** Hidden / ignored entries to skip in the tree. */
const IGNORED = new Set(['node_modules', '.git', 'dist', '.DS_Store', '.cache', '.turbo']);

/**
 * Resolve and validate a user-supplied path against a base directory.
 * Throws if the resolved path escapes the base. Prevents:
 *   - `../` traversal
 *   - absolute paths (including Windows drive letters / UNC)
 *   - symlink escape: if the target (or any ancestor) is a symlink pointing
 *     outside the base, its real path is checked against the base's real path.
 */
export function safeResolve(base: string, target: string): string {
  if (path.isAbsolute(target)) {
    throw new Error(`Absolute paths are not allowed: "${target}"`);
  }
  const resolved = path.resolve(base, target);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${target}" escapes workspace base "${base}"`);
  }
  // Symlink hardening: resolve the real location of both base and target.
  // For non-existent targets, walk up to the nearest existing ancestor and
  // validate the real path of that ancestor stays within the base.
  const realBase = fs.realpathSync(base);
  let checkPath = resolved;
  while (checkPath !== path.dirname(checkPath)) {
    try {
      const real = fs.realpathSync(checkPath);
      const realRel = path.relative(realBase, real);
      if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
        throw new Error(`Path "${target}" resolves outside workspace (symlink escape)`);
      }
      break;
    } catch (err) {
      if (err instanceof Error && err.message.includes('symlink escape')) throw err;
      // Path doesn't exist yet (e.g. a file about to be written); walk up.
      checkPath = path.dirname(checkPath);
    }
  }
  return resolved;
}

export function readTree(base: string, maxDepth = 4): FileNode {
  const build = (dir: string, depth: number): FileNode => {
    const name = path.basename(dir) || dir;
    const stat = fs.statSync(dir);
    if (stat.isFile()) {
      return { name, path: dir, type: 'file', size: stat.size };
    }
    const node: FileNode = { name, path: dir, type: 'directory', children: [] };
    if (depth >= maxDepth) return node;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return node;
    }
    entries
      .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        // directories first, then alphabetic
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .forEach((e) => {
        try {
          node.children!.push(build(path.join(dir, e.name), depth + 1));
        } catch {
          // skip unreadable entries
        }
      });
    return node;
  };
  return build(base, 0);
}

export function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeFileContent(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  logger.info('File written', { path: filePath, bytes: Buffer.byteLength(content) });
}

export function deletePath(targetPath: string): void {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }
  logger.info('Path deleted', { path: targetPath });
}

export function createDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function renamePath(oldPath: string, newPath: string): void {
  fs.renameSync(oldPath, newPath);
}
