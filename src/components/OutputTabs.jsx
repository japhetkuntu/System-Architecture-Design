import React, { useEffect, useState } from 'react';
import DiagramView from './DiagramView.jsx';
import MermaidCode from './MermaidCode.jsx';
import CanvasView from './CanvasView.jsx';

/**
 * The interactive canvas IS the diagram. We no longer keep a separate
 * "auto-layout" Mermaid tab — the user clicks "✨ Auto-arrange" inside the
 * canvas instead. Mermaid is preserved as exportable code, and the Diff
 * tab is shown only when there's a baseline to compare against.
 */
export default function OutputTabs({
  title, mermaid, diffMermaid, hasBaseline, forceTab,
  components, connections, allTypes, highlightStep, filenameBase,
  // canvas wiring
  onAddComponent, onUpdateComponent, onSetComponentPosition, onAddConnection, onUpdateConnection,
  onReorderConnection,
  onRemoveComponent, onRemoveConnection,
  onSelectComponent, onSelectConnection,
  selectedComponentIds,
  onAutoLayout, onResetPositions
}) {
  const [active, setActive] = useState('canvas');

  useEffect(() => {
    if (forceTab) setActive(forceTab);
  }, [forceTab]);

  const tabs = [
    { id: 'canvas', label: '🎨 Diagram' },
    ...(hasBaseline ? [{ id: 'diff', label: '🔍 Diff' }] : []),
    { id: 'code', label: '📄 Mermaid code' }
  ];

  useEffect(() => {
    if (!hasBaseline && active === 'diff') setActive('canvas');
  }, [hasBaseline, active]);

  return (
    <section className="output-tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={`tab ${active === t.id ? 'active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel">
        {active === 'canvas' && (
          <CanvasView
            components={components}
            connections={connections}
            allTypes={allTypes}
            highlightStep={highlightStep}
            onAddComponent={onAddComponent}
            onUpdateComponent={onUpdateComponent}
            onSetComponentPosition={onSetComponentPosition}
            onAddConnection={onAddConnection}
            onUpdateConnection={onUpdateConnection}
            onReorderConnection={onReorderConnection}
            onRemoveComponent={onRemoveComponent}
            onRemoveConnection={onRemoveConnection}
            onSelectComponent={onSelectComponent}
            onSelectConnection={onSelectConnection}
            selectedComponentIds={selectedComponentIds}
            onAutoLayout={onAutoLayout}
            onResetPositions={onResetPositions}
          />
        )}
        {active === 'diff' && hasBaseline && (
          <DiagramView
            code={diffMermaid}
            title={`${title} — diff vs baseline`}
            components={components}
            filenameBase={`${filenameBase}-diff`}
          />
        )}
        {active === 'code' && <MermaidCode code={active === 'code' ? mermaid : ''} />}
      </div>
    </section>
  );
}
