import MarkdownIt from 'markdown-it';
import markdownItHighlightjs from 'markdown-it-highlightjs';
import mermaid from 'mermaid';

// Initialize mermaid once. Use 'strict' security level to prevent HTML/JS
// injection via malicious diagram sources (click directives etc.).
let mermaidInitialized = false;
function initMermaid(): void {
  if (mermaidInitialized) return;
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
  mermaidInitialized = true;
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});
md.use(markdownItHighlightjs);

// Counter for unique mermaid element ids (deterministic per render pass).
let mermaidSeq = 0;

// Custom mermaid code fence: render ```mermaid blocks into placeholder divs
// whose actual rendering is triggered after the DOM settles.
const defaultRender =
  md.renderer.rules.fence ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const info = token.info.trim();
  if (info === 'mermaid') {
    const id = `mermaid-${mermaidSeq++}`;
    const code = token.content;
    // Encode the source so it survives a round-trip through v-html without
    // breaking out of the attribute. The renderer picks it back up later.
    const encoded = encodeURIComponent(code);
    return `<div class="mermaid-placeholder" data-graph="${encoded}" data-rendered="0" id="${id}"><pre class="mermaid-fallback">${escapeHtml(code)}</pre></div>`;
  }
  return defaultRender(tokens, idx, options, env, self);
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Scan the given root element for unrendered mermaid placeholders and render
 * them. Called by MessageItem after its v-html settles (so we always target
 * the live DOM rather than stale nodes from intermediate re-renders).
 */
export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const placeholders = root.querySelectorAll<HTMLElement>(
    '.mermaid-placeholder[data-rendered="0"]',
  );
  if (placeholders.length === 0) return;
  initMermaid();
  for (const el of Array.from(placeholders)) {
    const raw = el.getAttribute('data-graph') || '';
    const code = decodeURIComponent(raw);
    try {
      const renderId = `${el.id}-svg`;
      const { svg } = await mermaid.render(renderId, code);
      el.innerHTML = svg;
      el.setAttribute('data-rendered', '1');
    } catch (err) {
      // Keep the fallback <pre> already inside the placeholder; mark rendered
      // so we don't retry on every pass.
      el.setAttribute('data-rendered', '1');
      const fallback = el.querySelector('.mermaid-fallback');
      if (fallback) {
        fallback.setAttribute(
          'style',
          'color: var(--danger); white-space: pre-wrap; font-size: 12px;',
        );
        fallback.textContent = `Mermaid 渲染失败: ${err instanceof Error ? err.message : String(err)}\n\n${code}`;
      }
    }
  }
}

export function renderMarkdown(text: string): string {
  return md.render(text);
}
