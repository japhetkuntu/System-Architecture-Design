import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBuilder } from './hooks/useBuilder.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { readShareFromLocation, clearShareInLocation, unpackShare } from './utils/share.js';
import ComponentPalette from './components/ComponentPalette.jsx';
import ComponentList from './components/ComponentList.jsx';
import ConnectionList from './components/ConnectionList.jsx';
import OutputTabs from './components/OutputTabs.jsx';
import SimulationPanel from './components/SimulationPanel.jsx';
import DiffPanel from './components/DiffPanel.jsx';
import AdrDialog from './components/AdrDialog.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import PromptDialog from './components/PromptDialog.jsx';
import WelcomeCard from './components/WelcomeCard.jsx';
import LintsPanel from './components/LintsPanel.jsx';
import AssessmentPanel from './components/AssessmentPanel.jsx';
import WorkspaceSidebar from './components/WorkspaceSidebar.jsx';
import ShareDialog from './components/ShareDialog.jsx';
import CloudGallery from './components/CloudGallery.jsx';
import ProjectPicker from './components/ProjectPicker.jsx';
import LayoutControls from './components/LayoutControls.jsx';
import DownloadMenu from './components/DownloadMenu.jsx';
import ManagementOnlyView from './components/ManagementOnlyView.jsx';
import {
  exportDiagramAsSvg, exportDiagramAsPng, exportDiagramAsJpg,
  exportDiagramAsPdf, exportMermaidSource
} from './utils/diagramExport.js';
import { buildAllSequenceDiagrams } from './utils/uml.js';

