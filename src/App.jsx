import React, { useEffect, useRef, useState } from 'react';
import { useBuilder } from './hooks/useBuilder.js';
import ComponentPalette from './components/ComponentPalette.jsx';
import ComponentList from './components/ComponentList.jsx';
import ConnectionList from './components/ConnectionList.jsx';
import OutputTabs from './components/OutputTabs.jsx';
import SimulationPanel from './components/SimulationPanel.jsx';
import DiffPanel from './components/DiffPanel.jsx';
import AdrDialog from './components/AdrDialog.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import WelcomeCard from './components/WelcomeCard.jsx';

const DISMISS_KEY = 'archivise:welcome-dismissed:v1';

export default function App() {
  const b = useBuilder();
  const [mode, setMode] = useState('build');
  const [currentStep, setCurrentStep] = useState(-1);
  const [importError, setImportError] = useState('');
  const [toast, setToast] = useState('');
  const [adrOpen, setAdrOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, onConfirm, destructive }
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const fileInputRef = useRef(null);
  const baselineFileInputRef = useRef(null);

  const showWelcome = !welcomeDismissed && b.components.length === 0 && !b.baseline;
  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  };

  const safeStep = currentStep >= 0 && currentStep < b.simulationSteps.length
    ? b.simulationSteps[currentStep]
    : null;

  const highlight = mode === 'simulate' && safeStep
    ? { fromId: safeStep.fromId, toId: safeStep.toId, edgeIndex: safeStep.index }
    : null;

  const filenameBase = (b.title || 'architecture')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'architecture';

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadJson = () => {
    downloadBlob(new Blob([b.exportJson()], { type: 'application/json' }), `${filenameBase}.archivise.json`);
    showToast('Exported architecture JSON');
  };

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
      message: 'This removes all components, connections, custom types, and any captured baseline. It cannot be undone.',
      destructive: true,
      confirmLabel: 'Yes, clear everything',
      onConfirm: () => { b.reset(); setConfirm(null); setMode('build'); showToast('Cleared'); }
    });
  };

  const askRestoreBaseline = () => {
    setConfirm({
      title: 'Restore baseline?',
      message: 'Your current changes will be replaced with the baseline architecture. This cannot be undone.',
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

  const captureBaselineWithToast = () => {
    b.captureBaseline();
    showToast('Baseline captured — make changes to see the diff');
  };

  const diffCount = b.diff
    ? (b.diff.components.added.length + b.diff.components.removed.length + b.diff.components.modified.length
      + b.diff.connections.added.length + b.diff.connections.removed.length + b.diff.connections.modified.length
      + (b.diff.title ? 1 : 0))
    : 0;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Archivise</h1>
          <p className="tagline">
            Click blocks. Wire them up. Get a real Mermaid diagram, simulation, diff, and ADR — instantly.
          </p>
        </div>
        <div className="header-actions">
          <div className="btn-group" title="View modes">
            <button
              type="button"
              className={`secondary-btn ${mode === 'build' ? 'active' : ''}`}
              onClick={() => setMode('build')}
              title="Edit your architecture"
            >🧱 Build</button>
            <button
              type="button"
              className={`secondary-btn ${mode === 'simulate' ? 'active' : ''}`}
              onClick={() => { setMode('simulate'); setCurrentStep(-1); }}
              disabled={b.simulationSteps.length === 0}
              title={b.simulationSteps.length === 0 ? 'Add at least one connection to simulate' : 'Walk through the flow step-by-step'}
            >▶ Simulate</button>
            <button
              type="button"
              className={`secondary-btn ${mode === 'diff' ? 'active' : ''}`}
              onClick={() => setMode('diff')}
              title="Compare current to a captured baseline"
            >
              🔍 Diff{b.baseline ? ` (${diffCount})` : ''}
            </button>
          </div>

          <div className="btn-group" title="Import / export">
            <button type="button" className="secondary-btn" onClick={() => triggerImport(false)}
              title="Load a previously exported .archivise.json file">⬆ Import</button>
            <button type="button" className="secondary-btn" onClick={() => triggerImport(true)}
              title="Load an existing architecture as the baseline to compare against">⬆ As baseline</button>
            <button type="button" className="secondary-btn" onClick={downloadJson}
              title="Save your full architecture to a JSON file">⬇ JSON</button>
            <button
              type="button"
              className="primary-btn small"
              onClick={() => setAdrOpen(true)}
              disabled={b.components.length === 0}
              title="Generate an Architecture Decision Record in Markdown"
            >📝 Generate ADR</button>
          </div>

          <button type="button" className="secondary-btn" onClick={b.loadSample} title="Load a worked example">
            ✨ Sample
          </button>
          <button type="button" className="danger-btn" onClick={askClearAll} title="Clear everything">
            🗑 Clear
          </button>
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
        <span className="autosave-pill" title="Your work auto-saves to this browser">💾 Auto-saved</span>
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
            highlightStep={highlight}
            filenameBase={filenameBase}
          />
        </div>
      </main>

      <footer className="app-footer">
        <span>Diagrams by Mermaid · No AI, no API key required · State auto-saves to your browser</span>
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
        filenameBase={filenameBase}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      {toast && (
        <div className="toast" role="status">{toast}</div>
      )}
    </div>
  );
}
