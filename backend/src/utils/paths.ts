import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The application root is the directory that contains the bundled resources:
 *   <APP_ROOT>/web/dist/   (frontend static assets)
 *   <APP_ROOT>/server/dist/server.js (this compiled backend, or backend/dist in dev)
 *
 * Resolution order:
 *   1. CLAUDE_UI_ROOT env var (explicit override, used by launcher scripts)
 *   2. Walk up from __dirname looking for a `web/dist` (packaged) or `frontend` (dev)
 *   3. Fallback: assume the typical layout relative to __dirname.
 */
function findAppRoot(): string {
  const envRoot = process.env.CLAUDE_UI_ROOT;
  if (envRoot && fs.existsSync(envRoot)) return path.resolve(envRoot);

  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    // Packaged layout: <root>/web/dist exists next to <root>/server/dist.
    if (fs.existsSync(path.join(dir, 'web', 'dist'))) return dir;
    // Dev layout: <root>/frontend and <root>/backend exist.
    if (fs.existsSync(path.join(dir, 'frontend')) && fs.existsSync(path.join(dir, 'backend'))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: in dev backend/dist/utils -> up 3; in packaged server/dist/utils -> up 2.
  return path.resolve(__dirname, '..', '..', '..');
}

export const APP_ROOT = findAppRoot();

/**
 * Per-user runtime data directory (workspace, config, logs, db). This MUST be
 * writable — packaged apps often live in read-only locations, so we write to a
 * platform-appropriate user data dir. Override with CLAUDE_UI_DATA.
 *
 *   macOS:  ~/Library/Application Support/ClaudeUI
 *   Windows: %APPDATA%/ClaudeUI
 *   Linux:   $XDG_DATA_HOME/ClaudeUI or ~/.local/share/ClaudeUI
 */
function findDataRoot(): string {
  const envData = process.env.CLAUDE_UI_DATA;
  if (envData) return path.resolve(envData);

  // In development, keep data inside the project for convenience.
  if (isDev) return path.join(APP_ROOT);

  const appName = 'ClaudeUI';
  let base: string;
  switch (process.platform) {
    case 'darwin':
      base = path.join(os.homedir(), 'Library', 'Application Support', appName);
      break;
    case 'win32':
      base = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
      break;
    default:
      base = process.env.XDG_DATA_HOME
        ? path.join(process.env.XDG_DATA_HOME, appName)
        : path.join(os.homedir(), '.local', 'share', appName);
  }
  return base;
}

/** Whether we're running from the dev source tree (not a packaged build). */
export const isDev = (() => {
  return fs.existsSync(path.join(APP_ROOT, 'frontend'))
    && fs.existsSync(path.join(APP_ROOT, 'backend'))
    && fs.existsSync(path.join(APP_ROOT, 'package.json'));
})();

const DATA_ROOT = findDataRoot();

export const PATHS = {
  root: APP_ROOT,
  dataRoot: DATA_ROOT,
  /** Frontend static assets (read-only resource). */
  frontendDist: path.join(APP_ROOT, isDev ? 'frontend' : 'web', 'dist'),
  /** Default workspace root where new projects are created. */
  workspace: path.join(DATA_ROOT, 'workspace'),
  configDir: path.join(DATA_ROOT, 'config'),
  configFile: path.join(DATA_ROOT, 'config', 'config.json'),
  logsDir: path.join(DATA_ROOT, 'logs'),
  serverLog: path.join(DATA_ROOT, 'logs', 'server.log'),
  claudeLog: path.join(DATA_ROOT, 'logs', 'claude.log'),
  errorLog: path.join(DATA_ROOT, 'logs', 'error.log'),
  dbFile: path.join(DATA_ROOT, 'config', 'data.db'),
  uploads: path.join(DATA_ROOT, 'workspace', '.uploads'),
} as const;

/** Ensure runtime directories exist. */
export function ensureDirs(): void {
  for (const dir of [PATHS.workspace, PATHS.configDir, PATHS.logsDir, PATHS.uploads]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
