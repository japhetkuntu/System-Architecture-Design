import React, { useCallback, useEffect, useState } from 'react';

export default function CloudGallery({
  open,
  onClose,
  cloudEnabled,
  currentCloudId,
  activeProjectId,
  activeProjectName,
  listCloudArchitectures,
  loadCloudArchitecture,
  deleteCloudArchitecture,
  moveCloudArchitectureToProject,
  listCloudProjects,
  onOpenProjects,
  onLoaded,
  onConfirm
}) {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState('project'); // 'project' | 'all'

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    setLoading(true); setErr('');
    try {
      const opts = { limit: 200 };
      if (scope === 'project') opts.projectId = activeProjectId || null;
      const [list, projs] = await Promise.all([
        listCloudArchitectures(opts),
        listCloudProjects ? listCloudProjects() : Promise.resolve([])
      ]);
      setItems(list);
      setProjects(projs);
    } catch (e) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled, listCloudArchitectures, listCloudProjects, scope, activeProjectId]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  if (!open) return null;

  const projectName = (id) => projects.find((p) => p.id === id)?.name || (id ? '(unknown)' : 'No project');

  const handleOpen = async (id) => {
    setBusyId(id); setErr('');
    try {
      await loadCloudArchitecture(id);
      onLoaded?.(id);
    } catch (e) {
      setErr(e?.message || 'Failed to open');
    } finally { setBusyId(null); }
  };

  const handleDelete = async (id, title) => {
    if (!onConfirm) return;
    onConfirm({
      title: `Delete "${title || 'Untitled'}"?`,
      message: 'Delete this cloud architecture for everyone? This action cannot be undone.',
      destructive: true,
      confirmLabel: 'Yes, delete',
      onConfirm: async () => {
        setBusyId(id); setErr('');
        try {
          await deleteCloudArchitecture(id);
          setItems((prev) => prev.filter((x) => x.id !== id));
        } catch (e) {
          setErr(e?.message || 'Delete failed');
        } finally { setBusyId(null); }
      }
    });
  };

  const handleMove = async (id, projectId) => {
    setBusyId(id); setErr('');
    try {
      await moveCloudArchitectureToProject(id, projectId || null);
      setItems((prev) => prev.map((x) => x.id === id ? { ...x, projectId: projectId || null } : x));
      if (scope === 'project') refresh();
    } catch (e) {
      setErr(e?.message || 'Move failed');
    } finally { setBusyId(null); }
  };

  const copyLink = async (id) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    try { await navigator.clipboard.writeText(`${base}?id=${encodeURIComponent(id)}`); } catch { /* noop */ }
  };

  const filtered = filter
    ? items.filter((i) => (i.title || '').toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Shared cloud architectures" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>🌐 Cloud architectures</h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              {scope === 'project'
                ? <>Project: <strong>{activeProjectName || 'No project'}</strong></>
                : 'All architectures across every project'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {!cloudEnabled && (
            <div className="banner banner-warning">
              <span>⚠ Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your root <code>.env</code>.</span>
            </div>
          )}
          {err && <div className="banner banner-error"><span>⚠ {err}</span></div>}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="btn-group">
              <button type="button" className={`secondary-btn small ${scope === 'project' ? 'active' : ''}`}
                onClick={() => setScope('project')} disabled={!cloudEnabled}>This project</button>
              <button type="button" className={`secondary-btn small ${scope === 'all' ? 'active' : ''}`}
                onClick={() => setScope('all')} disabled={!cloudEnabled}>All</button>
            </div>
            <input
              type="search"
              placeholder="Filter by title…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              disabled={!cloudEnabled}
            />
            <button type="button" className="secondary-btn small" onClick={refresh} disabled={!cloudEnabled || loading}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
            {onOpenProjects && (
              <button type="button" className="secondary-btn small" onClick={onOpenProjects} disabled={!cloudEnabled}>
                📁 Projects…
              </button>
            )}
          </div>

          {cloudEnabled && !loading && filtered.length === 0 && (
            <div className="empty-state small">
              <p>No architectures here yet. Build something — it saves automatically into the active project.</p>
            </div>
          )}

          {filtered.length > 0 && (
            <ul className="ws-list">
              {filtered.map((it) => (
                <li key={it.id} className={`ws-item ${it.id === currentCloudId ? 'active' : ''}`}>
                  <button type="button" className="ws-name" onClick={() => handleOpen(it.id)}
                    disabled={busyId === it.id} title="Open this architecture">
                    <strong>{it.title || 'Untitled'}</strong>
                    <small className="muted">
                      {it.componentCount} components · {it.connectionCount} connections
                      {scope === 'all' ? ` · 📁 ${projectName(it.projectId)}` : ''}
                      {it.updatedAt ? ` · updated ${new Date(it.updatedAt).toLocaleString()}` : ''}
                      {it.id === currentCloudId ? ' · current' : ''}
                    </small>
                  </button>
                  <div className="ws-item-actions" style={{ gap: 4 }}>
                    <select
                      value={it.projectId || ''}
                      onChange={(e) => handleMove(it.id, e.target.value || null)}
                      disabled={busyId === it.id}
                      title="Move to project"
                      style={{ fontSize: 12, padding: '2px 4px' }}
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button type="button" className="icon-btn" title="Copy share link"
                      onClick={() => copyLink(it.id)}>🔗</button>
                    <button type="button" className="icon-btn danger" title="Delete from cloud"
                      onClick={() => handleDelete(it.id, it.title)} disabled={busyId === it.id}>×</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
