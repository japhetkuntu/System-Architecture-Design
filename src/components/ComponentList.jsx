import React from 'react';

export default function ComponentList({ components, allTypes, onUpdate, onRemove }) {
  if (!components.length) {
    return (
      <section className="component-list empty">
        <p className="muted">No components yet. Pick one above to begin building.</p>
      </section>
    );
  }

  return (
    <section className="component-list">
      <h3 className="panel-title">Your components ({components.length})</h3>
      <div className="comp-grid">
        {components.map((c) => {
          const def = allTypes[c.type];
          const accent = c.color || def?.color || '#999';
          return (
            <div key={c.id} className="comp-card" style={{ borderLeftColor: accent }}>
              <header className="comp-card-head">
                <span className="comp-icon">{c.icon || def?.icon}</span>
                <span className="comp-type">{def?.label || c.type}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onRemove(c.id)}
                  title="Remove"
                  aria-label="Remove component"
                >×</button>
              </header>
              <input
                type="text"
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                placeholder="Component name (e.g. Identity API)"
                className="comp-name"
              />
              <input
                type="text"
                value={c.notes}
                onChange={(e) => onUpdate(c.id, { notes: e.target.value })}
                placeholder="Optional note (e.g. Kafka topic)"
                className="comp-notes"
              />
              <div className="comp-extras">
                <label className="extra">
                  <span>Icon</span>
                  <input
                    type="text"
                    value={c.icon}
                    onChange={(e) => onUpdate(c.id, { icon: e.target.value })}
                    placeholder={def?.icon || '🧩'}
                    maxLength={4}
                    className="emoji-input"
                  />
                </label>
                <label className="extra">
                  <span>Color</span>
                  <input
                    type="color"
                    value={c.color || def?.color || '#475569'}
                    onChange={(e) => onUpdate(c.id, { color: e.target.value })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
