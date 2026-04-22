import React, { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Unified workspace browser.
 *
 * One sidebar, one mental model:
 *   • Cloud projects are folders.
 *   • Each project contains architectures (files).
 *   • Click a project to expand → see and open files inside.
 *   • "+ New file" inside a project saves the current architecture into it.
 *   • "Loose" holds cloud architectures that aren't in any project.
 *   • "On this device" lists local-only docs that haven't been pushed.
 *
 * The previous separate "Projects" modal and "Cloud Gallery" modal are
 * collapsed into this single panel so the project ↔ file relationship is
 * always visible.
 */
export default function WorkspaceSidebar({
  open,
  onClose,
  // Cloud
  cloudEnabled,
  cloudId,
  activeProjectId,
  setActiveProjectId,
  saveCloudArchitecture,
  loadCloudArchitecture,
  listCloudArchitectures,
  deleteCloudArchitecture,
  moveCloudArchitectureToProject,
  listCloudProjects,
  createCloudProject,
  renameCloudProject,
  deleteCloudProject,
  // Local-only docs
  docs,
  activeDocId,
  onLoadDoc,
  onRenameDoc,
  onDeleteDoc,
  // Current architecture
  currentTitle,
  hasContent,
  onNewBlank,
  onSaveCurrentLocal,
  onConfirm,
  onToast
}) {
  const [projects, setProjects] = useState([]);
  const [archByProject, setArchByProject] = useState({}); // { projectId|'__loose__': [arch...] }
  const [expanded, setExpanded] = useState(() => new Set([activeProjectId || '__loose__']));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [renamingProjId, setRenamingProjId] = useState(null);
  const [renameProjValue, setRenameProjValue] = useState('');

  const refresh = useCallback(async () => {
    if (!cloudEnabled) return;
    setLoading(true); setErr('');
    try {
      const [projs, all] = await Promise.all([
        listCloudProjects(),
        listCloudArchitectures({ limit: 200 })
      ]);
      setProjects(projs || []);
      const grouped = { __loose__: [] };
      (projs || []).forEach((p) => { grouped[p.id] = []; });
      (all || []).forEach((a) => {
        const key = a.projectId || '__loose__';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
      });
      setArchByProject(grouped);
    } catch (e) {
      setErr(e?.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled, listCloudProjects, listCloudArchitectures]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Auto-expand the active project so the user sees their files immediately.
  useEffect(() => {
    if (!open) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(activeProjectId || '__loose__');
      return next;
    });
  }, [open, activeProjectId]);

  if (!open) return null;

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const createProject = async () => {
    const name = newProjName.trim();
    if (!name) return;
    setBusy('create-proj'); setErr('');
    try {
      const p = await createCloudProject({ name });
      setNewProjName('');
      setProjects((prev) => [...prev, p]);
      setArchByProject((prev) => ({ ...prev, [p.id]: [] }));
      setExpanded((prev) => new Set(prev).add(p.id));
      setActiveProjectId?.(p.id);
      onToast?.(`Created project "${name}"`);
    } catch (e) {
      setErr(e?.message || 'Failed to create project');
    } finally { setBusy(null); }
  };

  const commitProjectRename = async () => {
    if (!renamingProjId) return;
    const name = renameProjValue.trim();
    if (!name) { setRenamingProjId(null); return; }
    setBusy('rename-proj'); setErr('');
    try {
      await renameCloudProject(renamingProjId, name);
      setProjects((prev) => prev.map((p) => p.id === renamingProjId ? { ...p, name } : p));
      onToast?.('Renamed project');
    } catch (e) {
      setErr(e?.message || 'Rename failed');
    } finally {
      setRenamingProjId(null); setRenameProjValue(''); setBusy(null);
    }
  };

  const askDeleteProject = (p) => {
    onConfirm?.({
      title: `Delete project "${p.name}"?`,
      message: `All architectures inside "${p.name}" will be deleted from the cloud for everyone. This cannot be undone.`,
      destructive: true,
      confirmLabel: 'Yes, delete project',
      onConfirm: async () => {
        try {
          await deleteCloudProject(p.id);
          setProjects((prev) => prev.filter((x) => x.id !== p.id));
          setArchByProject((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
          if (activeProjectId === p.id) setActiveProjectId?.(null);
          onToast?.('Project deleted');
        } catch (e) { setErr(e?.message || 'Delete failed'); }
      }
    });
  };

  const openArch = async (a) => {
    setBusy(`open-${a.id}`); setErr('');
    try {
      // Switch active project to where the arch lives so subsequent saves go there.
      if ((a.projectId || null) !== (activeProjectId || null)) {
        setActiveProjectId?.(a.projectId || null);
      }
      await loadCloudArchitecture(a.id);
      onToast?.(`Opened "${a.title || 'Untitled'}"`);
      onClose?.();
    } catch (e) { setErr(e?.message || 'Open failed'); }
    finally { setBusy(null); }
  };

  const askDeleteArch = (a) => {
    onConfirm?.({
      title: `Delete "${a.title || 'Untitled'}"?`,
      message: 'This removes the cloud copy for everyone. Your local working copy is not affected.',
      destructive: true,
      confirmLabel: 'Yes, delete',
      onConfirm: async () => {
        try {
          await deleteCloudArchitecture(a.id);
          setArchByProject((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => { next[k] = next[k].filter((x) => x.id !== a.id); });
            return next;
          });
          onToast?.('Deleted from cloud');
        } catch (e) { setErr(e?.message || 'Delete failed'); }
      }
    });
  };

  const moveArch = async (a, newProjectId) => {
    if ((a.projectId || null) === (newProjectId || null)) return;
    setBusy(`move-${a.id}`); setErr('');
    try {
      await moveCloudArchitectureToProject(a.id, newProjectId || null);
      setArchByProject((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { next[k] = next[k].filter((x) => x.id !== a.id); });
        const updated = { ...a, projectId: newProjectId || null };
        const target = newProjectId || '__loose__';
        next[target] = [updated, ...(next[target] || [])];
        return next;
      });
      onToast?.('Moved');
    } catch (e) { setErr(e?.message || 'Move failed'); }
    finally { setBusy(null); }
  };

  const copyLink = async (id) => {
    try {
      const base = `${window.location.origin}${window.location.pathname}`;
      await navigator.clipboard.writeText(`${base}?id=${encodeURIComponent(id)}`);
      onToast?.('Share link copied');
    } catch { /* noop */ }
  };

  const saveCurrentToProject = async (projectId) => {
    if (!hasContent) { onToast?.('Add some components first'); return; }
    // Ensure subsequent auto-saves land in the chosen project.
    setActiveProjectId?.(projectId || null);
    setBusy('save-here'); setErr('');
    try {
      await saveCloudArchitecture();
      onToast?.(projectId ? 'Saved into project' : 'Saved to cloud (no project)');
      refresh();
    } catch (e) { setErr(e?.message || 'Save failed'); }
    finally { setBusy(null); }
  };

  const projectMeta = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const looseList = archByProject.__loose__ || [];
  const totalCloud = Object.values(archByProject).reduce((s, list) => s + list.length, 0);

  return (
    <aside className="workspace-sidebar workspace-sidebar-wide" role="dialog" aria-label="Workspace">
      <div className="ws-head">
        <h2>📚 Workspace</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <p className="muted ws-current">
        Currently editing: <strong>{currentTitle || 'Untitled'}</strong>
        {cloudId && <span className="pill pill-count" title="This file lives in the cloud">cloud</span>}
        {activeDocId && !cloudId && <span className="pill pill-count" title="Linked to a local saved doc">local</span>}
      </p>

      <div className="ws-actions">
        <button type="button" className="secondary-btn" onClick={onNewBlank}
          title="Start a fresh blank architecture">＋ New blank</button>
        {!cloudEnabled && (
          <button type="button" className="primary-btn small" onClick={onSaveCurrentLocal}
            title="Save current to this browser only">💾 Save locally</button>
        )}
        {cloudEnabled && (
          <button type="button" className="secondary-btn" onClick={refresh} disabled={loading}
            title="Refresh the workspace">{loading ? 'Refreshing…' : '↻ Refresh'}</button>
        )}
      </div>

      {err && <div className="banner banner-error" style={{ marginTop: 8 }}><span>⚠ {err}</span></div>}

      {/* ============================ CLOUD ============================ */}
      {cloudEnabled ? (
        <>
          <div className="ws-section-head">
            <span className="ws-section-title">☁ Cloud projects</span>
            <span className="muted" style={{ fontSize: 11 }}>{projects.length} project{projects.length === 1 ? '' : 's'} · {totalCloud} file{totalCloud === 1 ? '' : 's'}</span>
          </div>

          <div className="ws-new-proj">
            <input
              type="text"
              placeholder="New project name…"
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createProject(); }}
            />
            <button type="button" className="primary-btn small"
              onClick={createProject}
              disabled={busy === 'create-proj' || !newProjName.trim()}>＋ Project</button>
          </div>

          <ul className="ws-tree">
            {projects.map((p) => {
              const isExp = expanded.has(p.id);
              const list = archByProject[p.id] || [];
              const isActive = activeProjectId === p.id;
              return (
                <li key={p.id} className={`ws-proj ${isActive ? 'active' : ''}`}>
                  <div className="ws-proj-row">
                    <button type="button" className="ws-disclosure" onClick={() => toggle(p.id)}
                      aria-label={isExp ? 'Collapse' : 'Expand'}
                      aria-expanded={isExp}>{isExp ? '▾' : '▸'}</button>
                    {renamingProjId === p.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={renameProjValue}
                        onChange={(e) => setRenameProjValue(e.target.value)}
                        onBlur={commitProjectRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitProjectRename();
                          if (e.key === 'Escape') { setRenamingProjId(null); setRenameProjValue(''); }
                        }}
                        className="ws-rename"
                      />
                    ) : (
                      <button type="button" className="ws-proj-name"
                        onClick={() => { setActiveProjectId?.(p.id); toggle(p.id); }}
                        title="Make this the active project (new files land here) and expand">
                        📁 {p.name}
                        <span className="ws-count">{list.length}</span>
                        {isActive && <span className="pill pill-count" style={{ marginLeft: 6 }}>active</span>}
                      </button>
                    )}
                    <div className="ws-proj-actions">
                      <button type="button" className="icon-btn" title="Save current here"
                        onClick={() => saveCurrentToProject(p.id)}
                        disabled={!hasContent || busy === 'save-here'}>＋</button>
                      <button type="button" className="icon-btn" title="Rename project"
                        onClick={() => { setRenamingProjId(p.id); setRenameProjValue(p.name); }}>✏️</button>
                      <button type="button" className="icon-btn danger" title="Delete project"
                        onClick={() => askDeleteProject(p)}>×</button>
                    </div>
                  </div>
                  {isExp && (
                    <ul className="ws-arch-list">
                      {list.length === 0 ? (
                        <li className="ws-empty">
                          <span className="muted" style={{ fontSize: 12 }}>No files yet.</span>
                          {hasContent && (
                            <button type="button" className="link-btn small"
                              onClick={() => saveCurrentToProject(p.id)}>＋ Save current here</button>
                          )}
                        </li>
                      ) : list.map((a) => (
                        <ArchRow
                          key={a.id}
                          arch={a}
                          isCurrent={a.id === cloudId}
                          busy={busy}
                          projects={projects}
                          onOpen={() => openArch(a)}
                          onMove={(pid) => moveArch(a, pid)}
                          onCopyLink={() => copyLink(a.id)}
                          onDelete={() => askDeleteArch(a)}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}

            {/* Loose section */}
            <li className={`ws-proj ${!activeProjectId ? 'active' : ''}`}>
              <div className="ws-proj-row">
                <button type="button" className="ws-disclosure" onClick={() => toggle('__loose__')}
                  aria-expanded={expanded.has('__loose__')}>{expanded.has('__loose__') ? '▾' : '▸'}</button>
                <button type="button" className="ws-proj-name"
                  onClick={() => { setActiveProjectId?.(null); toggle('__loose__'); }}
                  title="Files not assigned to any project">
                  📂 Loose <span className="ws-count">{looseList.length}</span>
                  {!activeProjectId && <span className="pill pill-count" style={{ marginLeft: 6 }}>active</span>}
                </button>
                <div className="ws-proj-actions">
                  <button type="button" className="icon-btn" title="Save current here (no project)"
                    onClick={() => saveCurrentToProject(null)}
                    disabled={!hasContent || busy === 'save-here'}>＋</button>
                </div>
              </div>
              {expanded.has('__loose__') && (
                <ul className="ws-arch-list">
                  {looseList.length === 0 ? (
                    <li className="ws-empty"><span className="muted" style={{ fontSize: 12 }}>No loose files.</span></li>
                  ) : looseList.map((a) => (
                    <ArchRow
                      key={a.id}
                      arch={a}
                      isCurrent={a.id === cloudId}
                      busy={busy}
                      projects={projects}
                      onOpen={() => openArch(a)}
                      onMove={(pid) => moveArch(a, pid)}
                      onCopyLink={() => copyLink(a.id)}
                      onDelete={() => askDeleteArch(a)}
                    />
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </>
      ) : (
        <div className="ws-cloud-disabled">
          <p className="muted" style={{ fontSize: 12, margin: '8px 0' }}>
            ☁ Cloud sync is off. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to share architectures across browsers and group them into projects.
          </p>
        </div>
      )}

      {/* ============================ LOCAL ============================ */}
      <div className="ws-section-head" style={{ marginTop: 16 }}>
        <span className="ws-section-title">💾 On this device</span>
        <span className="muted" style={{ fontSize: 11 }}>{(docs || []).length} doc{(docs || []).length === 1 ? '' : 's'}</span>
      </div>

      {(!docs || docs.length === 0) ? (
        <div className="empty-state small">
          <p>No local docs. Use <em>＋ New blank</em> or save the current architecture.</p>
        </div>
      ) : (
        <ul className="ws-arch-list ws-arch-list-flat">
          {docs.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((d) => (
            <li key={d.id} className={`ws-arch-row ${d.id === activeDocId ? 'current' : ''}`}>
              <button type="button" className="ws-arch-name"
                onClick={() => { onLoadDoc?.(d.id); onClose?.(); }}
                title="Load this local doc">
                <strong>{d.name}</strong>
                <small className="muted">
                  {d.state.components.length} components · {d.state.connections.length} connections
                  · {new Date(d.updatedAt).toLocaleDateString()}
                </small>
              </button>
              <div className="ws-arch-actions">
                <button type="button" className="icon-btn" title="Rename"
                  onClick={() => {
                    const name = window.prompt('Rename doc:', d.name);
                    if (name && name.trim()) onRenameDoc?.(d.id, name.trim());
                  }}>✏️</button>
                <button type="button" className="icon-btn danger" title="Delete"
                  onClick={() => onDeleteDoc?.(d.id)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function ArchRow({ arch, isCurrent, busy, projects, onOpen, onMove, onCopyLink, onDelete }) {
  const [showMove, setShowMove] = useState(false);
  return (
    <li className={`ws-arch-row ${isCurrent ? 'current' : ''}`}>
      <button type="button" className="ws-arch-name"
        onClick={onOpen} disabled={busy === `open-${arch.id}`}
        title="Open this architecture">
        <strong>{arch.title || 'Untitled'}</strong>
        <small className="muted">
          {arch.componentCount} components · {arch.connectionCount} connections
          {arch.updatedAt ? ` · ${new Date(arch.updatedAt).toLocaleDateString()}` : ''}
          {isCurrent ? ' · open' : ''}
        </small>
      </button>
      <div className="ws-arch-actions">
        <button type="button" className="icon-btn" title="Move to project"
          onClick={() => setShowMove((v) => !v)}>↔</button>
        {showMove && (
          <select
            autoFocus
            value={arch.projectId || ''}
            onChange={(e) => { onMove(e.target.value || null); setShowMove(false); }}
            onBlur={() => setShowMove(false)}
            className="ws-move-select"
          >
            <option value="">📂 Loose (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>📁 {p.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="icon-btn" title="Copy share link"
          onClick={onCopyLink}>🔗</button>
        <button type="button" className="icon-btn danger" title="Delete from cloud"
          onClick={onDelete} disabled={busy === `move-${arch.id}`}>×</button>
      </div>
    </li>
  );
}
