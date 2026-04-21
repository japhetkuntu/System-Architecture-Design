import React from 'react';
import { makeDragHandlers } from '../utils/dnd.js';

export default function ComponentList({
  components,
  allTypes,
  onUpdate,
  onRemove,
  onReorder,
  selectedIds = new Set(),
  onToggleSelect,
  onClearSelection,
  onBulkRemove,
  onBulkColor
}) {
  if (!components.length) {
    return (
      <section className="component-list empty">
        <div className="empty-state small">
          <p>No components yet. Pick one above to begin building.</p>
        </div>
      </section>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <section className="component-list">
      <div className="comp-list-head">
        <h3 className="panel-title">
          Your components <span className="pill pill-count">{components.length}</span>
        </h3>
        {selectedCount > 0 && (
          <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
            <span className="bulk-count">{selectedCount} selected</span>
            <input
              type="color"
              onChange={(e) => onBulkColor && onBulkColor(e.target.value)}
              title="Recolor selected"
              aria-label="Recolor selected components"
              className="bulk-color"
            />
            <button
              type="button"
              className="danger-btn small"
              onClick={() => onBulkRemove && onBulkRemove()}
              title="Delete selected components"
            >🗑 Delete {selectedCount}</button>
            <button
              type="button"
              className="link-btn"
              onClick={() => onClearSelection && onClearSelection()}
            >Clear</button>
          </div>
        )}
      </div>
      <div className="comp-grid">
        {components.map((c, idx) => {
          const def = allTypes[c.type];
          const accent = c.color || def?.color || '#999';
          const selected = selectedIds.has(c.id);
          return (
            <div
              key={c.id}
              className={`comp-card ${selected ? 'selected' : ''}`}
              style={{ borderLeftColor: accent }}
              {...(onReorder ? makeDragHandlers({ index: idx, onReorder, type: 'comp' }) : {})}
            >
              <header className="comp-card-head">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    className="comp-select"
                    checked={selected}
                    onChange={() => onToggleSelect(c.id)}
                    title="Select"
                    aria-label={`Select ${c.name || def?.label}`}
                  />
                )}
                <span className="comp-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
                <span className="comp-icon">{c.icon || def?.icon}</span>
                <span className="comp-type">{def?.label || c.type}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onRemove(c.id)}
                  title="Remove"
                  aria-label={`Remove ${c.name || def?.label}`}
                >×</button>
              </header>
              <input
                type="text"
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                placeholder="Component name (e.g. Identity API)"
                className="comp-name"
                aria-label="Component name"
              />
              <input
                type="text"
                value={c.notes}
                onChange={(e) => onUpdate(c.id, { notes: e.target.value })}
                placeholder="Optional note (e.g. Kafka topic)"
                className="comp-notes"
                aria-label="Component notes"
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
