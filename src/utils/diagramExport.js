// Reusable diagram export helpers.
//
// Centralises the logic that DiagramView used to own privately so that the
// top-level App header can offer a unified "⬇ Download" menu (JSON, SVG,
// PNG, JPG, PDF, Mermaid source) without round-tripping through the
// rendered diagram component. Also used internally by DiagramView itself.

import mermaid from 'mermaid';

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    fontFamily: 'system-ui, sans-serif',
    flowchart: {
      curve: 'basis',
      htmlLabels: false,
      useMaxWidth: false,
      nodeSpacing: 70,
      rankSpacing: 90,
      padding: 24,
      diagramPadding: 32
    }
  });
  initialized = true;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Render a mermaid source string into an SVG string (off-screen).
export async function renderMermaidSvg(code) {
  ensureInit();
  const id = `mmd-export-${Math.random().toString(36).slice(2, 10)}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}

// Rasterise an SVG string to a PNG/JPEG Blob at the given pixel scale.
export async function rasterizeSvg(svgString, { scale = 2, type = 'image/png', background = '#ffffff' } = {}) {
  // Parse to a DOM SVG so we can read its viewBox/dimensions.
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  let w, h;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width && vb.height) {
    w = Math.ceil(vb.width); h = Math.ceil(vb.height);
  } else {
    w = parseInt(svg.getAttribute('width') || '1200', 10) || 1200;
    h = parseInt(svg.getAttribute('height') || '800', 10) || 800;
  }
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  const xml = new XMLSerializer().serializeToString(svg);
  const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise((res) => canvas.toBlob(res, type, type === 'image/jpeg' ? 0.95 : undefined));
}

// Open a print-friendly window with an SVG inlined; the user picks
// "Save as PDF" from the system print dialog. Vector-perfect, no deps.
export function printSvg(svgString, title) {
  const w = window.open('', '_blank');
  if (!w) return;
  const safeTitle = String(title || 'Diagram').replace(/</g, '&lt;');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
    <style>
      html,body{margin:0;padding:0;background:#fff;font-family:system-ui,sans-serif;color:#111;}
      h1{font-size:16px;margin:16px 24px 8px;}
      .wrap{padding:0 24px 24px;}
      svg{max-width:100%;height:auto;}
      @media print { h1 { display:none; } .wrap { padding: 0; } }
    </style></head><body>
    <h1>${safeTitle}</h1>
    <div class="wrap">${svgString}</div>
    </body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 400);
}

// One-shot helpers used by the App header's "Download" menu. Each takes the
// raw mermaid source and a filename base; renders, exports, downloads.

export async function exportDiagramAsSvg(code, filenameBase) {
  const svg = await renderMermaidSvg(code);
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
  downloadBlob(new Blob([xml], { type: 'image/svg+xml' }), `${filenameBase}.svg`);
}

export async function exportDiagramAsPng(code, filenameBase, scale = 2) {
  const svg = await renderMermaidSvg(code);
  const blob = await rasterizeSvg(svg, { scale, type: 'image/png' });
  if (blob) downloadBlob(blob, `${filenameBase}${scale > 2 ? `@${scale}x` : ''}.png`);
}

export async function exportDiagramAsJpg(code, filenameBase, scale = 2) {
  const svg = await renderMermaidSvg(code);
  const blob = await rasterizeSvg(svg, { scale, type: 'image/jpeg', background: '#ffffff' });
  if (blob) downloadBlob(blob, `${filenameBase}.jpg`);
}

export async function exportDiagramAsPdf(code, title) {
  const svg = await renderMermaidSvg(code);
  printSvg(svg, title);
}

export function exportMermaidSource(code, filenameBase) {
  downloadBlob(new Blob([code], { type: 'text/plain' }), `${filenameBase}.mmd`);
}
