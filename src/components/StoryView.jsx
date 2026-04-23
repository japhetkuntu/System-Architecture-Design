import React, { useEffect, useMemo, useRef, useState } from 'react';
import ComponentIcon from '../utils/componentIcons.jsx';
import {
  describeComponent, audienceFor, healthFor, layerOf, getLayerDefs,
  estimateStepMs, recoveryMinutesFor, formatRecovery,
  buildRisks, summariseRisks, buildScenarios
} from '../utils/managementInsights.js';

/**
 * StoryView — the executive dashboard.
 *
 * Four tabs: Journey Simulator, Capability Map, Pain Points & Risks,
 * What-if Scenarios. All non-technical, all interactive, all designed for
 * a leadership audience (no UML, no acronyms unless we explain them).
 */
export default function StoryView({ title, flows, components, connections, allTypes }) {
  const [tab, setTab] = useState('journey');
  const [drawer, setDrawer] = useState(null); // { component } | null

  const compById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);

  // Pre-compute incoming/outgoing degrees for health + capability cards.
  const degrees = useMemo(() => {
    const incoming = new Map(); const outgoing = new Map();
    components.forEach((c) => { incoming.set(c.id, 0); outgoing.set(c.id, 0); });
    (connections || []).forEach((e) => {
      outgoing.set(e.fromId, (outgoing.get(e.fromId) || 0) + 1);
      incoming.set(e.toId, (incoming.get(e.toId) || 0) + 1);
    });
    return { incoming, outgoing };
  }, [components, connections]);

  const openDrawer = (component) => setDrawer({ component });
  const closeDrawer = () => setDrawer(null);

  const tabs = [
    { id: 'journey',      label: '🚀 Journey simulator' },
    { id: 'capabilities', label: '🧭 Capability map' },
    { id: 'risks',        label: '⚠️ Pain points & risks' },
    { id: 'scenarios',    label: '🎭 What-if scenarios' }
  ];

  return (
    <div className="mgmt-dashboard">
      <header className="mgmt-header">
        <div>
          <h2>🎯 Management view</h2>
          <p className="muted">Interactive, plain-English view of <strong>{title || 'this architecture'}</strong> for leadership and stakeholders.</p>
        </div>
      </header>

      <nav className="mgmt-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mgmt-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mgmt-tab-panel">
        {tab === 'journey' && (
          <JourneyTab flows={flows} components={components} allTypes={allTypes} compById={compById} onPick={openDrawer} />
        )}
        {tab === 'capabilities' && (
          <CapabilitiesTab components={components} allTypes={allTypes} degrees={degrees} onPick={openDrawer} />
        )}
        {tab === 'risks' && (
          <RisksTab components={components} connections={connections || []} allTypes={allTypes} onPick={openDrawer} />
        )}
        {tab === 'scenarios' && (
          <ScenariosTab components={components} connections={connections || []} allTypes={allTypes} onPick={openDrawer} />
        )}
      </div>

      {drawer && (
        <ExplainerDrawer
          component={drawer.component}
          allTypes={allTypes}
          degrees={degrees}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tab 1 — Journey Simulator
// ============================================================================
function JourneyTab({ flows, components, allTypes, compById, onPick }) {
  const safeFlows = flows || [];
  const [activeFlowId, setActiveFlowId] = useState(safeFlows[0]?.id || null);
  useEffect(() => {
    if (!safeFlows.length) { setActiveFlowId(null); return; }
    if (!activeFlowId || !safeFlows.find((f) => f.id === activeFlowId)) {
      setActiveFlowId(safeFlows[0].id);
    }
  }, [safeFlows, activeFlowId]);

  const flow = safeFlows.find((f) => f.id === activeFlowId);

  // Reconstruct the steps in plain-English form. We need original step
  // metadata, which `flows` (sequenceDiagrams) doesn't carry — so we
  // re-derive from the connections of each step's underlying flow. The
  // upstream `buildAllSequenceDiagrams` flattens that, so we rebuild here
  // from `components` + the flow narrative isn't enough. Workaround:
  // attach a synthetic step list using the flow's `mermaid` is brittle.
  // Instead, we accept that sequenceDiagrams *are* derived from connections,
  // and reconstruct by looking at "who calls whom" inside each flow. The
  // simplest correct path is to use the entryId + walk outgoing edges
  // from `connections` — but `connections` isn't in this component scope.
  // We pass flow context via `flows` which already encodes ordered steps
  // when produced by detectFlows; here we re-create from the architecture
  // via a JourneyAnimator that walks the actual `connections` graph.
  return (
    <section className="mgmt-section">
      <div className="journey-toolbar">
        <label className="journey-toolbar-label">Pick a journey:</label>
        {safeFlows.length === 0 ? (
          <span className="muted">No journeys detected yet — add a connection between two components to enable this tab.</span>
        ) : (
          <select
            className="journey-select"
            value={activeFlowId || ''}
            onChange={(e) => setActiveFlowId(e.target.value)}
          >
            {safeFlows.map((f) => (
              <option key={f.id} value={f.id}>{f.name} — {f.stepCount} step{f.stepCount === 1 ? '' : 's'}</option>
            ))}
          </select>
        )}
      </div>
      {flow && (
        <JourneyAnimator
          key={flow.id}
          flow={flow}
          components={components}
          allTypes={allTypes}
          compById={compById}
          onPick={onPick}
        />
      )}
    </section>
  );
}

function JourneyAnimator({ flow, components, allTypes, compById, onPick }) {
  // Recover the ordered list of (fromId, toId, label, kind) steps from the
  // mermaid we already produced. Each step line in our generator looks like:
  //   "<alias>->><alias>: <label>" or "<alias>-->><alias>: <label>"
  // Aliases come from the participant declarations:
  //   "  participant <alias> as \"<display> (<typeLabel>)\""
  // We reconstruct the alias→componentId map by matching display names.
  const steps = useMemo(() => parseFlowMermaid(flow.mermaid, components), [flow.mermaid, components]);

  const [index, setIndex] = useState(-1); // -1 = not started
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  // Advance the simulation one tick at a time (600ms per step).
  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length - 1) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setIndex((i) => i + 1), 600);
    return () => clearTimeout(timerRef.current);
  }, [playing, index, steps.length]);

  const reset = () => { setPlaying(false); setIndex(-1); };
  const play = () => { if (index >= steps.length - 1) setIndex(-1); setPlaying(true); };
  const pause = () => setPlaying(false);
  const next = () => setIndex((i) => Math.min(steps.length - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(-1, i - 1));

  // Live metrics ----------------------------------------------------------
  const completedSteps = Math.max(0, index + 1);
  const involvedIds = useMemo(() => {
    const set = new Set();
    steps.slice(0, completedSteps).forEach((s) => { set.add(s.fromId); set.add(s.toId); });
    return set;
  }, [steps, completedSteps]);
  const elapsedMs = useMemo(() => {
    return steps.slice(0, completedSteps).reduce((acc, s) => {
      const c = compById.get(s.toId);
      return acc + estimateStepMs(c);
    }, 0);
  }, [steps, completedSteps, compById]);

  const activeIds = useMemo(() => {
    if (index < 0) return new Set();
    const s = steps[index];
    if (!s) return new Set();
    return new Set([s.fromId, s.toId]);
  }, [index, steps]);

  return (
    <div className="journey-stage">
      <div className="journey-controls">
        <button type="button" className="primary-btn small" onClick={playing ? pause : play} disabled={!steps.length}>
          {playing ? '⏸ Pause' : index >= steps.length - 1 ? '▶ Replay' : '▶ Play'}
        </button>
        <button type="button" className="secondary-btn" onClick={prev} disabled={index < 0}>◀ Step back</button>
        <button type="button" className="secondary-btn" onClick={next} disabled={!steps.length || index >= steps.length - 1}>Step forward ▶</button>
        <button type="button" className="link-btn" onClick={reset} disabled={index < 0}>Reset</button>
      </div>

      <div className="journey-metrics">
        <Metric label="Steps completed" value={`${completedSteps} / ${steps.length || 0}`} />
        <Metric label="Components involved" value={`${involvedIds.size}`} />
        <Metric label="Estimated time" value={formatMs(elapsedMs)} />
        <Metric label="Status" value={index < 0 ? 'Ready' : completedSteps === steps.length ? 'Done ✓' : playing ? 'Running…' : 'Paused'} />
      </div>

      <div className="journey-board">
        <div className="journey-actors">
          {orderedActors(steps, compById).map((c) => {
            const def = describeComponent(c, allTypes);
            const isActive = activeIds.has(c.id);
            const wasInvolved = involvedIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`journey-actor ${isActive ? 'is-active' : ''} ${wasInvolved ? 'is-involved' : ''}`}
                style={{ borderTopColor: c.color || '#5B6CFF' }}
                title={def.text}
                onClick={() => onPick(c)}
              >
                <ComponentIcon type={c.type} color={c.color || '#5B6CFF'} size={28} />
                <strong>{c.name}</strong>
                <span className="muted">{def.label}</span>
                {isActive && <span className="journey-pulse" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <ol className="journey-script">
          {steps.map((s, i) => {
            const from = compById.get(s.fromId);
            const to = compById.get(s.toId);
            const past = i <= index;
            const here = i === index;
            return (
              <li key={s.key} className={`journey-script-step ${past ? 'is-past' : ''} ${here ? 'is-here' : ''} ${s.async ? 'is-async' : ''}`}>
                <span className="journey-script-num">{i + 1}</span>
                <span className="journey-script-text">
                  <strong>{from?.name || '—'}</strong> {humanVerb(s.label, s.async)} <strong>{to?.name || '—'}</strong>
                  {s.async && <span className="journey-tag">async</span>}
                </span>
              </li>
            );
          })}
          {steps.length === 0 && <li className="muted">This flow has no steps yet.</li>}
        </ol>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

// ============================================================================
// Tab 2 — Capability Map
// ============================================================================
function CapabilitiesTab({ components, allTypes, degrees, onPick }) {
  const layers = getLayerDefs();
  const grouped = useMemo(() => {
    const buckets = new Map(layers.map((l) => [l.id, []]));
    components.forEach((c) => {
      const id = layerOf(c);
      buckets.get(id)?.push(c);
    });
    return layers.map((l) => ({ ...l, items: buckets.get(l.id) || [] })).filter((l) => l.items.length > 0);
  }, [components, layers]);

  return (
    <section className="mgmt-section">
      <h3>What this system can do</h3>
      <p className="muted">Every technical component, translated into the business capability it provides. Click a card to see what happens if it fails.</p>
      <div className="capability-layers">
        {grouped.map((layer) => (
          <div key={layer.id} className={`capability-layer capability-layer--${layer.id}`}>
            <header className="capability-layer-head">
              <h4>{layer.label}</h4>
              <p className="muted">{layer.blurb}</p>
            </header>
            <div className="capability-grid">
              {layer.items.map((c) => {
                const desc = describeComponent(c, allTypes);
                const audience = audienceFor(c);
                const inDeg = degrees.incoming.get(c.id) || 0;
                const outDeg = degrees.outgoing.get(c.id) || 0;
                const health = healthFor(c, { incoming: inDeg, outgoing: outDeg, allTypes });
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`capability-card health-${health}`}
                    onClick={() => onPick(c)}
                  >
                    <div className="capability-card-head">
                      <span className="capability-icon" style={{ color: c.color || '#5B6CFF' }}>
                        <ComponentIcon type={c.type} color={c.color || '#5B6CFF'} size={24} />
                      </span>
                      <span className={`health-pill health-${health}`}>{healthLabel(health)}</span>
                    </div>
                    <strong className="capability-name">{c.name}</strong>
                    <span className="capability-type muted">{desc.label}</span>
                    <p className="capability-text">{desc.text}</p>
                    <footer className="capability-audience">
                      <span className="muted">Used by</span> {audience}
                    </footer>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// Tab 3 — Pain Points & Risks
// ============================================================================
function RisksTab({ components, connections, allTypes, onPick }) {
  const risks = useMemo(() => buildRisks({ components, connections, allTypes }), [components, connections, allTypes]);
  const summary = useMemo(() => summariseRisks(risks), [risks]);
  const compById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);

  const [filter, setFilter] = useState('all'); // all | Critical | High | Medium | Low
  const filtered = filter === 'all' ? risks : risks.filter((r) => r.severity === filter);

  const scoreBand = summary.score > 60 ? 'red' : summary.score > 30 ? 'amber' : 'green';

  return (
    <section className="mgmt-section">
      <header className="risk-summary">
        <div className={`risk-score risk-score--${scoreBand}`}>
          <span className="risk-score-value">{summary.score}</span>
          <span className="risk-score-label">Risk score</span>
        </div>
        <div className="risk-summary-text">
          <h3>{summary.band}</h3>
          <p className="muted">
            {summary.by.Critical || 0} critical · {summary.by.High || 0} high · {summary.by.Medium || 0} medium · {summary.by.Low || 0} low.
            Lower score = healthier system.
          </p>
        </div>
        <div className="risk-filter">
          {['all','Critical','High','Medium','Low'].map((f) => (
            <button
              key={f}
              type="button"
              className={`risk-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >{f === 'all' ? 'All' : f}</button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="muted">No risks at this severity. 🎉</p>
      ) : (
        <ul className="risk-list">
          {filtered.map((r) => (
            <li key={r.id} className={`risk-card sev-${String(r.severity).toLowerCase()}`}>
              <div className="risk-card-head">
                <span className={`sev-badge sev-${String(r.severity).toLowerCase()}`}>{r.severity}</span>
                <span className={`lik-badge lik-${String(r.likelihood).toLowerCase()}`}>{r.likelihood} likelihood</span>
                <button
                  type="button"
                  className="risk-card-target link-btn"
                  onClick={() => {
                    const c = compById.get(r.componentId);
                    if (c) onPick(c);
                  }}
                  title="Open component details"
                >{r.componentName}</button>
              </div>
              <strong className="risk-title">{r.title}</strong>
              <p className="risk-impact"><span className="muted">Business impact:</span> {r.impact}</p>
              <p className="risk-rec"><span className="muted">Recommendation:</span> {r.recommendation}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
// Tab 4 — What-if Scenarios
// ============================================================================
function ScenariosTab({ components, connections, allTypes, onPick }) {
  const scenarios = useMemo(() => buildScenarios({ components, connections }), [components, connections]);
  const compById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const [activeId, setActiveId] = useState(scenarios[0]?.id || null);
  useEffect(() => {
    if (!scenarios.length) { setActiveId(null); return; }
    if (!activeId || !scenarios.find((s) => s.id === activeId)) setActiveId(scenarios[0].id);
  }, [scenarios, activeId]);

  const scenario = scenarios.find((s) => s.id === activeId);

  return (
    <section className="mgmt-section">
      <h3>What if…</h3>
      <p className="muted">Toggle a realistic scenario to see what would happen and which parts of the system would be affected.</p>
      <div className="scenario-toggles">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scenario-toggle ${activeId === s.id ? 'active' : ''}`}
            onClick={() => setActiveId(s.id)}
          >
            {s.title}
          </button>
        ))}
        {scenarios.length === 0 && <span className="muted">Add more components to unlock scenarios.</span>}
      </div>

      {scenario && (
        <div className="scenario-detail">
          <div className="scenario-info">
            <h4>{scenario.title}</h4>
            <p>{scenario.description}</p>
            <div className="scenario-block">
              <span className="scenario-label">What it means</span>
              <p>{scenario.consequence}</p>
            </div>
            <div className="scenario-block">
              <span className="scenario-label">Customer impact</span>
              <p>{scenario.userImpact}</p>
            </div>
            <div className="scenario-block scenario-block--rec">
              <span className="scenario-label">Recommended response</span>
              <p>{scenario.response}</p>
            </div>
          </div>
          <div className="scenario-map">
            <span className="scenario-map-title">Affected components</span>
            <div className="scenario-map-grid">
              {components.map((c) => {
                const sev = scenario.severityById?.[c.id] || (scenario.affectedIds.includes(c.id) ? 'amber' : 'none');
                const desc = describeComponent(c, allTypes);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`scenario-chip sev-${sev}`}
                    onClick={() => onPick(c)}
                    title={desc.text}
                  >
                    <ComponentIcon type={c.type} color={c.color || '#5B6CFF'} size={18} />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="scenario-legend muted">
              <span><span className="dot dot-red" /> Severely affected</span>
              <span><span className="dot dot-amber" /> Degraded</span>
              <span><span className="dot dot-none" /> Unaffected</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Drawer — plain-English explainer for a single component
// ============================================================================
function ExplainerDrawer({ component, allTypes, degrees, onClose }) {
  const desc = describeComponent(component, allTypes);
  const inDeg = degrees.incoming.get(component.id) || 0;
  const outDeg = degrees.outgoing.get(component.id) || 0;
  const health = healthFor(component, { incoming: inDeg, outgoing: outDeg, allTypes });
  const recovery = formatRecovery(recoveryMinutesFor(component));
  const audience = audienceFor(component);

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mgmt-drawer-backdrop" onClick={onClose}>
      <aside className="mgmt-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`About ${component.name}`}>
        <header className="mgmt-drawer-head">
          <span className="capability-icon" style={{ color: component.color || '#5B6CFF' }}>
            <ComponentIcon type={component.type} color={component.color || '#5B6CFF'} size={32} />
          </span>
          <div>
            <strong>{component.name}</strong>
            <span className="muted">{desc.label}</span>
          </div>
          <button type="button" className="link-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="mgmt-drawer-body">
          <p className="lead">{desc.text}</p>
          <dl className="kv">
            <dt>Used by</dt><dd>{audience}</dd>
            <dt>Current health</dt><dd><span className={`health-pill health-${health}`}>{healthLabel(health)}</span></dd>
            <dt>If this fails</dt><dd>{failureBlurb(component, allTypes)}</dd>
            <dt>How fast we recover</dt><dd>{recovery}</dd>
            <dt>Who is impacted</dt><dd>{impactBlurb(component, allTypes)}</dd>
          </dl>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function healthLabel(h) {
  if (h === 'red') return '● Critical';
  if (h === 'amber') return '● At risk';
  return '● Healthy';
}

function failureBlurb(c, allTypes) {
  const t = String(c.type || '').toLowerCase().replace(/\s|-/g, '');
  if (['postgres','mysql','sqlserver','database','warehouse'].includes(t)) {
    return 'Anything that reads or writes to this store stops working until it is back.';
  }
  if (['cache','redis','inmemory'].includes(t)) {
    return 'Things still work but become noticeably slower while the cache rebuilds.';
  }
  if (['external_api','external'].includes(t)) {
    return 'Features that depend on this partner break; the rest of the system carries on.';
  }
  if (['gateway','apigateway','api-gateway','loadbalancer','lb','edge','cdn'].includes(t)) {
    return 'Customers cannot reach the system at all until traffic is re-routed.';
  }
  if (['kafka','queue','topic','stream','eventbus','event','webhook'].includes(t)) {
    return 'Messages back up — anything reacting to those events appears delayed.';
  }
  return 'The features powered by this service are unavailable until it recovers.';
}

function impactBlurb(c, allTypes) {
  return audienceFor(c) === 'Customers' ? 'Paying customers directly.' : `${audienceFor(c)} — and any downstream features they rely on.`;
}

function formatMs(ms) {
  if (!ms) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function humanVerb(label, async) {
  const v = (label || '').trim();
  if (!v) return async ? 'notifies' : 'calls';
  return v.toLowerCase();
}

// Recover ordered actor list as it first appears in the steps.
function orderedActors(steps, compById) {
  const seen = new Set();
  const out = [];
  steps.forEach((s) => {
    [s.fromId, s.toId].forEach((id) => {
      if (id && !seen.has(id)) {
        seen.add(id);
        const c = compById.get(id);
        if (c) out.push(c);
      }
    });
  });
  return out;
}

// Parse our own generated sequenceDiagram to recover ordered steps with
// fromId, toId, label and async flag. Robust to the standardizations we
// added (par/and/end blocks, activate/deactivate, notes).
function parseFlowMermaid(code, components) {
  const aliasToId = new Map();
  const lines = String(code || '').split('\n');
  // 1) Build alias→id map from `participant <alias> as "<display> (<typeLabel>)"`.
  const nameToId = new Map(components.map((c) => [c.name, c.id]));
  lines.forEach((raw) => {
    const m = raw.match(/^\s*(?:participant|actor)\s+(\S+)\s+as\s+"([^"]+)"\s*$/);
    if (m) {
      const alias = m[1];
      const display = m[2].replace(/\s*\([^)]*\)\s*$/, '').trim();
      const id = nameToId.get(display);
      if (id) aliasToId.set(alias, id);
    }
  });
  // 2) Walk message lines.
  const stepRe = /^\s*(\S+?)(->>|-->>)(\S+?)\s*:\s*(.+)$/;
  const steps = [];
  lines.forEach((raw, lineIdx) => {
    const m = raw.match(stepRe);
    if (!m) return;
    const fromId = aliasToId.get(m[1]);
    const toId = aliasToId.get(m[3]);
    if (!fromId || !toId) return;
    steps.push({
      key: `step-${lineIdx}`,
      fromId,
      toId,
      label: m[4].trim(),
      async: m[2] === '-->>'
    });
  });
  return steps;
}
