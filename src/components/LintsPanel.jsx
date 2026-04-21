import React from 'react';

const ICON = { error: '⛔', warn: '⚠️', info: 'ℹ️' };

export default function LintsPanel({ lints }) {
  if (!lints || !lints.length) {
    return (
      <div className="lints-panel lints-clean" role="status">
        ✅ No issues found — architecture looks clean.
      </div>
    );
  }
  const grouped = { error: [], warn: [], info: [] };
  lints.forEach((l) => { (grouped[l.severity] || grouped.info).push(l); });

  return (
    <div className="lints-panel" aria-label="Architecture lints">
      <div className="lints-head">
        <strong>Lints</strong>
        <span className="muted">
          {grouped.error.length} error · {grouped.warn.length} warn · {grouped.info.length} info
        </span>
      </div>
      <ul className="lints-list">
        {['error', 'warn', 'info'].flatMap((sev) => grouped[sev]).map((l, i) => (
          <li key={i} className={`lint lint-${l.severity}`}>
            <span className="lint-icon" aria-hidden="true">{ICON[l.severity]}</span>
            <span className="lint-msg">{l.message}</span>
            <code className="lint-code">{l.code}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
