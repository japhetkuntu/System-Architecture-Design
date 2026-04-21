import React, { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { generateAdrMarkdown } from '../utils/adr.js';
import { buildHtmlBundle } from '../utils/htmlBundle.js';

// --- Tiny Markdown renderer for ADR preview ---------------------------------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderInline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?)]|$)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return out;
}

// Parses markdown and emits HTML. Mermaid fences get a placeholder div that
// we render into post-mount, and can be replaced inline. Returns { html, blocks }.
function markdownToHtml(md, { mermaidEnabled }) {
  const lines = md.split('\n');
  const html = [];
  const blocks = [];
  let i = 0, inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      const raw = buf.join('\n');
      if (lang === 'mermaid' && mermaidEnabled) {
        const id = `adr-merm-${blocks.length}`;
        blocks.push({ id, code: raw });
        html.push(`<div class="diagram mermaid-host" data-mermaid-id="${id}" id="host-${id}"><div class="mermaid-fallback">Rendering diagram…</div></div>`);
      } else {
        const code = escapeHtml(raw);
        html.push(`<pre class="adr-code${lang ? ' lang-' + lang : ''}"><code>${code}</code></pre>`);
      }
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) { closeList(); html.push('<hr/>'); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); html.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); i++; continue; }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${renderInline(li[1])}</li>`);
      i++; continue;
    }
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) { closeList(); html.push(`<blockquote>${renderInline(bq[1])}</blockquote>`); i++; continue; }
    if (line.trim() === '') { closeList(); i++; continue; }
    closeList();
    const buf = [line];
    i++;
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^[-*]\s/.test(lines[i])
      && !/^>\s?/.test(lines[i])
      && !/^```/.test(lines[i])
      && !/^\s*---+\s*$/.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    html.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  closeList();
  return { html: html.join('\n'), blocks };
}

// Initialise mermaid once.
let mermaidInited = false;
function initMermaid() {
  if (mermaidInited) return;
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
  mermaidInited = true;
}

async function renderMermaidBlocks(host, blocks) {
  if (!blocks.length) return;
  initMermaid();
  for (const b of blocks) {
    const el = host.querySelector(`#host-${b.id}`);
    if (!el) continue;
    try {
      const { svg } = await mermaid.render(`svg-${b.id}-${Date.now()}`, b.code);
      el.innerHTML = svg;
    } catch (e) {
      el.innerHTML = `<pre class="adr-code lang-mermaid"><code>${escapeHtml(b.code)}</code></pre>`
        + `<p class="muted" style="font-size:12px;">⚠ Mermaid render failed: ${escapeHtml(e.message || 'unknown error')}</p>`;
    }
  }
}

