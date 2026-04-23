import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import DownloadMenu from './DownloadMenu.jsx';
import { downloadBlob } from '../utils/diagramExport.js';

let initialized = false;

export default function DiagramView({
  code,
  title,
  highlightStep,           // { fromId, toId, edgeIndex } | null
  components = [],
  filenameBase = 'architecture'
}) {
  const containerRef = useRef(null);
  const svgWrapRef = useRef(null);
  const [renderError, setRenderError] = useState('');
  const [renderId] = useState(() => `mmd-${Math.random().toString(36).slice(2, 10)}`);
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef(null);
  const dragAnchor = useRef({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const clampZoom = useCallback((value) => Math.max(0.35, Math.min(2.5, value)), []);
  const adjustZoom = useCallback((factor) => setZoom((z) => clampZoom(z * factor)), [clampZoom]);

  const fitDiagram = useCallback(() => {
    const svg = svgWrapRef.current?.querySelector('svg');
    const scroll = scrollRef.current;
    if (!svg || !scroll) return;
    const vb = svg.viewBox?.baseVal;
    const width = (vb?.width || svg.getBBox().width) || 1200;
    const height = (vb?.height || svg.getBBox().height) || 800;
    const padding = 80;
    const availableWidth = Math.max(1, scroll.clientWidth - padding);
    const availableHeight = Math.max(1, scroll.clientHeight - padding);
    setZoom(clampZoom(Math.min(availableWidth / width, availableHeight / height, 1)));
  }, [clampZoom]);

  useEffect(() => {
    setZoom(1);
    const id = window.setTimeout(fitDiagram, 50);
    return () => window.clearTimeout(id);
  }, [code, fitDiagram]);

  const onWheel = useCallback((event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    adjustZoom(factor);
  }, [adjustZoom]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button,input,select,textarea')) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    setDragging(true);
    dragAnchor.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (!dragging) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const dx = event.clientX - dragAnchor.current.startX;
    const dy = event.clientY - dragAnchor.current.startY;
    scroll.scrollLeft = dragAnchor.current.scrollLeft - dx;
    scroll.scrollTop = dragAnchor.current.scrollTop - dy;
  }, [dragging]);

  const handlePointerUp = useCallback((event) => {
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.addEventListener('wheel', onWheel, { passive: false });
    return () => scroll.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        fontFamily: 'system-ui, sans-serif',
        flowchart: {
          curve: 'basis',
          htmlLabels: false,    // SVG text never clips; foreignObject has fixed pixel boxes
          useMaxWidth: false,
          nodeSpacing: 70,
          rankSpacing: 90,
          padding: 24,
          diagramPadding: 32
        }
      });
      initialized = true;
    }
  }, []);

  useEffect(() => {
    if (!code) return;
    setRenderError('');
    let cancelled = false;
    (async () => {
      try {
        const { svg } = await mermaid.render(renderId, code);
        if (!cancelled && svgWrapRef.current) {
          svgWrapRef.current.innerHTML = svg;
          // Force the SVG root to never clip its content. Mermaid sets
          // height/width attributes that can cause overflow:hidden by default.
          const svgEl = svgWrapRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.overflow = 'visible';
            svgEl.removeAttribute('height');
            // Keep width:auto so the scroll container determines the layout
            svgEl.style.width = '100%';
            svgEl.style.minWidth = svgEl.getAttribute('width') || 'auto';
          }
        }
      } catch (e) {
        if (!cancelled) {
          setRenderError(e?.message || 'Mermaid failed to render this diagram.');
          if (svgWrapRef.current) svgWrapRef.current.innerHTML = '';
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code, renderId]);

  // Simulation highlight
  useEffect(() => {
    const wrap = svgWrapRef.current;
    if (!wrap) return;
    const svg = wrap.querySelector('svg');
    if (!svg) return;

    // clear previous
    svg.querySelectorAll('.archv-active-node, .archv-active-edge, .archv-dim').forEach((el) => {
      el.classList.remove('archv-active-node', 'archv-active-edge', 'archv-dim');
    });

    if (!highlightStep) return;

    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const fromComp = components.find((c) => c.id === highlightStep.fromId);
    const toComp = components.find((c) => c.id === highlightStep.toId);
    const fromSlug = fromComp ? slug(fromComp.name) : null;
    const toSlug = toComp ? slug(toComp.name) : null;

    // dim everything first
    svg.querySelectorAll('g.node, .edgePath, g.edgeLabel').forEach((el) => el.classList.add('archv-dim'));

    const findNode = (s) => {
      if (!s) return null;
      // mermaid v10 sets g.node id like "flowchart-<id>-<n>"
      return svg.querySelector(`g.node[id^="flowchart-${s}-"], g.node[id^="flowchart-${s}_"]`)
        || Array.from(svg.querySelectorAll('g.node')).find((g) => (g.id || '').includes(`-${s}-`));
    };

    const fromNode = findNode(fromSlug);
    const toNode = findNode(toSlug);
    [fromNode, toNode].forEach((n) => {
      if (n) { n.classList.remove('archv-dim'); n.classList.add('archv-active-node'); }
    });

    // edges: pick by index
    const edges = svg.querySelectorAll('.edgePath');
    const edge = edges[highlightStep.edgeIndex];
    if (edge) {
      edge.classList.remove('archv-dim');
      edge.classList.add('archv-active-edge');
    }
    // also un-dim its label
    const labels = svg.querySelectorAll('g.edgeLabel');
    const label = labels[highlightStep.edgeIndex];
    if (label) label.classList.remove('archv-dim');

    // Auto-scroll: keep the active simulation step always centred on screen
    // across both the inner diagram scroll container AND the page itself.
    requestAnimationFrame(() => {
      const scrollEl = wrap.closest('.diagram-scroll') || wrap.parentElement;
      if (!scrollEl) return;
      const activeEls = [fromNode, toNode, edge].filter(Boolean);
      if (!activeEls.length) return;

      // ① Instantly cancel every in-progress smooth animation so
      //    getBoundingClientRect() returns stable, accurate values.
      scrollEl.scrollTo({ left: scrollEl.scrollLeft, top: scrollEl.scrollTop, behavior: 'instant' });
      window.scrollTo(window.scrollX, window.scrollY); // 'instant' is the default

      // ② Read stable positions.
      const scrollRect = scrollEl.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      activeEls.forEach((el) => {
        const r = el.getBoundingClientRect();
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      });
      if (!isFinite(minX)) return;

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      // ③ Scroll the diagram container to centre the active node/edge.
      scrollEl.scrollTo({
        left: scrollEl.scrollLeft + cx - (scrollRect.left + scrollRect.width  / 2),
        top:  scrollEl.scrollTop  + cy - (scrollRect.top  + scrollRect.height / 2),
        behavior: 'smooth',
      });

      // ④ Also scroll the page so the diagram panel is fully in the viewport.
      //    This is needed on single-column / small-screen layouts where the
      //    output panel is not sticky and the user would otherwise have to
      //    manually scroll the page to see the diagram.
      const panelRect = scrollEl.getBoundingClientRect();
      const vh = window.innerHeight;
      if (panelRect.top < 0) {
        // Panel is above the viewport — scroll up to reveal it
        window.scrollTo({ top: window.scrollY + panelRect.top - 16, behavior: 'smooth' });
      } else if (panelRect.bottom > vh) {
        // Panel is below the viewport — scroll down to reveal it
        window.scrollTo({ top: window.scrollY + (panelRect.bottom - vh) + 16, behavior: 'smooth' });
      }
    });
  }, [highlightStep, components, code]);

  const downloadSvg = () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    downloadBlob(new Blob([xml], { type: 'image/svg+xml' }), `${filenameBase}.svg`);
  };

  // Rasterise the rendered SVG to a canvas at the given pixel scale, then
  // hand it back as a Blob in the requested image type. Uses the SVG's
  // intrinsic viewBox dimensions (not the on-screen size) so the export is
  // pixel-perfect regardless of zoom / scroll position.
  const rasterize = async ({ scale = 2, type = 'image/png', background = '#ffffff' } = {}) => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Prefer viewBox dimensions for crisp output that matches the diagram's
    // intrinsic aspect ratio rather than the scrolled DOM rect.
    let w, h;
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width && vb.height) {
      w = Math.ceil(vb.width); h = Math.ceil(vb.height);
    } else {
      const bbox = svg.getBoundingClientRect();
      w = Math.ceil(bbox.width || 1200); h = Math.ceil(bbox.height || 800);
    }
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);

    const xml = new XMLSerializer().serializeToString(clone);
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
  };

  const downloadPng = async (scale = 2) => {
    setDownloading(true);
    try {
      const blob = await rasterize({ scale, type: 'image/png' });
      if (blob) downloadBlob(blob, `${filenameBase}${scale > 2 ? `@${scale}x` : ''}.png`);
    } finally { setDownloading(false); }
  };

  const downloadJpg = async (scale = 2) => {
    setDownloading(true);
    try {
      const blob = await rasterize({ scale, type: 'image/jpeg', background: '#ffffff' });
      if (blob) downloadBlob(blob, `${filenameBase}.jpg`);
    } finally { setDownloading(false); }
  };

  const downloadMermaid = () => {
    if (!code) return;
    downloadBlob(new Blob([code], { type: 'text/plain' }), `${filenameBase}.mmd`);
  };

  const copyAsImage = async () => {
    try {
      const blob = await rasterize({ scale: 2, type: 'image/png' });
      if (!blob || !navigator.clipboard?.write) return;
      // eslint-disable-next-line no-undef
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch { /* clipboard not available */ }
  };

  // Open a print-friendly window with the SVG inlined; the user picks
  // "Save as PDF" from the system print dialog — vector-perfect PDF, no
  // distortion, no extra dependency.
  const printPdf = () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(clone);
    const w = window.open('', '_blank');
    if (!w) return;
    const safeTitle = (title || filenameBase || 'Diagram').replace(/</g, '&lt;');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
      <style>
        html,body{margin:0;padding:0;background:#fff;font-family:system-ui,sans-serif;color:#111;}
        h1{font-size:16px;margin:16px 24px 8px;}
        .wrap{padding:0 24px 24px;}
        svg{max-width:100%;height:auto;}
        @media print { h1 { display:none; } .wrap { padding: 0; } }
      </style></head><body>
      <h1>${safeTitle}</h1>
      <div class="wrap">${xml}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 400);
  };

  if (!code) {
    return <div className="diagram-empty">Generate a design to see the diagram here.</div>;
  }

  return (
    <div className="diagram-view" ref={containerRef}>
      <div className="diagram-header">
        {title && <h2 className="diagram-title">{title}</h2>}
        <div className="diagram-actions">
          <div className="diagram-zoom-controls">
            <button type="button" className="secondary-btn" onClick={() => adjustZoom(0.9)} disabled={zoom <= 0.35} title="Zoom out">−</button>
            <button type="button" className="secondary-btn" onClick={fitDiagram} title="Fit diagram to view">Fit</button>
            <button type="button" className="secondary-btn" onClick={() => adjustZoom(1.1)} disabled={zoom >= 2.5} title="Zoom in">+</button>
            <span className="diagram-zoom-label">{Math.round(zoom * 100)}%</span>
          </div>
          <DownloadMenu
            disabled={!!renderError || downloading}
            label={downloading ? 'Rendering…' : '⬇ Download'}
            actions={[
              { label: 'SVG (vector, lossless)', onClick: downloadSvg },
              { label: 'PNG — standard (2×)',     onClick: () => downloadPng(2) },
              { label: 'PNG — high-res (4×)',     onClick: () => downloadPng(4) },
              { label: 'JPG (white background)',    onClick: () => downloadJpg(2) },
              { label: 'Mermaid source (.mmd)',     onClick: downloadMermaid },
              { label: 'Print / Save as PDF',       onClick: printPdf }
            ]}
          />
          <button type="button" className="secondary-btn" onClick={copyAsImage} disabled={!!renderError || downloading}
            title="Copy diagram as PNG to clipboard">⧉ Copy</button>
        </div>
      </div>

      {renderError && (
        <div className="diagram-error">
          <strong>Diagram failed to render.</strong>
          <p>{renderError}</p>
          <pre className="code-block">{code}</pre>
        </div>
      )}

      <div
        className={`diagram-scroll${dragging ? ' is-dragging' : ''}`}
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div ref={svgWrapRef} className="diagram-svg" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} />
      </div>
    </div>
  );
}

