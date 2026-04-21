import React, { useEffect, useMemo, useRef, useState } from 'react';

// A revamped simulation experience:
// - Big "current step" card with from → relationship → to and any notes
// - Progress bar + step counter
// - Play / pause / step / reset / jump-to-end controls
// - Speed selector
// - Keyboard shortcuts: ←/→ step, Space play/pause, Home reset, End jump to last
// - Filter the trace list by component (focus on a single node's flow)
// - Click any step to jump there
export default function SimulationPanel({ steps, currentStep, setCurrentStep, onExit }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const [focusComp, setFocusComp] = useState(''); // component name filter
  const timerRef = useRef(null);
  const stepRefs = useRef({});

  // Auto-advance.
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(() => {
      if (currentStep + 1 >= steps.length) setPlaying(false);
      else setCurrentStep(currentStep + 1);
    }, speed);
    return () => clearTimeout(timerRef.current);
  }, [playing, currentStep, speed, steps.length, setCurrentStep]);

  // Keyboard control while panel is mounted.
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing in inputs.
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault(); setPlaying(false);
        setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); setPlaying(false);
        setCurrentStep(Math.max(-1, currentStep - 1));
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (currentStep >= steps.length - 1) setCurrentStep(0);
        setPlaying((p) => !p);
      } else if (e.key === 'Home') {
        e.preventDefault(); setPlaying(false); setCurrentStep(-1);
      } else if (e.key === 'End') {
        e.preventDefault(); setPlaying(false); setCurrentStep(steps.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentStep, steps.length, setCurrentStep]);

  // Keep the active step visible.
  useEffect(() => {
    if (currentStep < 0) return;
    const el = stepRefs.current[currentStep];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  const componentNames = useMemo(() => {
    const set = new Set();
    steps.forEach((s) => { set.add(s.fromName); set.add(s.toName); });
    return Array.from(set).sort();
  }, [steps]);

  const filteredSteps = useMemo(() => {
    if (!focusComp) return steps.map((s, i) => ({ s, i }));
    return steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.fromName === focusComp || s.toName === focusComp);
  }, [steps, focusComp]);

  if (!steps.length) {
    return (
      <div className="sim-panel">
        <header className="sim-head">
          <h3 className="panel-title">▶ Simulation</h3>
          <button type="button" className="link-btn" onClick={onExit}>Exit</button>
        </header>
        <div className="empty-state small">
          <p>Add components and connections, then come back here to walk through the flow step-by-step.</p>
        </div>
      </div>
    );
  }

  const reset    = () => { setPlaying(false); setCurrentStep(-1); };
  const back     = () => { setPlaying(false); setCurrentStep(Math.max(-1, currentStep - 1)); };
  const forward  = () => { setPlaying(false); setCurrentStep(Math.min(steps.length - 1, currentStep + 1)); };
  const jumpEnd  = () => { setPlaying(false); setCurrentStep(steps.length - 1); };
  const togglePlay = () => {
    if (currentStep >= steps.length - 1) setCurrentStep(0);
    setPlaying((p) => !p);
  };

  const current = currentStep >= 0 ? steps[currentStep] : null;
  const progress = steps.length > 0 ? Math.max(0, currentStep + 1) / steps.length : 0;
  const stepsDone = Math.max(0, currentStep + 1);

  return (
    <div className="sim-panel">
      <header className="sim-head">
        <h3 className="panel-title">▶ Simulation</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {stepsDone}/{steps.length} steps
          </span>
          <button type="button" className="link-btn" onClick={onExit}>Exit</button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="sim-progress" aria-label="Simulation progress" role="progressbar"
        aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepsDone}>
        <div className="sim-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Big current-step card */}
      <div className={`sim-stage ${current ? '' : 'sim-stage-idle'}`}>
        {current ? (
          <>
            <div className="sim-stage-meta">
              <span className="sim-step-num">Step {currentStep + 1}</span>
              {current.labels.length > 0 && (
                <span className="sim-stage-kind">{current.labels.join(' • ')}</span>
              )}
            </div>
            <div className="sim-stage-flow">
              <div className="sim-node">{current.fromName}</div>
              <div className="sim-arrow-big" aria-hidden="true">→</div>
              <div className="sim-node">{current.toName}</div>
            </div>
            {current.narrative && (
              <p className="sim-narrative-text">{current.narrative}.</p>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            Press <kbd>Space</kbd> or click <strong>Play</strong> to start the simulation.
          </p>
        )}
      </div>

      {/* Transport controls */}
      <div className="sim-controls" role="toolbar" aria-label="Simulation controls">
        <button type="button" className="icon-btn" onClick={reset} title="Reset (Home)" aria-label="Reset">⏮</button>
        <button type="button" className="icon-btn" onClick={back} disabled={currentStep < 0} title="Previous step (←)" aria-label="Previous">◀</button>
        <button type="button" className="primary-btn" onClick={togglePlay} title="Play / pause (Space)">
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" className="icon-btn" onClick={forward} disabled={currentStep >= steps.length - 1} title="Next step (→)" aria-label="Next">▶</button>
        <button type="button" className="icon-btn" onClick={jumpEnd} disabled={currentStep >= steps.length - 1} title="Jump to last step (End)" aria-label="End">⏭</button>
        <label className="sim-speed">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={2500}>🐢 Slow</option>
            <option value={1500}>Normal</option>
            <option value={800}>Fast</option>
            <option value={400}>🐇 Very fast</option>
          </select>
        </label>
      </div>

      {/* Focus filter */}
      <div className="sim-filter">
        <label htmlFor="sim-focus" className="muted" style={{ fontSize: 12 }}>Focus on</label>
        <select id="sim-focus" value={focusComp} onChange={(e) => setFocusComp(e.target.value)}>
          <option value="">All components</option>
          {componentNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {focusComp && (
          <button type="button" className="link-btn" onClick={() => setFocusComp('')}>Clear</button>
        )}
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {filteredSteps.length} step{filteredSteps.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Trace list */}
      <ol className="sim-steps" aria-label="Simulation trace">
        {filteredSteps.map(({ s, i }) => (
          <li
            key={i}
            ref={(el) => { stepRefs.current[i] = el; }}
            className={`sim-step ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}
            onClick={() => { setPlaying(false); setCurrentStep(i); }}
          >
            <span className="sim-step-index">{i + 1}</span>
            <span className="sim-step-text">
              <strong>{s.fromName}</strong> → <strong>{s.toName}</strong>
              {s.labels.length > 0 && <em className="muted"> · {s.labels.join(', ')}</em>}
            </span>
          </li>
        ))}
      </ol>

      <p className="muted" style={{ fontSize: 11, margin: '8px 4px 0' }}>
        Shortcuts: <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>Space</kbd> play/pause · <kbd>Home</kbd>/<kbd>End</kbd> jump
      </p>
    </div>
  );
}
