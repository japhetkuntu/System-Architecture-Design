import React, { useEffect, useState } from 'react';
import DiagramView from './DiagramView.jsx';
import MermaidCode from './MermaidCode.jsx';

export default function OutputTabs({
  title, mermaid, diffMermaid, hasBaseline, forceTab,
  components, highlightStep, filenameBase
}) {
  const [active, setActive] = useState('diagram');

  useEffect(() => {
    if (forceTab) setActive(forceTab);
  }, [forceTab]);

  const tabs = [
    { id: 'diagram', label: 'Diagram' },
    ...(hasBaseline ? [{ id: 'diff', label: 'Diff diagram' }] : []),
    { id: 'code', label: 'Mermaid Code' }
  ];

  // Don't show diff tab as active if it doesn't exist anymore
  useEffect(() => {
    if (!hasBaseline && active === 'diff') setActive('diagram');
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
        {active === 'diagram' && (
          <DiagramView
            code={mermaid}
            title={title}
            components={components}
            highlightStep={highlightStep}
            filenameBase={filenameBase}
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
