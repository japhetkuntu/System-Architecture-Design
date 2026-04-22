import React, { useState } from 'react';

const SEV_ICON  = { error: '⛔', warn: '⚠️', info: '💡' };
const SEV_LABEL = { error: 'Critical', warn: 'Risk', info: 'Suggestion' };

const GRADE_COLOR = {
  A: '#0aa06e',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#dc2626',
  'N/A': '#94a3b8'
};

/**
 * Workflow Orchestration panel.
 *
 * Identifies systems that are NOT durable on their own — they hang or leave
 * inconsistent state when a dependency fails or a bug throws mid-flow — and
 * recommends wrapping them in a Temporal workflow. A one-click "Apply
 * Temporal redesign" button materialises the alternative architecture so
 * the user can see the difference in the Diff tab.
 */
export default function AssessmentPanel({ assessment, onSelectComponent, onApplyRedesign, hasBaseline }) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState('all');

  if (!assessment) return null;
  const { findings = [], candidates = [], score, grade, summary } = assessment;

  const counts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const visible = filter === 'all' ? findings : findings.filter((f) => f.severity === filter);
  const grouped = {};
  visible.forEach((f) => { (grouped[f.category] = grouped[f.category] || []).push(f); });
  const categories = Object.keys(grouped);

  const handleApply = () => {
    if (!onApplyRedesign) return;
    const proceed = window.confirm(
      hasBaseline
        ? 'Replace your current baseline with today\'s design and apply the Temporal redesign on top? You can compare the two in the Diff tab.'
        : 'Apply the Temporal redesign? Your current architecture will be saved as the baseline so you can compare them side-by-side in the Diff tab.'
    );
    if (proceed) onApplyRedesign();
  };

  return (
    <div className="assessment-panel" aria-label="Workflow orchestration analysis">
      <header className="assessment-head">
        <div className="assessment-grade" style={{ background: GRADE_COLOR[grade] || '#64748b' }}
          title={score === null ? 'Not enough to score' : `Durability score: ${score}/100`}>
          <div className="assessment-grade-letter">{grade}</div>
          {score !== null && <div className="assessment-grade-score">{score}/100</div>}
        </div>
        <div className="assessment-summary">
          <strong>🧭 Workflow Orchestration</strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{summary}</p>
        </div>
        <button type="button" className="link-btn" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? 'Show details' : 'Hide'}
        </button>
      </header>

      {!collapsed && (
        <>
          {/* ---- Temporal candidates ---- */}
          {candidates.length > 0 && (
            <div className="orch-candidates">
              <div className="orch-candidates-head">
                <div>
                  <strong>Wrap these in a Temporal workflow</strong>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    These services run multi-step flows without durable execution. If a dependency fails or a bug throws mid-flow, they hang, double-charge, or leak state.
                  </p>
                </div>
                {onApplyRedesign && (
                  <button type="button" className="primary-btn small" onClick={handleApply}
                    title="Generate the redesigned architecture with Temporal workflows and capture today's design as baseline so you can compare in the Diff tab.">
                    ✨ Apply Temporal redesign
                  </button>
                )}
              </div>
              <ul className="orch-candidate-list">
                {candidates.map((c) => (
                  <li key={c.id} className={`orch-candidate sev-${c.severity}`}>
                    <div className="orch-candidate-head">
                      <span className="orch-candidate-name">
                        {SEV_ICON[c.severity]} {c.name}
                      </span>
                      <span className="orch-risk" title={`Durability risk score: ${c.riskScore}/100`}>
                        risk {c.riskScore}
                      </span>
                      {onSelectComponent && (
                        <button type="button" className="link-btn small"
                          onClick={() => onSelectComponent(c.id)}
                          title="Select this component">Locate</button>
                      )}
                    </div>
                    <ul className="orch-reasons">
                      {c.reasons.map((r, i) => (<li key={i}>{r}</li>))}
                    </ul>
                    <div className="orch-recommendation">
                      <strong>Recommendation:</strong> {c.recommendation}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="orch-footnote muted">
                <strong>Why Temporal?</strong> A Temporal workflow turns each downstream call into a retried, idempotent activity with explicit timeouts and saga compensation. Your service stays consistent even when a dependency is down for hours.
              </p>
            </div>
          )}

          {/* ---- Filter chips ---- */}
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

          {/* ---- Findings ---- */}
          {findings.length === 0 && candidates.length === 0 ? (
            <div className="lints-clean" style={{ marginTop: 8 }}>
              ✅ Every multi-step flow is already durable. Nothing to orchestrate.
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
