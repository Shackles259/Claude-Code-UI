import simpleGit, { type SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const gitCache = new Map<string, SimpleGit>();

function gitFor(cwd: string): SimpleGit {
  let g = gitCache.get(cwd);
  if (!g) {
    g = simpleGit(cwd);
    gitCache.set(cwd, g);
  }
  return g;
}

export function isRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

export async function ensureRepo(cwd: string): Promise<void> {
  if (!isRepo(cwd)) {
    const g = simpleGit(cwd);
    await g.init();
    logger.info('Initialized git repo', { cwd });
  }
}

export interface GitStatusEntry {
  file: string;
  index: string;   // staged status code
  working: string; // working tree status code
  path: string;
}
export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitStatusEntry[];
  clean: boolean;
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  const g = gitFor(cwd);
  if (!isRepo(cwd)) {
    return { isRepo: false, branch: null, ahead: 0, behind: 0, files: [], clean: true };
  }
  const status = await g.status();
  const files: GitStatusEntry[] = [];
  for (const f of status.files) {
    files.push({
      file: f.path,
      path: f.path,
      index: f.index || ' ',
      working: f.working_dir || ' ',
    });
  }
  return {
    isRepo: true,
    branch: status.current,
    ahead: status.ahead,
    behind: status.behind,
    files,
    clean: files.length === 0,
  };
}

export async function getDiff(cwd: string, opts: { cached?: boolean; file?: string } = {}): Promise<string> {
  const g = gitFor(cwd);
  const args: string[] = [];
  if (opts.cached) args.push('--cached');
  if (opts.file) args.push('--', opts.file);
  return g.diff(args);
}

export async function getDiffHead(cwd: string, file?: string): Promise<string> {
  const g = gitFor(cwd);
  const args = ['HEAD'];
  if (file) args.push('--', file);
  return g.diff(args);
}

export interface GitLogEntry {
  hash: string;
  date: string;
  author: string;
  message: string;
}

export async function getLog(cwd: string, max = 50): Promise<GitLogEntry[]> {
  const g = gitFor(cwd);
  if (!isRepo(cwd)) return [];
  const log = await g.log({ maxCount: max });
  return log.all.map((e) => ({
    hash: e.hash,
    date: e.date,
    author: e.author_name,
    message: e.message,
  }));
}

export async function getBranches(cwd: string): Promise<{ current: string | null; all: string[] }> {
  const g = gitFor(cwd);
  if (!isRepo(cwd)) return { current: null, all: [] };
  const b = await g.branchLocal();
  return { current: b.current, all: b.all };
}

export async function add(cwd: string, files: string[]): Promise<void> {
  const g = gitFor(cwd);
  await g.add(files);
}

export async function commit(cwd: string, message: string): Promise<void> {
  const g = gitFor(cwd);
  await g.commit(message);
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  const g = gitFor(cwd);
  await g.checkout(branch);
}

/** Read a file's content at a given revision (e.g. "HEAD", "HEAD~1", a hash). */
export async function showFile(cwd: string, ref: string, file: string): Promise<string> {
  const g = gitFor(cwd);
  // Use raw show to get the blob content as a string.
  return g.show([`${ref}:${file}`]);
}
