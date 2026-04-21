import React from 'react';

const STEPS = [
  {
    icon: '🧱',
    title: '1. Add components',
    body: 'Click any block in the palette to drop it in: APIs, queues, databases, externals — even your own custom types with custom icons.'
  },
  {
    icon: '🔗',
    title: '2. Wire connections',
    body: 'Pick a "from" and "to" component, choose a relationship (calls, publishes, reads…), and add an optional label. Repeat as needed.'
  },
  {
    icon: '🎯',
    title: '3. Simulate, diff & ship',
    body: 'Press ▶ Simulate to walk the flow step-by-step, capture a baseline to compare versions, and download SVG/PNG/JSON or a polished ADR.'
  }
];

export default function WelcomeCard({ onLoadSample, onDismiss, onImport }) {
  return (
    <div className="welcome-card">
      <div className="welcome-head">
        <div>
          <h2>Welcome to Archivise 👋</h2>
          <p className="muted">Build a living architecture diagram in three quick steps. No setup, no AI key, your work auto-saves locally.</p>
        </div>
        <button type="button" className="link-btn" onClick={onDismiss} aria-label="Dismiss welcome">Hide</button>
      </div>
      <div className="welcome-steps">
        {STEPS.map((s) => (
          <div key={s.title} className="welcome-step">
            <div className="welcome-step-icon">{s.icon}</div>
            <h4>{s.title}</h4>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
      <div className="welcome-actions">
        <button type="button" className="primary-btn small" onClick={onLoadSample}>
          ✨ Load a worked example
        </button>
        <button type="button" className="secondary-btn" onClick={onImport}>
          ⬆ Import an existing architecture
        </button>
        <button type="button" className="link-btn" onClick={onDismiss}>I'll start from scratch →</button>
      </div>
    </div>
  );
}
