import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let initialized = false;

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

  const downloadPng = async () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    setDownloading(true);
    try {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const bbox = svg.getBoundingClientRect();
      const w = Math.ceil(bbox.width || 1200);
      const h = Math.ceil(bbox.height || 800);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      const xml = new XMLSerializer().serializeToString(clone);
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = dataUrl;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${filenameBase}.png`);
      }, 'image/png');
    } finally {
      setDownloading(false);
    }
  };

  if (!code) {
    return <div className="diagram-empty">Generate a design to see the diagram here.</div>;
  }

  return (
    <div className="diagram-view" ref={containerRef}>
      <div className="diagram-header">
        {title && <h2 className="diagram-title">{title}</h2>}
        <div className="diagram-actions">
          <button type="button" className="secondary-btn" onClick={downloadSvg} disabled={!!renderError}>
            Download SVG
          </button>
          <button type="button" className="secondary-btn" onClick={downloadPng} disabled={!!renderError || downloading}>
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
        </div>
      </div>

      {renderError && (
        <div className="diagram-error">
          <strong>Diagram failed to render.</strong>
          <p>{renderError}</p>
          <pre className="code-block">{code}</pre>
        </div>
      )}

      <div className="diagram-scroll">
        <div ref={svgWrapRef} className="diagram-svg" />
      </div>
    </div>
  );
}
