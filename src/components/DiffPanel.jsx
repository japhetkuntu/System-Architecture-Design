import React from 'react';

function fieldLabel(f) {
  return ({
    type: 'Type', name: 'Name', notes: 'Notes', icon: 'Icon', color: 'Color',
    fromId: 'From', toId: 'To', kind: 'Kind', label: 'Label'
  })[f] || f;
}

function compName(comp, allTypes) {
  if (!comp) return '(none)';
  const def = allTypes[comp.type];
  return `${comp.icon || def?.icon || ''} ${comp.name || def?.label || comp.id}`.trim();
}

function connDesc(conn, components, allTypes) {
  const f = components.find((c) => c.id === conn.fromId);
  const t = components.find((c) => c.id === conn.toId);
  const lbl = conn.label ? ` (“${conn.label}”)` : '';
  return `${compName(f, allTypes)} → ${compName(t, allTypes)} · ${conn.kind}${lbl}`;
}

export default function DiffPanel({ diff, baseline, components, allTypes, onClear, onRestore, onCapture }) {
  if (!baseline) {
    return (
      <div className="diff-panel">
        <h3 className="panel-title">Compare versions</h3>
        <p className="panel-hint">
          Capture the current architecture as the <strong>baseline</strong>, then make your changes.
          Once you do, you'll see exactly what was added, removed, or modified.
        </p>
        <button type="button" className="primary-btn small" onClick={onCapture}>
          📸 Capture current as baseline
        </button>
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Tip: To compare an existing architecture against an updated one, first import the old
          file as the baseline, then import or edit the new one.
        </p>
      </div>
    );
  }

  if (!diff) return null;

  const cAdded = diff.components.added;
  const cRemoved = diff.components.removed;
  const cModified = diff.components.modified;
  const eAdded = diff.connections.added;
  const eRemoved = diff.connections.removed;
  const eModified = diff.connections.modified;

  const totalChanges =
    cAdded.length + cRemoved.length + cModified.length +
    eAdded.length + eRemoved.length + eModified.length +
    (diff.title ? 1 : 0);

  // Combined list of components for connection descriptions (baseline ∪ current)
  const allComps = [
    ...baseline.components,
    ...components.filter((c) => !baseline.components.find((b) => b.id === c.id))
  ];

  return (
    <div className="diff-panel">
      <header className="diff-head">
        <div>
          <h3 className="panel-title">Diff vs baseline</h3>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
            Baseline: <strong>{baseline.title}</strong>
            {baseline.capturedAt && ` · ${new Date(baseline.capturedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="diff-actions">
          <button type="button" className="link-btn" onClick={onRestore}>↩ Restore baseline</button>
          <button type="button" className="link-btn" onClick={onClear}>Clear baseline</button>
        </div>
      </header>

      {totalChanges === 0 ? (
        <p className="muted">No changes yet — current architecture matches the baseline exactly.</p>
      ) : (
        <p className="diff-summary">
          <span className="badge added">+{cAdded.length + eAdded.length}</span>
          <span className="badge removed">−{cRemoved.length + eRemoved.length}</span>
          <span className="badge modified">~{cModified.length + eModified.length}</span>
          <span className="muted"> across {totalChanges} change{totalChanges === 1 ? '' : 's'}</span>
        </p>
      )}

      {diff.title && (
        <section className="diff-section">
          <h4>Title</h4>
          <div className="diff-row modified">
            <span className="strike">{diff.title.from}</span>
            <span className="diff-arrow">→</span>
            <strong>{diff.title.to}</strong>
          </div>
        </section>
      )}

      {(cAdded.length || cRemoved.length || cModified.length) > 0 && (
        <section className="diff-section">
          <h4>Components</h4>
          {cAdded.map((c) => (
            <div key={`ca-${c.id}`} className="diff-row added">
              <span className="diff-tag">+ added</span>
              <span>{compName(c, allTypes)}</span>
            </div>
          ))}
          {cRemoved.map((c) => (
            <div key={`cr-${c.id}`} className="diff-row removed">
              <span className="diff-tag">− removed</span>
              <span className="strike">{compName(c, allTypes)}</span>
            </div>
          ))}
          {cModified.map((m) => (
            <div key={`cm-${m.after.id}`} className="diff-row modified">
              <span className="diff-tag">~ modified</span>
              <div className="diff-row-body">
                <strong>{compName(m.after, allTypes)}</strong>
                <ul className="diff-changes">
                  {Object.entries(m.changes).map(([f, v]) => (
                    <li key={f}>
                      <em>{fieldLabel(f)}:</em>{' '}
                      <span className="strike">{String(v.from || '∅')}</span>{' '}
                      <span className="diff-arrow">→</span>{' '}
                      <strong>{String(v.to || '∅')}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>
      )}

      {(eAdded.length || eRemoved.length || eModified.length) > 0 && (
        <section className="diff-section">
          <h4>Connections</h4>
          {eAdded.map((e) => (
            <div key={`ea-${e.id}`} className="diff-row added">
              <span className="diff-tag">+ added</span>
              <span>{connDesc(e, allComps, allTypes)}</span>
            </div>
          ))}
          {eRemoved.map((e) => (
            <div key={`er-${e.id}`} className="diff-row removed">
              <span className="diff-tag">− removed</span>
              <span className="strike">{connDesc(e, allComps, allTypes)}</span>
            </div>
          ))}
          {eModified.map((m) => (
            <div key={`em-${m.after.id}`} className="diff-row modified">
              <span className="diff-tag">~ modified</span>
              <div className="diff-row-body">
                <strong>{connDesc(m.after, allComps, allTypes)}</strong>
                <ul className="diff-changes">
                  {Object.entries(m.changes).map(([f, v]) => (
                    <li key={f}>
                      <em>{fieldLabel(f)}:</em>{' '}
                      <span className="strike">{String(v.from || '∅')}</span>{' '}
                      <span className="diff-arrow">→</span>{' '}
                      <strong>{String(v.to || '∅')}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
