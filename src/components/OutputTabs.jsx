import React, { useEffect, useMemo, useState } from 'react';
import DiagramView from './DiagramView.jsx';
import MermaidCode from './MermaidCode.jsx';
import CanvasView from './CanvasView.jsx';
import { buildAllSequenceDiagrams } from '../utils/uml.js';

/**
 * The interactive canvas IS the diagram. We no longer keep a separate
 * "auto-layout" Mermaid tab — the user clicks "✨ Auto-arrange" inside the
 * canvas instead. Mermaid is preserved as exportable code, and the Diff
 * tab is shown only when there's a baseline to compare against.
 */
export default function OutputTabs({
  title, mermaid, diffMermaid, hasBaseline, forceTab,
  components, connections, allTypes, highlightStep, filenameBase,
  layoutDir, useSubgraphs,
  // canvas wiring
  onAddComponent, onUpdateComponent, onSetComponentPosition, onAddConnection, onUpdateConnection,
  onReorderConnection,
  onRemoveComponent, onRemoveConnection,
  onSelectComponent, onSelectConnection,
  selectedComponentIds,
  onAutoLayout, onResetPositions,
  // fullscreen / focus mode
  focusMode, onToggleFocusMode
}) {
  const [active, setActive] = useState('canvas');
  const [activeFlowId, setActiveFlowId] = useState(null);

  useEffect(() => {
    if (forceTab) setActive(forceTab);
  }, [forceTab]);

  const sequenceDiagrams = useMemo(
    () => buildAllSequenceDiagrams({ components, connections, allTypes }),
    [components, connections, allTypes]
  );

  const tabs = [
    { id: 'canvas', label: '🎨 Diagram' },
    ...(sequenceDiagrams.length > 0 ? [{ id: 'sequences', label: `🔄 Sequences (${sequenceDiagrams.length})` }] : []),
    ...(hasBaseline ? [{ id: 'diff', label: '🔍 Diff' }] : []),
    { id: 'code', label: '📄 Mermaid code' }
  ];

  useEffect(() => {
    if (!hasBaseline && active === 'diff') setActive('canvas');
    if (active === 'sequences' && sequenceDiagrams.length === 0) setActive('canvas');
  }, [hasBaseline, active, sequenceDiagrams.length]);

  // Keep activeFlowId pointed at a real flow.
  useEffect(() => {
    if (!sequenceDiagrams.length) { setActiveFlowId(null); return; }
    if (!activeFlowId || !sequenceDiagrams.find((f) => f.id === activeFlowId)) {
      setActiveFlowId(sequenceDiagrams[0].id);
    }
  }, [sequenceDiagrams, activeFlowId]);

  const activeFlow = sequenceDiagrams.find((f) => f.id === activeFlowId) || sequenceDiagrams[0];

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
        {onToggleFocusMode && (
          <button
            type="button"
            className="tab tab--icon"
            onClick={onToggleFocusMode}
            title={focusMode ? 'Exit fullscreen (Esc / F)' : 'Fullscreen diagram (F)'}
            aria-label={focusMode ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {focusMode ? '✕ Exit fullscreen' : '⛶ Fullscreen'}
          </button>
        )}
      </div>
      <div className="tab-panel">
        {active === 'canvas' && (
          <CanvasView
            components={components}
            connections={connections}
            allTypes={allTypes}
            highlightStep={highlightStep}
            layoutDir={layoutDir}
            useSubgraphs={useSubgraphs}
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
        {active === 'sequences' && activeFlow && (
          <div className="sequences-view">
            <div className="sequences-toolbar">
              <label className="sequences-label">Flow:</label>
              <select
                className="sequences-select"
                value={activeFlow.id}
                onChange={(e) => setActiveFlowId(e.target.value)}
              >
                {sequenceDiagrams.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.stepCount} step{f.stepCount === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
              <span className="sequences-hint">
                Auto-detected from connections starting at <strong>{activeFlow.name}</strong>.
              </span>
            </div>
            <DiagramView
              key={activeFlow.id}
              code={activeFlow.mermaid}
              title={`${title} — ${activeFlow.name} (sequence)`}
              components={components}
              filenameBase={`${filenameBase}-sequence-${activeFlow.id}`}
            />
          </div>
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
