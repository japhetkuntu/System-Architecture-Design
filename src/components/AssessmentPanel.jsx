import React, { useState } from 'react';

const SEV_ICON = { error: '⛔', warn: '⚠️', info: '💡' };
const SEV_LABEL = { error: 'Critical', warn: 'Risk', info: 'Suggestion' };

const GRADE_COLOR = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
  'N/A': '#94a3b8'
};

export default function AssessmentPanel({ assessment, onSelectComponent }) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState('all');

  if (!assessment) return null;
  const { findings, score, grade, summary } = assessment;

  const counts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const visible = filter === 'all' ? findings : findings.filter((f) => f.severity === filter);

  // Group by category for readability.
  const grouped = {};
  visible.forEach((f) => {
    (grouped[f.category] = grouped[f.category] || []).push(f);
  });
  const categories = Object.keys(grouped);

  return (
    <div className="assessment-panel" aria-label="Architecture assessment">
      <header className="assessment-head">
        <div className="assessment-grade" style={{ background: GRADE_COLOR[grade] || '#64748b' }}
          title={score === null ? 'Not enough to score' : `Resilience score: ${score}/100`}>
          <div className="assessment-grade-letter">{grade}</div>
          {score !== null && <div className="assessment-grade-score">{score}/100</div>}
        </div>
        <div className="assessment-summary">
          <strong>Resilience review</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{summary}</p>
        </div>
        <button type="button" className="link-btn" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? 'Show details' : 'Hide'}
        </button>
      </header>

      {!collapsed && (
        <>
          {findings.length > 0 && (
            <div className="assessment-filter">
              <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}>All ({findings.length})</button>
              {['error', 'warn', 'info'].filter((s) => counts[s]).map((s) => (
                <button key={s} type="button" className={`chip chip-${s} ${filter === s ? 'active' : ''}`}
                  onClick={() => setFilter(s)}>
                  {SEV_ICON[s]} {SEV_LABEL[s]} ({counts[s]})
                </button>
              ))}
            </div>
          )}

          {findings.length === 0 ? (
            <div className="lints-clean" style={{ marginTop: 8 }}>
              ✅ No major resilience or durability concerns detected.
            </div>
          ) : visible.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>No findings at this severity.</p>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="assessment-cat">
                <div className="assessment-cat-head">{cat}</div>
                <ul className="assessment-list">
                  {grouped[cat].map((f, i) => (
                    <li key={i} className={`assessment-item assessment-${f.severity}`}>
                      <div className="assessment-item-head">
                        <span className="assessment-icon" aria-hidden="true">{SEV_ICON[f.severity]}</span>
                        <span className="assessment-msg">{f.message}</span>
                        {f.componentId && onSelectComponent && (
                          <button type="button" className="link-btn small"
                            onClick={() => onSelectComponent(f.componentId)}
                            title="Select this component">Locate</button>
                        )}
                      </div>
                      <div className="assessment-recommendation">
                        <strong>Fix:</strong> {f.recommendation}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
