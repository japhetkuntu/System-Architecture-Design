// Standalone HTML bundle generator for ADRs with inlined SVG diagrams.
// Takes a rendered-markdown HTML body and wraps it in a print-friendly document.
export function buildHtmlBundle({ title, bodyHtml }) {
  const style = `
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 880px; margin: 32px auto; padding: 0 24px; color: #1f2937; line-height: 1.6; }
    h1 { font-size: 28px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    h2 { font-size: 20px; margin-top: 1.6em; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    h3 { font-size: 15px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
    pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 3px solid #e5e7eb; color: #6b7280; padding: 4px 12px; margin: 0.6em 0; }
    ul { padding-left: 22px; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 2em 0; }
    .diagram { margin: 1em 0; }
    .diagram svg { max-width: 100%; height: auto; }
    @media print {
      body { margin: 0; padding: 16mm; }
      .print-hide { display: none; }
    }
    .print-hide { position: fixed; top: 12px; right: 12px; background: #1f2937; color: white; padding: 8px 14px; border-radius: 999px; text-decoration: none; font-size: 13px; }
  `;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${style}</style>
</head><body>
<a class="print-hide" href="javascript:window.print()">🖨 Print / Save as PDF</a>
${bodyHtml}
</body></html>`;
}

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
