import React from 'react';

export default function LayoutControls({
  layoutDir, setLayoutDir,
  useSubgraphs, setUseSubgraphs
}) {
  return (
    <div className="layout-controls" role="group" aria-label="Diagram layout">
      <div className="btn-group btn-group-sm" title="Layout direction">
        <button type="button"
          className={`secondary-btn small ${layoutDir === 'LR' ? 'active' : ''}`}
          onClick={() => setLayoutDir('LR')}
          title="Left-to-right flow"
          aria-pressed={layoutDir === 'LR'}
        >→ LR</button>
        <button type="button"
          className={`secondary-btn small ${layoutDir === 'TB' ? 'active' : ''}`}
          onClick={() => setLayoutDir('TB')}
          title="Top-to-bottom flow"
          aria-pressed={layoutDir === 'TB'}
        >↓ TB</button>
      </div>
      <label className="subgraph-toggle" title="Group components by domain (Clients / Backend / Data / …)">
        <input
          type="checkbox"
          checked={!!useSubgraphs}
          onChange={(e) => setUseSubgraphs(e.target.checked)}
        />
        <span>Group by domain</span>
      </label>
    </div>
  );
}
