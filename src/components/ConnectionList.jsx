import React, { useMemo, useState } from 'react';
import { RELATIONSHIPS } from '../hooks/useBuilder.js';
import { makeDragHandlers } from '../utils/dnd.js';

function compLabel(c, allTypes) {
  if (!c) return '?';
  const def = allTypes[c.type];
  const icon = c.icon || def?.icon || '';
  return `${icon} ${c.name || def?.label || c.id}`.trim();
}

// Lightweight heuristic: suggest the most natural relationship kind
// given the component types being connected.
const SUGGEST_MAP = {
  'user>frontend':     'uses',
  'user>api':          'calls',
  'frontend>api':      'calls',
  'frontend>external': 'calls',
  'api>database':      'writes',
  'api>cache':         'reads',
  'api>search':        'reads',
  'api>storage':       'writes',
  'api>queue':         'publishes',
  'api>external':      'integrates',
  'api>api':           'calls',
  'service>database':  'writes',
  'service>queue':     'publishes',
  'service>external':  'integrates',
  'consumer>queue':    'consumes',
  'consumer>database': 'writes',
  'consumer>search':   'writes',
  'consumer>api':      'calls',
  'consumer>external': 'integrates',
  'queue>consumer':    'notifies',
  'external>api':      'returns'
};

function suggestKind(from, to) {
  if (!from || !to) return 'calls';
  const key = `${from.type}>${to.type}`;
  return SUGGEST_MAP[key] || 'calls';
}

