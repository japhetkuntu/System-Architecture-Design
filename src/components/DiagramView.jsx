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
        fontFamily: 'system-ui',
        flowchart: {
          curve: 'basis',
          htmlLabels: true,
          useMaxWidth: false,
          nodeSpacing: 70,      // horizontal gap between sibling nodes
          rankSpacing: 90,      // gap between ranks (rows / columns)
          padding: 20,          // padding around each node
          diagramPadding: 24    // padding around the whole diagram
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
