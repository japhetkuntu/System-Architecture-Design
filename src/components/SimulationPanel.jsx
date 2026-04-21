import React, { useEffect, useRef, useState } from 'react';

export default function SimulationPanel({ steps, currentStep, setCurrentStep, onExit }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setTimeout(() => {
      if (currentStep + 1 >= steps.length) {
        setPlaying(false);
      } else {
        setCurrentStep(currentStep + 1);
      }
    }, speed);
    return () => clearTimeout(timerRef.current);
  }, [playing, currentStep, speed, steps.length, setCurrentStep]);

  const reset = () => { setPlaying(false); setCurrentStep(-1); };
  const back = () => { setPlaying(false); setCurrentStep(Math.max(-1, currentStep - 1)); };
  const forward = () => { setPlaying(false); setCurrentStep(Math.min(steps.length - 1, currentStep + 1)); };

  if (!steps.length) {
    return (
      <div className="sim-panel">
        <header className="sim-head">
          <h3 className="panel-title">Simulation</h3>
          <button type="button" className="link-btn" onClick={onExit}>Exit</button>
        </header>
        <p className="muted">Add components and connections to simulate the flow.</p>
      </div>
    );
  }

  const current = steps[currentStep];

  return (
    <div className="sim-panel">
      <header className="sim-head">
        <h3 className="panel-title">Simulation · step {Math.max(0, currentStep + 1)}/{steps.length}</h3>
        <button type="button" className="link-btn" onClick={onExit}>Exit simulation</button>
      </header>

      <div className="sim-controls">
        <button type="button" className="secondary-btn" onClick={reset}>⏮ Reset</button>
        <button type="button" className="secondary-btn" onClick={back} disabled={currentStep < 0}>◀ Back</button>
        <button
          type="button"
          className="primary-btn small"
          onClick={() => {
            if (currentStep >= steps.length - 1) setCurrentStep(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button type="button" className="secondary-btn" onClick={forward} disabled={currentStep >= steps.length - 1}>Next ▶</button>
        <label className="sim-speed">
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={2500}>Slow</option>
            <option value={1500}>Normal</option>
            <option value={800}>Fast</option>
            <option value={400}>Very fast</option>
          </select>
        </label>
      </div>

      {current && (
        <div className="sim-current">
          <div className="sim-step-num">Step {currentStep + 1}</div>
          <div className="sim-narrative">
            <strong>{current.fromName}</strong>
            <span className="sim-arrow">→</span>
            <strong>{current.toName}</strong>
          </div>
          {current.labels.length > 0 && (
            <ul className="sim-labels">
              {current.labels.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}

      <ol className="sim-steps">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`sim-step ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`}
            onClick={() => { setPlaying(false); setCurrentStep(i); }}
          >
            <span className="sim-step-index">{i + 1}</span>
            <span className="sim-step-text">
              <strong>{s.fromName}</strong> → <strong>{s.toName}</strong>
              {s.labels.length > 0 && <em> · {s.labels.join(', ')}</em>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