export default function ConnectionList({
  components,
  connections,
  allTypes,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
  onSwap,
  onMove,
  onReorder
}) {
  const [draft, setDraft] = useState({ fromId: '', toId: '', kind: 'calls', label: '' });
  const [touchedKind, setTouchedKind] = useState(false);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState(null);

  const canAdd =
    components.length >= 2 && draft.fromId && draft.toId && draft.fromId !== draft.toId;

  const from = components.find((c) => c.id === draft.fromId);
  const to = components.find((c) => c.id === draft.toId);

  const updateDraft = (patch) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // auto-suggest a relationship until the user has overridden it
      if (!touchedKind && (patch.fromId !== undefined || patch.toId !== undefined)) {
        const f = components.find((c) => c.id === next.fromId);
        const t = components.find((c) => c.id === next.toId);
        if (f && t) next.kind = suggestKind(f, t);
      }
      return next;
    });
  };

  const submit = () => {
    if (!canAdd) return;
    onAdd(draft);
    setDraft({ fromId: '', toId: '', kind: 'calls', label: '' });
    setTouchedKind(false);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && canAdd) { e.preventDefault(); submit(); }
  };

  // Count of parallel edges per from→to pair (used to mark duplicates).
  const parallelCounts = useMemo(() => {
    const m = new Map();
    connections.forEach((c) => {
      const k = `${c.fromId}=>${c.toId}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [connections]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return connections.map((c, i) => ({ conn: c, originalIndex: i }));
    return connections
      .map((c, i) => ({ conn: c, originalIndex: i }))
      .filter(({ conn }) => {
        const f = components.find((x) => x.id === conn.fromId);
        const t = components.find((x) => x.id === conn.toId);
        const rel = RELATIONSHIPS.find((r) => r.id === conn.kind)?.label || conn.kind;
        return [compLabel(f, allTypes), compLabel(t, allTypes), rel, conn.label]
          .filter(Boolean).some((s) => s.toLowerCase().includes(q));
      });
  }, [connections, filter, components, allTypes]);

  const draftRelLabel = RELATIONSHIPS.find((r) => r.id === draft.kind)?.label || draft.kind;
  const suggested = from && to ? suggestKind(from, to) : null;
  const showSuggestion = suggested && suggested !== draft.kind && touchedKind;

  return (
    <section className="connection-list">
      <div className="conn-head">
        <h3 className="panel-title">
          Connections <span className="pill pill-count">{connections.length}</span>
        </h3>
        {connections.length > 4 && (
          <input
            type="search"
            className="conn-filter"
            placeholder="🔎 Filter connections…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </div>
      <p className="panel-hint">
        Wire up how data and requests flow between your components. Order here drives the <em>Simulate</em> sequence.
      </p>

      {components.length < 2 ? (
        <div className="empty-state">
          <span className="empty-icon">🔌</span>
          <p>Add at least two components, then you can wire them up here.</p>
        </div>
      ) : (
        <div className="conn-add-card" onKeyDown={onKey}>
          <div className="conn-add-row">
            <div className="conn-field">
              <label>From</label>
              <select
                value={draft.fromId}
                onChange={(e) => updateDraft({ fromId: e.target.value })}
              >
                <option value="">Choose source…</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{compLabel(c, allTypes)}</option>
                ))}
              </select>
            </div>

            <div className="conn-field conn-field-rel">
              <label>
                Relationship
                {showSuggestion && (
                  <button
                    type="button"
                    className="inline-suggest"
                    title="Use suggested relationship"
                    onClick={() => { updateDraft({ kind: suggested }); setTouchedKind(false); }}
                  >
                    suggest: {RELATIONSHIPS.find((r) => r.id === suggested)?.label}
                  </button>
                )}
              </label>
              <select
                value={draft.kind}
                onChange={(e) => { setTouchedKind(true); updateDraft({ kind: e.target.value }); }}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="conn-field">
              <label>To</label>
              <select
                value={draft.toId}
                onChange={(e) => updateDraft({ toId: e.target.value })}
              >
                <option value="">Choose target…</option>
                {components
                  .filter((c) => c.id !== draft.fromId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{compLabel(c, allTypes)}</option>
                  ))}
              </select>
            </div>

            <button
              type="button"
              className="icon-btn swap-btn"
              onClick={() => setDraft((d) => ({ ...d, fromId: d.toId, toId: d.fromId }))}
              disabled={!draft.fromId || !draft.toId}
              title="Swap direction"
              aria-label="Swap from/to"
            >⇄</button>
          </div>

          <div className="conn-add-row conn-add-row-2">
            <div className="conn-field conn-field-grow">
              <label>Label <em className="muted">(optional, overrides the relationship text)</em></label>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => updateDraft({ label: e.target.value })}
                placeholder='e.g. "register", "publishes event"'
              />
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={submit}
              disabled={!canAdd}
              title="Add this connection (Enter)"
            >+ Add connection</button>
          </div>

          <div className={`conn-preview ${canAdd ? 'ready' : 'placeholder'}`} aria-live="polite">
            {canAdd ? (
              <>
                <span className="conn-preview-chip">{compLabel(from, allTypes)}</span>
                <span className="conn-preview-arrow">
                  <span className="conn-preview-line" />
                  <span className="conn-preview-kind">{draft.label || draftRelLabel}</span>
                  <span className="conn-preview-head">▶</span>
                </span>
                <span className="conn-preview-chip">{compLabel(to, allTypes)}</span>
              </>
            ) : (
              <span className="muted">Pick a source and target to preview the arrow</span>
            )}
          </div>
        </div>
      )}

      {connections.length > 0 ? (
        <ul className="conn-list">
          {filtered.map(({ conn, originalIndex }) => {
            const f = components.find((c) => c.id === conn.fromId);
            const t = components.find((c) => c.id === conn.toId);
            if (!f || !t) return null;
            const rel = RELATIONSHIPS.find((r) => r.id === conn.kind);
            const parallelCount = parallelCounts.get(`${conn.fromId}=>${conn.toId}`) || 1;
            const isEditing = editingId === conn.id;
            const labelText = conn.label || rel?.label || conn.kind;

            return (
              <li
                key={conn.id}
                className={`conn-row ${isEditing ? 'editing' : ''}`}
                {...(onReorder && !filter ? makeDragHandlers({ index: originalIndex, onReorder, type: 'conn' }) : {})}
              >
                <span className="conn-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
                <span className="conn-step" title={`Step ${originalIndex + 1} in simulation`}>
                  {originalIndex + 1}
                </span>

                {!isEditing ? (
                  <div className="conn-display" onClick={() => setEditingId(conn.id)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(conn.id); }}
                    title="Click to edit">
                    <span className="conn-chip">{compLabel(f, allTypes)}</span>
                    <span className="conn-arrow">
                      <span className="conn-line" />
                      <span className="conn-kind">{labelText}</span>
                      <span className="conn-arrow-head">▶</span>
                    </span>
                    <span className="conn-chip">{compLabel(t, allTypes)}</span>
                    {parallelCount > 1 && (
                      <span className="pill pill-warn" title={`${parallelCount} parallel edges — they will be merged in the diagram`}>
                        ×{parallelCount} parallel
                      </span>
                    )}
                    {conn.note && (
                      <span className="conn-note-inline" title={conn.note}>📝 {conn.note}</span>
                    )}
                  </div>
                ) : (
                  <div className="conn-edit">
                    <select value={conn.fromId} onChange={(e) => onUpdate(conn.id, { fromId: e.target.value })}>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>{compLabel(c, allTypes)}</option>
                      ))}
                    </select>
                    <select value={conn.kind} onChange={(e) => onUpdate(conn.id, { kind: e.target.value })}>
                      {RELATIONSHIPS.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <select value={conn.toId} onChange={(e) => onUpdate(conn.id, { toId: e.target.value })}>
                      {components.filter((c) => c.id !== conn.fromId).map((c) => (
                        <option key={c.id} value={c.id}>{compLabel(c, allTypes)}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={conn.label}
                      onChange={(e) => onUpdate(conn.id, { label: e.target.value })}
                      placeholder="Custom label"
                      className="conn-label"
                    />
                    <input
                      type="text"
                      value={conn.note || ''}
                      onChange={(e) => onUpdate(conn.id, { note: e.target.value })}
                      placeholder="📝 Note / annotation (shown on the edge)"
                      className="conn-note"
                    />
                    <button type="button" className="link-btn" onClick={() => setEditingId(null)}>Done</button>
                  </div>
                )}

                <div className="conn-actions">
                  <button type="button" className="icon-btn" title="Move up" aria-label="Move up"
                    disabled={originalIndex === 0}
                    onClick={() => onMove && onMove(conn.id, -1)}>↑</button>
                  <button type="button" className="icon-btn" title="Move down" aria-label="Move down"
                    disabled={originalIndex === connections.length - 1}
                    onClick={() => onMove && onMove(conn.id, 1)}>↓</button>
                  <button type="button" className="icon-btn" title="Swap direction" aria-label="Swap direction"
                    onClick={() => onSwap && onSwap(conn.id)}>⇄</button>
                  <button type="button" className="icon-btn" title="Duplicate" aria-label="Duplicate"
                    onClick={() => onDuplicate && onDuplicate(conn.id)}>⎘</button>
                  <button type="button" className="icon-btn danger" title="Remove" aria-label="Remove"
                    onClick={() => onRemove(conn.id)}>×</button>
                </div>
              </li>
            );
          })}
          {filter && filtered.length === 0 && (
            <li className="empty-state small">
              <p>No connections match “{filter}”.</p>
            </li>
          )}
        </ul>
      ) : (
        components.length >= 2 && (
          <div className="empty-state small">
            <p>No connections yet. Use the form above to wire the first one.</p>
          </div>
        )
      )}
    </section>
  );
}