// Detect a `?view=...` parameter on first load — used by the
// management-only share route so leadership sees just the dashboard.
function readViewMode() {
  if (typeof window === 'undefined') return null;
  const qs = new URLSearchParams(window.location.search);
  const v = qs.get('view');
  if (v) return v;
  const hash = window.location.hash || '';
  const match = hash.match(/[?&]view=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const DISMISS_KEY = 'archivise:welcome-dismissed:v1';
const DELETE_PUBLISHED_KEY = 'archivise:allow-published-delete:v1';

export default function App() {
  const b = useBuilder();
  const [mode, setMode] = useState('build');
  const [currentStep, setCurrentStep] = useState(-1);
  const [importError, setImportError] = useState('');
  const [allowCloudDelete, setAllowCloudDelete] = useState(() => {
    try { return localStorage.getItem(DELETE_PUBLISHED_KEY) === '1'; } catch { return false; }
  });
  const [toast, setToast] = useState('');
  const [adrOpen, setAdrOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [activeProjectName, setActiveProjectName] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [viewMode] = useState(() => readViewMode()); // 'management' | null
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const fileInputRef = useRef(null);
  const baselineFileInputRef = useRef(null);

  const showWelcome = !welcomeDismissed && b.components.length === 0 && !b.baseline;
  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }, []);

  const toggleAllowCloudDelete = useCallback(() => {
    setAllowCloudDelete((prev) => {
      const next = !prev;
      try { localStorage.setItem(DELETE_PUBLISHED_KEY, next ? '1' : '0'); } catch { }
      showToast(next ? 'Cloud deletion enabled' : 'Cloud deletion disabled');
      return next;
    });
  }, [showToast]);

  const askPrompt = useCallback((cfg) => {
    setPrompt({
      title: cfg.title || 'Enter value',
      message: cfg.message || '',
      defaultValue: cfg.defaultValue || '',
      placeholder: cfg.placeholder || '',
      submitLabel: cfg.submitLabel || 'Save',
      cancelLabel: cfg.cancelLabel || 'Cancel',
      textarea: cfg.textarea || false,
      onConfirm: (value) => {
        if (cfg.onConfirm) cfg.onConfirm(value);
        setPrompt(null);
      },
      onCancel: () => {
        if (cfg.onCancel) cfg.onCancel();
        setPrompt(null);
      }
    });
  }, []);

  const confirmAction = useCallback(() => {
    confirm?.onConfirm?.();
    setConfirm(null);
  }, [confirm]);

  const safeStep = currentStep >= 0 && currentStep < b.simulationSteps.length
    ? b.simulationSteps[currentStep]
    : null;

  const highlight = mode === 'simulate' && safeStep
    ? { fromId: safeStep.fromId, toId: safeStep.toId, edgeIndex: safeStep.index, connId: safeStep.connId }
    : null;

  const filenameBase = (b.title || 'architecture')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'architecture';

  // --- Selection helpers (purge ids that no longer exist) ---
  useEffect(() => {
    if (selection.size === 0) return;
    const valid = new Set(b.components.map((c) => c.id));
    let changed = false;
    const next = new Set();
    selection.forEach((id) => { if (valid.has(id)) next.add(id); else changed = true; });
    if (changed) setSelection(next);
  }, [b.components, selection]);

  const toggleSelect = useCallback((id) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelection(new Set()), []);

  // --- Keep active project name resolved for the header button ---
  useEffect(() => {
    if (!b.cloudEnabled) { setActiveProjectName(''); return; }
    if (!b.activeProjectId) { setActiveProjectName(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await b.listCloudProjects();
        if (cancelled) return;
        const match = list.find((p) => p.id === b.activeProjectId);
        setActiveProjectName(match?.name || '');
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [b.cloudEnabled, b.activeProjectId, b.listCloudProjects]);

  // --- Consume shared architecture from URL on first load ---
  const consumedShareRef = useRef(false);
  useEffect(() => {
    if (consumedShareRef.current) return;
    consumedShareRef.current = true;
    const token = readShareFromLocation();
    const params = new URLSearchParams(window.location.search);
    const cloudId = params.get('id') || params.get('cloudId');

    if (token) {
      (async () => {
        try {
          const data = await unpackShare(token);
          b.importJson(JSON.stringify(data), { asBaseline: false });
          clearShareInLocation();
          dismissWelcome();
          showToast('Loaded architecture from shared link');
        } catch (e) {
          setImportError(`Shared link is invalid: ${e.message || 'unknown error'}`);
          clearShareInLocation();
        }
      })();
      return;
    }

    if (!cloudId) return;
    (async () => {
      try {
        await b.loadCloudArchitecture(cloudId);
        dismissWelcome();
        showToast('Loaded architecture from cloud');
      } catch (e) {
        setImportError(`Cloud load failed: ${e.message || 'unknown error'}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadJson = () => {
    downloadBlob(new Blob([b.exportJson()], { type: 'application/json' }), `${filenameBase}.archivise.json`);
    showToast('Exported architecture JSON');
  };

  // Run an async export, surface any error as a toast.
  const runExport = useCallback(async (label, fn) => {
    try {
      await fn();
      showToast(`Exported ${label}`);
    } catch (e) {
      showToast(`Export failed: ${e?.message || 'unknown error'}`);
    }
  }, [showToast]);

  const downloadActions = useMemo(() => ([
    { label: 'Architecture JSON',          onClick: downloadJson },
    { label: 'Diagram — SVG (vector)',     onClick: () => runExport('SVG',  () => exportDiagramAsSvg(b.mermaid, filenameBase)) },
    { label: 'Diagram — PNG (standard 2×)', onClick: () => runExport('PNG',  () => exportDiagramAsPng(b.mermaid, filenameBase, 2)) },
    { label: 'Diagram — PNG (high-res 4×)',  onClick: () => runExport('PNG',  () => exportDiagramAsPng(b.mermaid, filenameBase, 4)) },
    { label: 'Diagram — JPG',              onClick: () => runExport('JPG',  () => exportDiagramAsJpg(b.mermaid, filenameBase, 2)) },
    { label: 'Diagram — PDF (print dialog)', onClick: () => runExport('PDF',  () => exportDiagramAsPdf(b.mermaid, b.title)) },
    { label: 'Mermaid source (.mmd)',      onClick: () => runExport('Mermaid', () => exportMermaidSource(b.mermaid, filenameBase)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [b.mermaid, b.title, filenameBase, runExport]);

  const handleFile = async (file, asBaseline) => {
    setImportError('');
    if (!file) return;
    try {
      const text = await file.text();
      b.importJson(text, { asBaseline });
      showToast(asBaseline ? 'Imported as baseline' : 'Imported architecture');
      dismissWelcome();
    } catch (e) {
      setImportError(e.message || 'Failed to import file');
    }
  };

  const triggerImport = (asBaseline) => {
    const input = asBaseline ? baselineFileInputRef.current : fileInputRef.current;
    if (input) { input.value = ''; input.click(); }
  };

  // --- Destructive action wrappers ---
  const askClearAll = () => {
    if (b.components.length === 0 && !b.baseline) { b.reset(); return; }
    setConfirm({
      title: 'Clear everything?',
      message: 'This removes all components, connections, custom types, and any captured baseline. You can undo with ⌘Z.',
      destructive: true,
      confirmLabel: 'Yes, clear everything',
      onConfirm: () => { b.reset(); setConfirm(null); setMode('build'); clearSelection(); showToast('Cleared'); }
    });
  };

  const askRestoreBaseline = () => {
    setConfirm({
      title: 'Restore baseline?',
      message: 'Your current changes will be replaced with the baseline architecture. You can undo with ⌘Z.',
      destructive: true,
      confirmLabel: 'Yes, restore',
      onConfirm: () => { b.restoreBaseline(); setConfirm(null); showToast('Restored to baseline'); }
    });
  };

  const askClearBaseline = () => {
    setConfirm({
      title: 'Clear the baseline?',
      message: 'You will lose the snapshot used for comparison. Your current architecture is not affected.',
      destructive: true,
      confirmLabel: 'Yes, clear baseline',
      onConfirm: () => { b.clearBaseline(); setConfirm(null); setMode('build'); showToast('Baseline cleared'); }
    });
  };

  const askBulkDelete = () => {
    const ids = [...selection];
    if (!ids.length) return;
    setConfirm({
      title: `Delete ${ids.length} component${ids.length === 1 ? '' : 's'}?`,
      message: 'Connections touching them will also be removed. You can undo with ⌘Z.',
      destructive: true,
      confirmLabel: `Yes, delete ${ids.length}`,
      onConfirm: () => {
        b.removeComponents(ids);
        clearSelection();
        setConfirm(null);
        showToast(`Deleted ${ids.length} component${ids.length === 1 ? '' : 's'}`);
      }
    });
  };

  const bulkRecolor = (color) => {
    const ids = [...selection];
    if (!ids.length) return;
    b.applyToComponents(ids, { color });
    showToast(`Recoloured ${ids.length} component${ids.length === 1 ? '' : 's'}`);
  };

  const captureBaselineWithToast = () => {
    b.captureBaseline();
    showToast('Baseline captured — make changes to see the diff');
  };

  const saveCurrentAsDoc = () => {
    askPrompt({
      title: 'Name this architecture',
      message: 'Give this architecture a friendly name before saving it locally.',
      defaultValue: b.title || 'Untitled',
      placeholder: 'Architecture name',
      submitLabel: 'Save',
      onConfirm: (value) => {
        const name = value?.trim();
        if (!name) return;
        b.saveAsDoc(name);
        showToast(`Saved "${name}"`);
      }
    });
  };

  const newDocAction = () => {
    b.newDoc();
    clearSelection();
    setMode('build');
    showToast('New blank architecture');
  };

  // --- Keyboard shortcuts --------------------------------------------------
  const shortcuts = useMemo(() => ({
    'mod+z': () => { if (b.canUndo) { b.undo(); showToast('Undo'); } },
    'mod+shift+z': () => { if (b.canRedo) { b.redo(); showToast('Redo'); } },
    'mod+y': () => { if (b.canRedo) { b.redo(); showToast('Redo'); } },
    'mod+s': () => {
      if (b.activeDocId) { b.saveActiveDoc(); showToast('Saved'); }
      else { saveCurrentAsDoc(); }
    },
    'mod+e': () => setAdrOpen(true),
    'mod+k': () => setWorkspaceOpen((v) => !v),
    'mod+/': () => setShareOpen(true),
    '1': () => setMode('build'),
    '2': () => { if (b.simulationSteps.length) { setMode('simulate'); setCurrentStep(-1); } },
    '3': () => setMode('diff'),
    'Escape': () => {
      if (shareOpen) setShareOpen(false);
      else if (adrOpen) setAdrOpen(false);
      else if (workspaceOpen) setWorkspaceOpen(false);
      else if (confirm) setConfirm(null);
      else if (focusMode) setFocusMode(false);
      else if (selection.size) clearSelection();
    },
    'f': () => setFocusMode((v) => !v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [b.canUndo, b.canRedo, b.activeDocId, b.simulationSteps.length, shareOpen, adrOpen, workspaceOpen, confirm, focusMode, selection.size]);
  useKeyboardShortcuts(shortcuts);

  const diffCount = b.diff
    ? (b.diff.components.added.length + b.diff.components.removed.length + b.diff.components.modified.length
      + b.diff.connections.added.length + b.diff.connections.removed.length + b.diff.connections.modified.length
      + (b.diff.title ? 1 : 0))
    : 0;

  const getArchitecture = useCallback(() => JSON.parse(b.exportJson()), [b]);

  // Auto-enter focus/fullscreen when entering Simulate; restore previous mode on exit.
  const prevFocusRef = useRef(null);
  useEffect(() => {
    if (mode === 'simulate') {
      if (prevFocusRef.current === null) prevFocusRef.current = focusMode;
      setFocusMode(true);
    } else if (prevFocusRef.current !== null) {
      setFocusMode(prevFocusRef.current);
      prevFocusRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // True browser Fullscreen API — requested whenever focus mode turns on.
  // Fallref={appShellRef} s back gracefully (CSS-only fullscreen) when the API is unavailable
  // or the user denies it.
  const appShellRef = useRef(null);
  useEffect(() => {
    const el = appShellRef.current;
    if (!el) return;
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (focusMode && !isFs()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        try { Promise.resolve(req.call(el)).catch(() => {}); } catch { /* ignore */ }
      }
    } else if (!focusMode && isFs()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try { Promise.resolve(exit.call(document)).catch(() => {}); } catch { /* ignore */ }
      }
    }
  }, [focusMode]);

  // Keep React state in sync if the user exits fullscreen via the Esc key
  // or browser chrome (so our toolbar button label stays correct).
  useEffect(() => {
    const onChange = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFs && focusMode) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [focusMode]);

  // Management-only route: render the stripped-down executive dashboard.
  // We keep `useBuilder` running above so the share token / cloud id loads
  // identically; we just hide the editor chrome.
  if (viewMode === 'management') {
    return (
      <>
        <ManagementOnlyView builder={b} filenameBase={filenameBase} />
        {importError && (
          <div className="banner banner-error" style={{ position: 'fixed', top: 12, left: 12, right: 12, zIndex: 50 }}>
            <span>⚠ {importError}</span>
            <button type="button" className="link-btn" onClick={() => setImportError('')}>Dismiss</button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`app${focusMode ? ' app--focus' : ''}${focusMode && mode !== 'simulate' ? ' app--focus-only' : ''}`}>
      <header className="app-header">
        <div className="app-title">
          <h1>Archivise</h1>
          <p className="tagline">
            Click blocks. Wire them up. Get a real Mermaid diagram, simulation, diff, and ADR — instantly.
          </p>
        </div>
        <div className="header-actions">
          <div className="btn-group" title="View modes (1 / 2 / 3)">
            <button type="button" className={`secondary-btn ${mode === 'build' ? 'active' : ''}`}
              onClick={() => setMode('build')} title="Edit your architecture (1)">🧱 Build</button>
            <button type="button" className={`secondary-btn ${mode === 'simulate' ? 'active' : ''}`}
              onClick={() => { setMode('simulate'); setCurrentStep(-1); }}
              disabled={b.simulationSteps.length === 0}
              title={b.simulationSteps.length === 0 ? 'Add at least one connection to simulate' : 'Walk through the flow step-by-step (2)'}
            >▶ Simulate</button>
            <button type="button" className={`secondary-btn ${mode === 'diff' ? 'active' : ''}`}
              onClick={() => setMode('diff')} title="Compare current to a captured baseline (3)"
            >🔍 Diff{b.baseline ? ` (${diffCount})` : ''}</button>
          </div>

          <div className="btn-group" title="Undo / redo">
            <button type="button" className="icon-btn" onClick={b.undo} disabled={!b.canUndo}
              title="Undo (⌘Z)" aria-label="Undo">↶</button>
            <button type="button" className="icon-btn" onClick={b.redo} disabled={!b.canRedo}
              title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
          </div>

          <LayoutControls
            layoutDir={b.layoutDir} setLayoutDir={b.setLayoutDir}
            useSubgraphs={b.useSubgraphs} setUseSubgraphs={b.setUseSubgraphs}
          />

          <div className="btn-group" title="Import / export / share">
            <button type="button" className="secondary-btn" onClick={() => triggerImport(false)}
              title="Load a previously exported .archivise.json file">⬆ Import</button>
            <button type="button" className="secondary-btn" onClick={() => triggerImport(true)}
              title="Load an existing architecture as the baseline to compare against">⬆ As baseline</button>
            <DownloadMenu
              label="⬇ Download"
              disabled={b.components.length === 0}
              actions={downloadActions}
            />
            <button type="button" className="secondary-btn" onClick={() => setShareOpen(true)}
              disabled={b.components.length === 0}
              title="Get a shareable URL anyone can open in their browser (⌘/)">🔗 Share</button>
            <button type="button" className="primary-btn small" onClick={() => setAdrOpen(true)}
              disabled={b.components.length === 0}
              title="Generate an Architecture Decision Record (⌘E)">📝 Generate ADR</button>
          </div>

          <button type="button" className="secondary-btn" onClick={() => setWorkspaceOpen(true)}
            title="Browse projects, files, and saved architectures (⌘K)">
            📚 Workspace{b.cloudEnabled && activeProjectName ? ` → ${activeProjectName}` : ''}
          </button>
          <button type="button" className="secondary-btn" onClick={b.loadSample} title="Load a worked example">✨ Sample</button>
          <button type="button" className="danger-btn" onClick={askClearAll} title="Clear everything">🗑 Clear</button>
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0], false)} />
      <input ref={baselineFileInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0], true)} />

      {importError && (
        <div className="banner banner-error">
          <span>⚠ {importError}</span>
          <button type="button" className="link-btn" onClick={() => setImportError('')}>Dismiss</button>
        </div>
      )}

      {b.baseline && mode !== 'diff' && (
        <div className="banner banner-info">
          <span>📌 Baseline captured {new Date(b.baseline.capturedAt).toLocaleString()} · <strong>{diffCount}</strong> change{diffCount === 1 ? '' : 's'} so far.</span>
          <button type="button" className="link-btn" onClick={() => setMode('diff')}>View diff →</button>
        </div>
      )}

      {showWelcome && (
        <WelcomeCard
          onLoadSample={() => { b.loadSample(); dismissWelcome(); showToast('Loaded sample'); }}
          onImport={() => { triggerImport(false); }}
          onDismiss={dismissWelcome}
        />
      )}

      <section className="title-row">
        <label htmlFor="title" className="control-label">Diagram title</label>
        <input
          id="title"
          type="text"
          value={b.title}
          onChange={(e) => b.setTitle(e.target.value)}
          placeholder="e.g. Customer Onboarding"
        />
        {b.cloudEnabled ? (
          b.cloudId ? (
            <>
              <span className="autosave-pill" title={b.cloudError || 'Content auto-syncs to the cloud file'}>
                {b.cloudSaving
                  ? '☁ Saving…'
                  : b.cloudError
                    ? `⚠ ${b.cloudError}`
                    : b.cloudLastSavedAt
                      ? `☁ Saved · ${new Date(b.cloudLastSavedAt).toLocaleTimeString()}`
                      : '☁ Cloud file'}
              </span>
              <button type="button" className="link-btn" onClick={b.detachFromCloud}
                title="Stop syncing to this cloud file (your local copy stays)">Detach</button>
            </>
          ) : (
            <button type="button" className="primary-btn small"
              onClick={async () => {
                try { await b.saveCloudArchitecture(); showToast('Saved to cloud'); }
                catch (e) { showToast(`Cloud save failed: ${e.message || 'unknown'}`); }
              }}
              disabled={b.components.length === 0}
              title="Create a new cloud file for this architecture (then content auto-syncs)">
              ☁ Save to cloud
            </button>
          )
        ) : (
          <span className="autosave-pill" title={b.activeDocId ? 'Linked to a saved workspace doc' : 'Your work auto-saves to this browser'}>
            💾 {b.activeDocId ? 'Saved to workspace' : 'Auto-saved'}
          </span>
        )}
      </section>

      <main className="layout">
        <div className="panel input-panel">
          {mode === 'simulate' && (
            <SimulationPanel
              steps={b.simulationSteps}
              currentStep={currentStep}
              setCurrentStep={setCurrentStep}
              onExit={() => { setMode('build'); setCurrentStep(-1); }}
            />
          )}
          {mode === 'diff' && (
            <DiffPanel
              diff={b.diff}
              baseline={b.baseline}
              components={b.components}
              allTypes={b.allTypes}
              onCapture={captureBaselineWithToast}
              onClear={askClearBaseline}
              onRestore={askRestoreBaseline}
            />
          )}
          {mode === 'build' && (
            <>
              <ComponentPalette
                allTypes={b.allTypes}
                customTypes={b.customTypes}
                onAdd={b.addComponent}
                onAddCustomType={b.addCustomType}
                onRemoveCustomType={b.removeCustomType}
              />
              <ComponentList
                components={b.components}
                allTypes={b.allTypes}
                onUpdate={b.updateComponent}
                onRemove={b.removeComponent}
                onReorder={b.reorderComponents}
                selectedIds={selection}
                onToggleSelect={toggleSelect}
                onClearSelection={clearSelection}
                onBulkRemove={askBulkDelete}
                onBulkColor={bulkRecolor}
              />
              <ConnectionList
                components={b.components}
                connections={b.connections}
                allTypes={b.allTypes}
                onAdd={b.addConnection}
                onUpdate={b.updateConnection}
                onRemove={b.removeConnection}
                onDuplicate={b.duplicateConnection}
                onSwap={b.swapConnection}
                onMove={b.moveConnection}
                onReorder={b.reorderConnections}
              />
              <LintsPanel lints={b.lints} />
              <AssessmentPanel
                assessment={b.assessment}
                hasBaseline={!!b.baseline}
                onApplyRedesign={() => {
                  const ok = b.applyTemporalRedesign();
                  if (ok) {
                    setMode('diff');
                    showToast('Temporal redesign applied — see Diff tab');
                  } else {
                    showToast('Nothing to redesign — no orchestration candidates');
                  }
                }}
                onSelectComponent={(id) => { setSelection(new Set([id])); showToast('Selected'); }}
              />
              {b.components.length > 0 && !b.baseline && (
                <div className="hint-card">
                  💡 <strong>Tip:</strong> About to refactor? Click <em>🔍 Diff</em> and capture this as your <strong>baseline</strong> first — Archivise will track every change you make from here.
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel output-panel">
          <OutputTabs
            title={b.title}
            mermaid={b.mermaid}
            diffMermaid={b.diffMermaid}
            hasBaseline={!!b.baseline}
            forceTab={mode === 'diff' && b.baseline ? 'diff' : null}
            components={b.components}
            connections={b.connections}
            allTypes={b.allTypes}
            highlightStep={highlight}
            filenameBase={filenameBase}
            layoutDir={b.layoutDir}
            useSubgraphs={b.useSubgraphs}
            onAddComponent={b.addComponent}
            onUpdateComponent={b.updateComponent}
            onSetComponentPosition={b.setComponentPosition}
            onAddConnection={b.addConnection}
            onUpdateConnection={b.updateConnection}
            onReorderConnection={b.reorderConnections}
            onRemoveComponent={b.removeComponent}
            onRemoveConnection={b.removeConnection}
            onSelectComponent={(id) => setSelection(new Set([id]))}
            onSelectConnection={() => { /* future: jump to connection in panel */ }}
            selectedComponentIds={selection}
            onAutoLayout={() => { b.autoLayout(); showToast('Auto-arranged'); }}
            onResetPositions={() => { b.clearComponentPositions(); showToast('Layout reset'); }}
            scenarios={b.scenarios}
            onScenariosChange={b.setScenarios}
            focusMode={focusMode}
            onToggleFocusMode={() => setFocusMode((v) => !v)}
          />
        </div>
      </main>

      <footer className="app-footer">
        <span>
          Diagrams by Mermaid · No AI, no API key required · State auto-saves to your browser ·
          Shortcuts: ⌘Z undo · ⌘⇧Z redo · ⌘E ADR · ⌘K workspace · ⌘/ share · 1/2/3 views
        </span>
      </footer>

      <AdrDialog
        open={adrOpen}
        onClose={() => setAdrOpen(false)}
        baseline={b.baseline}
        current={{ title: b.title, components: b.components, connections: b.connections }}
        diff={b.diff}
        allTypes={b.allTypes}
        mermaid={b.mermaid}
        baselineMermaid={b.baselineMermaid}
        diffMermaid={b.diffMermaid}
        sequences={buildAllSequenceDiagrams({
          components: b.components,
          connections: b.connections,
          allTypes: b.allTypes
        })}
        connections={b.connections}
        scenarios={b.scenarios}
        filenameBase={filenameBase}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        getArchitecture={getArchitecture}
        saveToCloud={b.saveCloudArchitecture}
        cloudEnabled={b.cloudEnabled}
      />

      <CloudGallery
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        cloudEnabled={b.cloudEnabled}
        currentCloudId={b.cloudId}
        activeProjectId={b.activeProjectId}
        activeProjectName={activeProjectName}
        listCloudArchitectures={b.listCloudArchitectures}
        loadCloudArchitecture={b.loadCloudArchitecture}
        deleteCloudArchitecture={b.deleteCloudArchitecture}
        moveCloudArchitectureToProject={b.moveCloudArchitectureToProject}
        listCloudProjects={b.listCloudProjects}
        allowDeletePublished={allowCloudDelete}
        onOpenProjects={() => { setCloudOpen(false); setProjectsOpen(true); }}
        onLoaded={(id) => { setCloudOpen(false); clearSelection(); dismissWelcome(); showToast('Loaded from cloud'); }}
        onConfirm={(cfg) => setConfirm(cfg)}
      />

      <ProjectPicker
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        cloudEnabled={b.cloudEnabled}
        activeProjectId={b.activeProjectId}
        onSelect={(id) => { b.setActiveProjectId(id); showToast(id ? 'Switched project' : 'Cleared project'); }}
        listCloudProjects={b.listCloudProjects}
        createCloudProject={b.createCloudProject}
        renameCloudProject={b.renameCloudProject}
        deleteCloudProject={b.deleteCloudProject}
        allowDeletePublished={allowCloudDelete}
        onToggleAllowDeletePublished={toggleAllowCloudDelete}
        onConfirm={(cfg) => setConfirm(cfg)}
      />

      <WorkspaceSidebar
        open={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        cloudEnabled={b.cloudEnabled}
        cloudId={b.cloudId}
        activeProjectId={b.activeProjectId}
        setActiveProjectId={b.setActiveProjectId}
        saveCloudArchitecture={b.saveCloudArchitecture}
        loadCloudArchitecture={b.loadCloudArchitecture}
        listCloudArchitectures={b.listCloudArchitectures}
        deleteCloudArchitecture={b.deleteCloudArchitecture}
        moveCloudArchitectureToProject={b.moveCloudArchitectureToProject}
        listCloudProjects={b.listCloudProjects}
        createCloudProject={b.createCloudProject}
        renameCloudProject={b.renameCloudProject}
        deleteCloudProject={b.deleteCloudProject}
        allowDeletePublished={allowCloudDelete}
        onToggleAllowDeletePublished={toggleAllowCloudDelete}
        docs={b.docs}
        activeDocId={b.activeDocId}
        onLoadDoc={(id) => { b.loadDoc(id); clearSelection(); dismissWelcome(); showToast('Loaded'); }}
        onRenameDoc={(id, name) => { b.renameDoc(id, name); showToast('Renamed'); }}
        onDeleteDoc={(id) => setConfirm({
          title: 'Delete this saved architecture?',
          message: 'This only deletes the saved copy. The currently open diagram is not affected.',
          destructive: true,
          confirmLabel: 'Yes, delete',
          onConfirm: () => { b.deleteDoc(id); setConfirm(null); showToast('Deleted'); }
        })}
        currentTitle={b.title}
        hasContent={b.components.length > 0}
        onNewBlank={() => { newDocAction(); setWorkspaceOpen(false); }}
        onSaveCurrentLocal={() => { saveCurrentAsDoc(); }}
        onConfirm={(cfg) => setConfirm(cfg)}
        onPrompt={(cfg) => askPrompt(cfg)}
        onToast={showToast}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onConfirm={confirmAction}
        onCancel={() => setConfirm(null)}
      />
      <PromptDialog
        open={!!prompt}
        title={prompt?.title}
        message={prompt?.message}
        defaultValue={prompt?.defaultValue}
        placeholder={prompt?.placeholder}
        submitLabel={prompt?.submitLabel}
        cancelLabel={prompt?.cancelLabel}
        textarea={prompt?.textarea}
        onConfirm={prompt?.onConfirm}
        onCancel={prompt?.onCancel}
      />

      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