export default function AdrDialog({
  open, onClose,
  baseline, current, diff, allTypes,
  mermaid: mermaidCode, baselineMermaid, diffMermaid,
  filenameBase
}) {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState('Proposed');
  const [author, setAuthor] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [relatedAdrs, setRelatedAdrs] = useState('');
  const [reviewers, setReviewers] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState('rendered');
  const previewRef = useRef(null);

  const md = useMemo(() => {
    if (!open) return '';
    return generateAdrMarkdown({
      number: number || null,
      status, author,
      title: titleOverride || current.title,
      baseline, current, diff, allTypes,
      mermaid: mermaidCode, baselineMermaid, diffMermaid,
      alternatives, relatedAdrs, reviewers
    });
  }, [open, number, status, author, titleOverride, current, baseline, diff, allTypes, mermaidCode, baselineMermaid, diffMermaid, alternatives, relatedAdrs, reviewers]);

  const rendered = useMemo(
    () => open ? markdownToHtml(md, { mermaidEnabled: previewMode === 'rendered' }) : { html: '', blocks: [] },
    [open, md, previewMode]
  );

  useEffect(() => {
    if (!open || previewMode !== 'rendered' || !previewRef.current) return;
    renderMermaidBlocks(previewRef.current, rendered.blocks);
  }, [open, previewMode, rendered]);

  if (!open) return null;

  const filenameNum = number ? `${String(number).padStart(4, '0')}-` : '';

  const download = (ext = 'md') => {
    const blob = new Blob([md], { type: 'text/markdown' });
    triggerDownload(blob, `${filenameNum}${filenameBase}-adr.${ext}`);
  };

  const downloadHtml = async () => {
    // Render mermaid to SVG server-side (here: in-browser, off-DOM) and inline it.
    initMermaid();
    const { html, blocks } = markdownToHtml(md, { mermaidEnabled: true });
    const container = document.createElement('div');
    container.innerHTML = html;
    for (const b of blocks) {
      const el = container.querySelector(`#host-${b.id}`);
      if (!el) continue;
      try {
        const { svg } = await mermaid.render(`svg-dl-${b.id}-${Date.now()}`, b.code);
        el.innerHTML = svg;
      } catch {
        el.innerHTML = `<pre><code>${escapeHtml(b.code)}</code></pre>`;
      }
    }
    const bundle = buildHtmlBundle({ title: titleOverride || current.title || 'ADR', bodyHtml: container.innerHTML });
    const blob = new Blob([bundle], { type: 'text/html' });
    triggerDownload(blob, `${filenameNum}${filenameBase}-adr.html`);
  };

  const printPdf = async () => {
    initMermaid();
    const { html, blocks } = markdownToHtml(md, { mermaidEnabled: true });
    const container = document.createElement('div');
    container.innerHTML = html;
    for (const b of blocks) {
      const el = container.querySelector(`#host-${b.id}`);
      if (!el) continue;
      try {
        const { svg } = await mermaid.render(`svg-pdf-${b.id}-${Date.now()}`, b.code);
        el.innerHTML = svg;
      } catch {
        el.innerHTML = `<pre><code>${escapeHtml(b.code)}</code></pre>`;
      }
    }
    const bundle = buildHtmlBundle({ title: titleOverride || current.title || 'ADR', bodyHtml: container.innerHTML });
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(bundle);
    w.document.close();
    // Give images/svg a moment to lay out before print
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 400);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-label="Generate ADR" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Generate Architecture Decision Record</h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              {baseline
                ? 'Documents what changed between your baseline and the current design.'
                : 'No baseline captured — this will document the current architecture as a fresh decision.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="modal-body">
          <div className="adr-form">
            <label className="adr-field">
              <span>ADR number <em className="muted">(optional)</em></span>
              <input type="number" min="1" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 12" />
            </label>
            <label className="adr-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Proposed</option><option>Accepted</option><option>Deprecated</option>
                <option>Superseded</option><option>Rejected</option>
              </select>
            </label>
            <label className="adr-field">
              <span>Author</span>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
            </label>
            <label className="adr-field full">
              <span>Title <em className="muted">(defaults to diagram title)</em></span>
              <input type="text" value={titleOverride} onChange={(e) => setTitleOverride(e.target.value)} placeholder={current.title} />
            </label>
            <label className="adr-field full">
              <span>Alternatives considered <em className="muted">(Markdown)</em></span>
              <textarea
                rows={3}
                value={alternatives}
                onChange={(e) => setAlternatives(e.target.value)}
                placeholder={'e.g. "We considered Option B (monolith) but rejected it because…"'}
              />
            </label>
            <label className="adr-field">
              <span>Related ADRs <em className="muted">(one per line)</em></span>
              <textarea
                rows={2}
                value={relatedAdrs}
                onChange={(e) => setRelatedAdrs(e.target.value)}
                placeholder={'ADR-0003: Eventing backbone\n[ADR-0007](./0007-auth.md)'}
              />
            </label>
            <label className="adr-field">
              <span>Reviewers / sign-off <em className="muted">(one per line)</em></span>
              <textarea
                rows={2}
                value={reviewers}
                onChange={(e) => setReviewers(e.target.value)}
                placeholder={'Jane D. — platform lead\nKwame O. — security'}
              />
            </label>
          </div>

          <div className="adr-preview-wrap">
            <div className="adr-preview-head">
              <div className="btn-group btn-group-sm">
                <button type="button"
                  className={`secondary-btn small ${previewMode === 'rendered' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('rendered')}
                >👁 Rendered</button>
                <button type="button"
                  className={`secondary-btn small ${previewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('raw')}
                >{'</>'} Raw Markdown</button>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {md.split('\n').length} lines · {(new Blob([md]).size / 1024).toFixed(1)} KB
              </span>
            </div>
            {previewMode === 'rendered' ? (
              <div ref={previewRef}
                className="adr-preview adr-preview-rendered"
                dangerouslySetInnerHTML={{ __html: rendered.html }}
              />
            ) : (
              <pre className="adr-preview adr-preview-raw"><code>{md}</code></pre>
            )}
          </div>
        </div>

        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onClose}>Cancel</button>
          <div className="modal-foot-actions">
            <button type="button" className="secondary-btn" onClick={copy}>
              {copied ? '✓ Copied!' : '📋 Copy MD'}
            </button>
            <button type="button" className="secondary-btn" onClick={() => download('md')}>⬇ .md</button>
            <button type="button" className="secondary-btn" onClick={() => download('README.md')}>⬇ README.md</button>
            <button type="button" className="secondary-btn" onClick={downloadHtml}>⬇ HTML bundle</button>
            <button type="button" className="primary-btn small" onClick={printPdf}>🖨 Print / PDF</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
