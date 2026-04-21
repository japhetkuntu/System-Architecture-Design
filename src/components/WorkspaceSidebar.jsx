import React, { useState } from 'react';

export default function WorkspaceSidebar({
  open,
  onClose,
  docs,
  activeDocId,
  onLoad,
  onRename,
  onDuplicate,
  onDelete,
  onSaveCurrent,
  onNewDoc,
  currentTitle
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  if (!open) return null;

  const startRename = (d) => { setRenamingId(d.id); setRenameValue(d.name); };
  const commitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null); setRenameValue('');
  };

  return (
    <aside className="workspace-sidebar" role="dialog" aria-label="Saved architectures">
      <div className="ws-head">
        <h2>📚 Saved architectures</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close sidebar">×</button>
      </div>

      <div className="ws-actions">
        <button type="button" className="primary-btn small" onClick={onSaveCurrent}
          title="Save the current architecture as a new document">
          💾 Save current as new…
        </button>
        <button type="button" className="secondary-btn" onClick={onNewDoc}
          title="Start a blank architecture (current is auto-saved if already a doc)">
          ＋ New
        </button>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        Current: <strong>{currentTitle || 'Untitled'}</strong>
        {activeDocId ? <span className="pill pill-count" title="Linked to a saved doc">linked</span> : null}
      </p>

      {(!docs || docs.length === 0) ? (
        <div className="empty-state small">
          <p>No saved architectures yet. Build one, then click <em>Save current as new</em>.</p>
        </div>
      ) : (
        <ul className="ws-list">
          {docs.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((d) => (
            <li key={d.id} className={`ws-item ${d.id === activeDocId ? 'active' : ''}`}>
              {renamingId === d.id ? (
                <input
                  autoFocus
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                  }}
                  className="ws-rename"
                />
              ) : (
                <button type="button" className="ws-name" onClick={() => onLoad(d.id)} title="Load this architecture">
                  <strong>{d.name}</strong>
                  <small className="muted">
                    {d.state.components.length} components · {d.state.connections.length} connections
                    · updated {new Date(d.updatedAt).toLocaleString()}
                  </small>
                </button>
              )}
              <div className="ws-item-actions">
                <button type="button" className="icon-btn" title="Rename" aria-label="Rename"
                  onClick={() => startRename(d)}>✏️</button>
                <button type="button" className="icon-btn" title="Duplicate" aria-label="Duplicate"
                  onClick={() => onDuplicate(d.id)}>⎘</button>
                <button type="button" className="icon-btn danger" title="Delete" aria-label="Delete"
                  onClick={() => onDelete(d.id)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
