import React, { useCallback, useEffect, useState } from 'react';

export default function ProjectPicker({
  open,
  onClose,
  cloudEnabled,
  activeProjectId,
  onSelect,
  listCloudProjects,
  createCloudProject,
  renameCloudProject,
  deleteCloudProject,
  onConfirm
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    setLoading(true); setErr('');
    try {
      const list = await listCloudProjects();
      setProjects(list);
    } catch (e) {
      setErr(e?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled, listCloudProjects]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  if (!open) return null;

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true); setErr('');
    try {
      const p = await createCloudProject({ name: newName });
      setNewName('');
      setProjects((prev) => [...prev, p]);
      onSelect?.(p.id);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    setErr('');
    if (!name) { setRenamingId(null); return; }
    try {
      await renameCloudProject(renamingId, name);
      setProjects((prev) => prev.map((p) => p.id === renamingId ? { ...p, name } : p));
    } catch (e) {
      setErr(e?.message || 'Rename failed');
    } finally {
      setRenamingId(null); setRenameValue('');
    }
  };

  const remove = async (id, name) => {
    if (!onConfirm) return;
    onConfirm({
      title: `Delete project "${name}"?`,
      message: `All architectures inside "${name}" will also be deleted. This cannot be undone.`,
      destructive: true,
      confirmLabel: 'Yes, delete project',
      onConfirm: async () => {
        setErr('');
        try {
          await deleteCloudProject(id);
          setProjects((prev) => prev.filter((p) => p.id !== id));
          if (activeProjectId === id) onSelect?.(null);
        } catch (e) {
          setErr(e?.message || 'Delete failed');
        }
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" role="dialog" aria-label="Projects" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>📁 Projects</h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Group related architectures into a project. Everyone with the app sees the same projects.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {!cloudEnabled && (
            <div className="banner banner-warning">
              <span>⚠ Supabase is not configured.</span>
            </div>
          )}
          {err && <div className="banner banner-error"><span>⚠ {err}</span></div>}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="New project name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              disabled={!cloudEnabled || creating}
            />
            <button type="button" className="primary-btn small" onClick={create}
              disabled={!cloudEnabled || creating || !newName.trim()}>
              {creating ? 'Creating…' : '＋ Create'}
            </button>
          </div>

          <ul className="ws-list">
            <li className={`ws-item ${!activeProjectId ? 'active' : ''}`}>
              <button type="button" className="ws-name"
                onClick={() => { onSelect?.(null); onClose?.(); }}
                title="Show architectures not assigned to any project">
                <strong>📂 No project (loose)</strong>
                <small className="muted">Architectures without a project</small>
              </button>
            </li>
            {loading && <li className="muted" style={{ padding: 8 }}>Loading…</li>}
            {projects.map((p) => (
              <li key={p.id} className={`ws-item ${p.id === activeProjectId ? 'active' : ''}`}>
                {renamingId === p.id ? (
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
                  <button type="button" className="ws-name"
                    onClick={() => { onSelect?.(p.id); onClose?.(); }}
                    title="Make this the active project">
                    <strong>📁 {p.name}</strong>
                    <small className="muted">
                      created {new Date(p.created_at).toLocaleDateString()}
                      {p.id === activeProjectId ? ' · active' : ''}
                    </small>
                  </button>
                )}
                <div className="ws-item-actions">
                  <button type="button" className="icon-btn" title="Rename"
                    onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}>✏️</button>
                  <button type="button" className="icon-btn danger" title="Delete project"
                    onClick={() => remove(p.id, p.name)}>×</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
