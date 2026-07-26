import type {
  Project,
  SessionRecord,
  AppConfig,
  FileNode,
  GitStatus,
  GitLogEntry,
} from '@/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Fastify rejects empty bodies with Content-Type: application/json.
  // Only attach an empty JSON body for methods that typically send one.
  const method = (init?.method || 'GET').toUpperCase();
  const needsJsonBody = !['GET', 'HEAD'].includes(method);
  const finalInit: RequestInit = { ...init };

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  };

  if (needsJsonBody) {
    if (!finalInit.body) {
      finalInit.body = JSON.stringify({});
    }
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(url, {
    ...finalInit,
    headers,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Projects
  listProjects: () => request<{ projects: Project[] }>('/api/projects'),
  getProject: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),
  createProject: (body: { name?: string; path?: string; dirName?: string }) =>
    request<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Sessions
  listSessions: (projectId?: string) =>
    request<{ sessions: SessionRecord[] }>(`/api/session${projectId ? `?projectId=${projectId}` : ''}`),
  createSession: (body: { projectId: string; title?: string; cliSessionId?: string }) =>
    request<{ session: SessionRecord }>('/api/session', { method: 'POST', body: JSON.stringify(body) }),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/api/session/${id}`, { method: 'DELETE' }),
  interruptSession: (id: string) =>
    request<{ ok: boolean }>(`/api/session/${id}/interrupt`, { method: 'POST' }),
  renameSession: (id: string, title: string) =>
    request<{ session: SessionRecord }>(`/api/session/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  // Config
  getConfig: () => request<{ config: AppConfig }>('/api/config'),
  saveConfig: (body: Partial<AppConfig>) =>
    request<{ config: AppConfig }>('/api/config', { method: 'PUT', body: JSON.stringify(body) }),
  detectClaude: () => request<{ claudePath: string }>('/api/config/detect-claude', { method: 'POST' }),

  // Files
  getTree: (projectId: string, depth = 4) =>
    request<{ tree: FileNode }>(`/api/projects/${projectId}/tree?depth=${depth}`),
  readFile: (projectId: string, path: string) =>
    request<{ content: string; path: string; size: number }>(
      `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (projectId: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
  deleteFile: (projectId: string, path: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),
  createDir: (projectId: string, path: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/dir`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  revealProject: (projectId: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/reveal`, { method: 'POST' }),
  browse: (dir?: string) =>
    request<{ current: string; parent: string | null; dirs: Array<{ name: string; path: string }> }>(
      `/api/browse${dir ? `?path=${encodeURIComponent(dir)}` : ''}`,
    ),
  revealFile: (projectId: string, path: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/reveal-file`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  // Git
  gitStatus: (projectId: string) =>
    request<{ status: GitStatus }>(`/api/projects/${projectId}/git/status`),
  gitDiff: (projectId: string, opts: { cached?: boolean; file?: string; head?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.cached) params.set('cached', '1');
    if (opts.file) params.set('file', opts.file);
    if (opts.head !== undefined) params.set('head', '1');
    return request<{ diff: string }>(`/api/projects/${projectId}/git/diff?${params.toString()}`);
  },
  gitLog: (projectId: string) =>
    request<{ log: GitLogEntry[] }>(`/api/projects/${projectId}/git/log`),
  gitShow: (projectId: string, ref: string, file: string) =>
    request<{ content: string }>(
      `/api/projects/${projectId}/git/show?ref=${encodeURIComponent(ref)}&file=${encodeURIComponent(file)}`,
    ),
  gitAdd: (projectId: string, files: string[]) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/git/add`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
  gitCommit: (projectId: string, message: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/git/commit`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  gitInit: (projectId: string) =>
    request<{ ok: boolean }>(`/api/projects/${projectId}/git/init`, { method: 'POST' }),

  // Uploads
  uploadFile: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`/api/projects/${projectId}/upload`, { method: 'POST', body: form }).then((r) => r.json());
  },

  // Logs
  listLogs: () => request<{ logs: Array<{ name: string; path: string; size: number }> }>('/api/logs'),
  getLog: (name: string, lines = 500) =>
    request<{ name: string; content: string }>(`/api/logs/${name}?lines=${lines}`),
  clearLog: (name: string) =>
    request<{ ok: boolean }>(`/api/logs/${name}`, { method: 'DELETE' }),
};
