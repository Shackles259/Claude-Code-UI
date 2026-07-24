import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PATHS } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
export type Theme = 'light' | 'dark';

export interface AppConfig {
  /** Path to the claude executable. Auto-detected if empty. */
  claudePath: string;
  /** Default workspace root that new projects are created under. */
  workspaceRoot: string;
  /** Default model alias passed via --model (empty = use CLI's current model, e.g. GLM-5.2). */
  model: string;
  /** Default permission mode for new sessions. */
  permissionMode: PermissionMode;
  /** UI theme. */
  theme: Theme;
  /** Editor font size. */
  fontSize: number;
  /** Extra args appended to every claude spawn (e.g. extra MCP configs). */
  extraArgs: string[];
}

const DEFAULT_CONFIG: AppConfig = {
  claudePath: '',
  workspaceRoot: PATHS.workspace,
  model: '',
  permissionMode: 'acceptEdits',
  theme: 'dark',
  fontSize: 14,
  extraArgs: [],
};

let cached: AppConfig | null = null;

/** Detect the claude executable path using platform-appropriate lookup. */
export function detectClaudePath(): string {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(cmd, ['claude'], { encoding: 'utf8' });
    const first = out.split('\n').map((s) => s.trim()).filter(Boolean)[0];
    return first || '';
  } catch {
    return '';
  }
}

export function loadConfig(): AppConfig {
  if (cached) return cached;
  let conf: AppConfig;
  try {
    if (fs.existsSync(PATHS.configFile)) {
      const raw = fs.readFileSync(PATHS.configFile, 'utf8');
      const parsed = JSON.parse(raw);
      conf = { ...DEFAULT_CONFIG, ...parsed };
    } else {
      conf = { ...DEFAULT_CONFIG };
    }
  } catch (err) {
    logger.error('Failed to load config, using defaults', { error: String(err) });
    conf = { ...DEFAULT_CONFIG };
  }
  // Auto-detect claude path if not set
  if (!conf.claudePath) {
    const detected = detectClaudePath();
    if (detected) {
      conf.claudePath = detected;
      logger.info('Auto-detected claude path', { path: detected });
    }
  }
  cached = conf;
  return conf;
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const next: AppConfig = { ...current, ...patch };
  fs.mkdirSync(PATHS.configDir, { recursive: true });
  fs.writeFileSync(PATHS.configFile, JSON.stringify(next, null, 2), 'utf8');
  cached = next;
  logger.info('Config updated', { patch });
  return next;
}

export function getClaudeBin(): string {
  const cfg = loadConfig();
  return cfg.claudePath || 'claude';
}
