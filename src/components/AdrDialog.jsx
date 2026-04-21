import React, { useMemo, useState } from 'react';
import { generateAdrMarkdown } from '../utils/adr.js';

// --- Tiny Markdown renderer for ADR preview ---------------------------------
// Supports exactly what adr.js emits: h1/h2/h3, **bold**, `inline code`,
// bullet lists ("- "), blockquotes ("> "), paragraphs, horizontal rules ("---"),
// and fenced ```mermaid / ```json / ``` blocks. No HTML-in-markdown, we
// escape all input first so this is safe against injection.
function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic single-asterisk (conservative)
  out = out.replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?)]|$)/g, '$1<em>$2</em>');
  return out;
}

function markdownToHtml(md) {
  const lines = md.split('\n');
  const html = [];
  let i = 0;
  let inList = false;
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      const code = escapeHtml(buf.join('\n'));
      html.push(`<pre class="adr-code${lang ? ' lang-' + lang : ''}"><code>${code}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*---+\s*$/.test(line)) { closeList(); html.push('<hr/>'); i++; continue; }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++; continue;
    }

    // Bullet list
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${renderInline(li[1])}</li>`);
      i++; continue;
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      html.push(`<blockquote>${renderInline(bq[1])}</blockquote>`);
      i++; continue;
    }

    // Blank line
    if (line.trim() === '') { closeList(); i++; continue; }

    // Paragraph — gather subsequent non-special lines
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
  return html.join('\n');
}

export default function AdrDialog({
  open, onClose,
  baseline, current, diff, allTypes,
  mermaid, baselineMermaid, diffMermaid,
  filenameBase
}) {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState('Proposed');
  const [author, setAuthor] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState('rendered'); // 'rendered' | 'raw'

  const md = useMemo(() => {
    if (!open) return '';
    return generateAdrMarkdown({
      number: number || null,
      status,
      author,
      title: titleOverride || current.title,
      baseline,
      current,
      diff,
      allTypes,
      mermaid,
      baselineMermaid,
      diffMermaid
    });
  }, [open, number, status, author, titleOverride, current, baseline, diff, allTypes, mermaid, baselineMermaid, diffMermaid]);

  const html = useMemo(() => (open ? markdownToHtml(md) : ''), [open, md]);

  if (!open) return null;

  const download = (ext = 'md') => {
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const numPart = number ? `${String(number).padStart(4, '0')}-` : '';
    a.href = url;
    a.download = `${numPart}${filenameBase}-adr.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
              <input
                type="number"
                min="1"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="e.g. 12"
              />
            </label>
            <label className="adr-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Proposed</option>
                <option>Accepted</option>
                <option>Deprecated</option>
                <option>Superseded</option>
                <option>Rejected</option>
              </select>
            </label>
            <label className="adr-field">
              <span>Author</span>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="adr-field full">
              <span>Title <em className="muted">(defaults to diagram title)</em></span>
              <input
                type="text"
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder={current.title}
              />
            </label>
          </div>

          <div className="adr-preview-wrap">
            <div className="adr-preview-head">
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className={`secondary-btn small ${previewMode === 'rendered' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('rendered')}
                >👁 Rendered</button>
                <button
                  type="button"
                  className={`secondary-btn small ${previewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('raw')}
                >{'</>'} Raw Markdown</button>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {md.split('\n').length} lines · {(new Blob([md]).size / 1024).toFixed(1)} KB
              </span>
            </div>
            {previewMode === 'rendered' ? (
              <div
                className="adr-preview adr-preview-rendered"
                dangerouslySetInnerHTML={{ __html: html }}
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
              {copied ? '✓ Copied!' : '📋 Copy Markdown'}
            </button>
            <button type="button" className="secondary-btn" onClick={() => download('md')}>
              ⬇ Download .md
            </button>
            <button type="button" className="primary-btn small" onClick={() => download('README.md')}>
              ⬇ Download as README.md
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
