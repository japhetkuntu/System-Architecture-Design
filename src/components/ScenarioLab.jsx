import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ReactFlow, {
  Background, Handle, Position, ReactFlowProvider, useReactFlow, MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import ComponentIcon from '../utils/componentIcons.jsx';
import { describeComponent } from '../utils/managementInsights.js';
import {
  newScenarioTemplate, runScenario, newScenarioId
} from '../utils/scenarioSimulator.js';

/**
 * ScenarioLab — a fully visual, replica-driven scenario simulator.
 *
 * The lab mirrors the architecture as a live, read-only canvas. Users
 * click any node to edit its scenario behaviour (mode, latency, returns,
 * failure reason). Pressing Play animates the request packet hopping
 * across the actual replica diagram, while the trace + assertions update
 * alongside. The existing real "Simulate" mode is untouched.
 */
export default function ScenarioLab({
  components, connections, allTypes,
  scenarios, onScenariosChange
}) {
  const [activeId, setActiveId] = useState(scenarios[0]?.id || null);
  useEffect(() => {
    if (!scenarios.length) { setActiveId(null); return; }
    if (!activeId || !scenarios.find((s) => s.id === activeId)) setActiveId(scenarios[0].id);
  }, [scenarios, activeId]);

  const [focusMode, setFocusMode] = useState(false);
  const active = scenarios.find((s) => s.id === activeId) || null;
  const update = (next) => onScenariosChange(scenarios.map((s) => s.id === next.id ? next : s));
  const remove = (id) => {
    const next = scenarios.filter((s) => s.id !== id);
    onScenariosChange(next);
    if (id === activeId) setActiveId(next[0]?.id || null);
  };
  const add = () => {
    const tpl = newScenarioTemplate({ components, connections });
    onScenariosChange([...scenarios, tpl]);
    setActiveId(tpl.id);
  };
  const duplicate = (id) => {
    const src = scenarios.find((s) => s.id === id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = newScenarioId();
    copy.name = `${src.name} (copy)`;
    onScenariosChange([...scenarios, copy]);
    setActiveId(copy.id);
  };

  if (!components.length) {
    return (
      <div className="scn-lab">
        <div className="scn-empty">
          <h3>🧪 Scenario Lab</h3>
          <p className="muted">Add components and connections first, then come back to design test scenarios that play out on a live replica of your architecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scn-lab">
      <header className="scn-lab-head">
        <div>
          <h3>🧪 Scenario Lab</h3>
          <p className="muted">Design test cases on a live replica of your architecture. Click any component to set what it returns or how it fails, then press play to watch the request hop through.</p>
        </div>
        <div className="scn-lab-actions">
          <button type="button" className="link-btn" onClick={() => setFocusMode((value) => !value)}>
            {focusMode ? 'Exit focus' : 'Focus canvas'}
          </button>
          <button type="button" className="primary-btn small" onClick={add}>+ New scenario</button>
        </div>
      </header>

      <div className={`scn-lab-body ${focusMode ? 'is-focused' : ''}`}>
        {!focusMode && (
          <aside className="scn-sidebar">
          {scenarios.length === 0 ? (
            <div className="scn-empty-side">
              <p className="muted">No scenarios yet.</p>
              <button type="button" className="primary-btn small" onClick={add}>Create your first</button>
            </div>
          ) : (
            <ul className="scn-list">
              {scenarios.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <li key={s.id} className={`scn-list-item ${isActive ? 'is-active' : ''}`}>
                    <button type="button" className="scn-list-btn" onClick={() => setActiveId(s.id)}>
                      <strong>{s.name || 'Untitled'}</strong>
                      <span className="muted">{(s.inputs || []).length} input{(s.inputs || []).length === 1 ? '' : 's'} · {(s.expectations || []).length} assertion{(s.expectations || []).length === 1 ? '' : 's'}</span>
                    </button>
                    <div className="scn-list-actions">
                      <button type="button" className="link-btn" onClick={() => duplicate(s.id)} title="Duplicate">⎘</button>
                      <button type="button" className="link-btn" onClick={() => remove(s.id)} title="Delete">✕</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>)}

        <section className="scn-main">
          {active ? (
            <ReactFlowProvider>
              <ScenarioEditor
                scenario={active}
                components={components}
                connections={connections}
                allTypes={allTypes}
                focusMode={focusMode}
                onChange={update}
              />
            </ReactFlowProvider>
          ) : (
            <div className="scn-empty"><p className="muted">Select or create a scenario to begin.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// Single-scenario editor + replica + runner
// ============================================================================
function ScenarioEditor({ scenario, components, connections, allTypes, focusMode, onChange }) {
  const compById = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const set = (patch) => onChange({ ...scenario, ...patch });

  // -------- Inputs --------
  const setInput = (i, patch) => set({ inputs: scenario.inputs.map((x, idx) => idx === i ? { ...x, ...patch } : x) });
  const addInput = () => set({ inputs: [...(scenario.inputs || []), { key: 'newField', value: '' }] });
  const removeInput = (i) => set({ inputs: scenario.inputs.filter((_, idx) => idx !== i) });

  // -------- Behaviours --------
  const setBehaviour = (componentId, patch) => {
    const next = { ...(scenario.behaviours || {}) };
    next[componentId] = { ...(next[componentId] || {}), ...patch };
    set({ behaviours: next });
  };
  const clearBehaviour = (componentId) => {
    const next = { ...(scenario.behaviours || {}) };
    delete next[componentId];
    set({ behaviours: next });
  };

  // -------- Expectations --------
  const setExp = (i, patch) => set({ expectations: scenario.expectations.map((x, idx) => idx === i ? { ...x, ...patch } : x) });
  const addExp = (kind) => set({ expectations: [...(scenario.expectations || []), defaultExpectation(kind)] });
  const removeExp = (i) => set({ expectations: scenario.expectations.filter((_, idx) => idx !== i) });

  // -------- Run + playback --------
  const result = useMemo(
    () => runScenario(scenario, { components, connections, allTypes }),
    [scenario, components, connections, allTypes]
  );

  const [stepIndex, setStepIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(900);
  const timerRef = useRef(null);
  useEffect(() => { setStepIndex(-1); setPlaying(false); }, [scenario.id]);
  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= result.trace.length - 1) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setStepIndex((i) => i + 1), speed);
    return () => clearTimeout(timerRef.current);
  }, [playing, stepIndex, result.trace.length, speed]);

  const reset = () => { setPlaying(false); setStepIndex(-1); };
  const play = () => { if (stepIndex >= result.trace.length - 1) setStepIndex(-1); setPlaying(true); };
  const next = () => setStepIndex((i) => Math.min(result.trace.length - 1, i + 1));
  const prev = () => setStepIndex((i) => Math.max(-1, i - 1));
  const jumpEnd = () => { setPlaying(false); setStepIndex(result.trace.length - 1); };

  const currentStep = stepIndex >= 0 ? result.trace[stepIndex] : null;
  const passed = result.passed;
  const verdictClass = passed ? 'is-pass' : (result.aborted ? 'is-abort' : 'is-fail');
  const [topCollapsed, setTopCollapsed] = useState(false);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const zoomReset = () => {
    try { fitView({ padding: 0.15, duration: 300 }); } catch { /* ignore */ }
  };

  // -------- Selected node for inline behaviour editing --------
  const [selectedId, setSelectedId] = useState(scenario.entryId || components[0]?.id || null);
  useEffect(() => {
    if (!components.find((c) => c.id === selectedId)) setSelectedId(components[0]?.id || null);
  }, [components, selectedId]);
  // While playing, track the active step so the inspector follows the packet.
  useEffect(() => {
    if (currentStep) setSelectedId(currentStep.componentId);
  }, [currentStep]);

  const selectedComp = compById.get(selectedId) || null;

  const ResponsePanel = () => (
    <div className="scn-response-panel">
      <div className="scn-response-body">
        {currentStep ? (
          <div className="scn-response-block scn-response-envelope">
            <strong>{currentStep.componentName} envelope</strong>
            <pre>{JSON.stringify(stripInternal(currentStep.envelopeOut), null, 2)}</pre>
          </div>
        ) : (
          <p className="muted">No active response yet; start or step through the simulation.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="scn-editor">
      <div className={`scn-top-panel ${topCollapsed ? 'is-collapsed' : ''}`}>
        <div className="scn-top-panel-head">
          <div>
            <h4>Scenario details</h4>
            <p className="muted">Toggle to hide the top controls and keep the canvas visible.</p>
          </div>
          <button type="button" className="link-btn" onClick={() => setTopCollapsed((value) => !value)}>
            {topCollapsed ? 'Show details' : 'Hide details'}
          </button>
        </div>

        <div className="scn-top">
          <div className="scn-top-left">
            <input
              type="text"
              className="scn-input scn-input--title"
              value={scenario.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Scenario name"
            />
            <textarea
              className="scn-input"
              rows={1}
              value={scenario.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Optional description — what does this test prove?"
            />
          </div>
          <div className="scn-top-right">
            <label className="scn-label">📥 Inputs <em className="muted">— travel into the entry component</em></label>
            <div className="scn-inputs">
              {(scenario.inputs || []).map((inp, i) => (
                <div key={i} className="scn-input-row">
                  <input
                    type="text"
                    className="scn-input scn-input--key"
                    value={inp.key}
                    onChange={(e) => setInput(i, { key: e.target.value })}
                    placeholder="field"
                  />
                  <input
                    type="text"
                    className="scn-input scn-input--val"
                    value={inp.value}
                    onChange={(e) => setInput(i, { value: maybeNumber(e.target.value) })}
                    placeholder="value"
                  />
                  <button type="button" className="link-btn" onClick={() => removeInput(i)} title="Remove">✕</button>
                </div>
              ))}
              <button type="button" className="link-btn" onClick={addInput}>+ Add field</button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Replica canvas + inspector ---------------- */}
      <div className={`scn-stage ${focusMode ? 'is-focused' : ''}`}>
        {focusMode && (
          <div className="scn-focus-actions">
            <div className="scn-focus-head">
              <h4>Simulation controls</h4>
              <span className="muted">Quick access while focused.</span>
            </div>
            <div className="scn-focus-controls">
              <button type="button" className="primary-btn small" onClick={playing ? () => setPlaying(false) : play} disabled={!result.trace.length}>
                {playing ? '⏸ Pause' : (stepIndex >= result.trace.length - 1 ? '▶ Replay' : '▶ Play')}
              </button>
              <button type="button" className="secondary-btn" onClick={prev} disabled={stepIndex < 0}>◀ Prev</button>
              <button type="button" className="secondary-btn" onClick={next} disabled={stepIndex >= result.trace.length - 1}>Next ▶</button>
              <button type="button" className="secondary-btn" onClick={jumpEnd} disabled={stepIndex >= result.trace.length - 1}>⏭ End</button>
              <button type="button" className="link-btn" onClick={reset} disabled={stepIndex < 0}>Reset</button>
            </div>
            <div className="scn-focus-controls">
              <button type="button" className="secondary-btn" onClick={zoomOut}>－ Zoom out</button>
              <button type="button" className="secondary-btn" onClick={zoomIn}>＋ Zoom in</button>
              <button type="button" className="secondary-btn" onClick={zoomReset}>Fit view</button>
            </div>
            <div className="scn-focus-meta">
              <label className="scn-speed">
                Speed
                <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                  <option value={1500}>0.5×</option>
                  <option value={900}>1×</option>
                  <option value={500}>2×</option>
                  <option value={250}>4×</option>
                </select>
              </label>
              <span className="muted scn-step-counter">Step {Math.max(0, stepIndex + 1)} / {result.trace.length}</span>
            </div>
            <ResponsePanel />
          </div>
        )}

        <div className="scn-canvas-wrap">
          <ReplicaCanvas
            components={components}
            connections={connections}
            allTypes={allTypes}
            scenario={scenario}
            currentStep={currentStep}
            selectedId={selectedId}
            onSelect={(id) => { setPlaying(false); setSelectedId(id); }}
          />
          <div className="scn-canvas-overlay">
            <div className="scn-canvas-legend">
              <span><span className="scn-dot scn-dot-entry" /> entry</span>
              <span><span className="scn-dot scn-dot-active" /> current step</span>
              <span><span className="scn-dot scn-dot-fail" /> failure</span>
              <span><span className="scn-dot scn-dot-override" /> override set</span>
            </div>
          </div>
        </div>

        <aside className={`scn-inspector ${focusMode ? 'is-hidden' : ''}`}>
          {selectedComp ? (
            <NodeInspector
              component={selectedComp}
              allTypes={allTypes}
              isEntry={scenario.entryId === selectedComp.id}
              behaviour={scenario.behaviours?.[selectedComp.id] || {}}
              onSetEntry={() => set({ entryId: selectedComp.id })}
              onChangeBehaviour={(patch) => setBehaviour(selectedComp.id, patch)}
              onClearBehaviour={() => clearBehaviour(selectedComp.id)}
              currentStep={currentStep && currentStep.componentId === selectedComp.id ? currentStep : null}
            />
          ) : (
            <p className="muted">Click any component on the replica to configure its behaviour.</p>
          )}
        </aside>
      </div>

      {/* ---------------- Run controls ---------------- */}
      <div className={`scn-block scn-run ${focusMode ? 'is-hidden' : ''}`}>
        <header className="scn-block-head">
          <h4>▶ Run</h4>
          <span className={`scn-verdict ${verdictClass}`}>
            {result.aborted ? '✗ Aborted' : passed ? '✓ PASS' : '✗ FAIL'}
          </span>
        </header>
        <p className="muted">{result.summary}</p>
        <div className="scn-controls">
          <button type="button" className="primary-btn small" onClick={playing ? () => setPlaying(false) : play} disabled={!result.trace.length}>
            {playing ? '⏸ Pause' : (stepIndex >= result.trace.length - 1 ? '▶ Replay' : '▶ Play')}
          </button>
          <button type="button" className="secondary-btn" onClick={prev} disabled={stepIndex < 0}>◀</button>
          <button type="button" className="secondary-btn" onClick={next} disabled={stepIndex >= result.trace.length - 1}>▶</button>
          <button type="button" className="secondary-btn" onClick={jumpEnd} disabled={stepIndex >= result.trace.length - 1}>⏭</button>
          <button type="button" className="link-btn" onClick={reset} disabled={stepIndex < 0}>Reset</button>
          <label className="scn-speed">
            Speed
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
              <option value={1500}>0.5×</option>
              <option value={900}>1×</option>
              <option value={500}>2×</option>
              <option value={250}>4×</option>
            </select>
          </label>
          <span className="muted scn-step-counter">Step {Math.max(0, stepIndex + 1)} / {result.trace.length}</span>
        </div>

        {currentStep && (
          <div className="scn-current">
            <div className="scn-current-head">
              <ComponentIcon type={compById.get(currentStep.componentId)?.type} color={compById.get(currentStep.componentId)?.color || '#5B6CFF'} size={28} />
              <div>
                <strong>{currentStep.componentName}</strong>
                <span className="muted"> ← {currentStep.fromComponentName || '⏵ entry'}{currentStep.incomingLabel && currentStep.incomingLabel !== '__entry__' ? ` · ${currentStep.incomingLabel}` : ''}</span>
              </div>
              <span className="scn-current-latency">~{currentStep.latencyMs}ms</span>
            </div>
            {currentStep.narrative && <p className="scn-narrative">{currentStep.narrative}</p>}
            {currentStep.failure && <p className="scn-failure">✗ {currentStep.failure}</p>}
            <div className="scn-envelope">
              <span className="muted scn-env-label">Data envelope at this step</span>
              <pre>{JSON.stringify(stripInternal(currentStep.envelopeOut), null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      {!focusMode && (
        <ResponsePanel />
      )}

      {/* ---------------- Expectations ---------------- */}
      <div className="scn-block">
        <header className="scn-block-head">
          <h4>🎯 Expectations</h4>
          <div className="scn-exp-add">
            <button type="button" className="link-btn" onClick={() => addExp('no-failure')}>+ No failure</button>
            <button type="button" className="link-btn" onClick={() => addExp('visits')}>+ Visits</button>
            <button type="button" className="link-btn" onClick={() => addExp('skips')}>+ Skips</button>
            <button type="button" className="link-btn" onClick={() => addExp('output')}>+ Output equals</button>
            <button type="button" className="link-btn" onClick={() => addExp('max-latency')}>+ Max latency</button>
            <button type="button" className="link-btn" onClick={() => addExp('min-steps')}>+ Min steps</button>
          </div>
        </header>
        <ul className="scn-exp-list">
          {(scenario.expectations || []).map((exp, i) => (
            <li key={i} className="scn-exp-row">
              <ExpectationEditor exp={exp} components={components} onChange={(patch) => setExp(i, patch)} />
              <button type="button" className="link-btn" onClick={() => removeExp(i)} title="Remove">✕</button>
            </li>
          ))}
          {(scenario.expectations || []).length === 0 && <li className="muted">No assertions — add one to define what success looks like.</li>}
        </ul>
        <div className="scn-row">
          <label className="scn-label">Free-form expected output</label>
          <textarea
            rows={2}
            className="scn-input"
            placeholder="e.g. Order created with id ORD-1234 and email sent"
            value={scenario.expectedOutput || ''}
            onChange={(e) => set({ expectedOutput: e.target.value })}
          />
        </div>
      </div>

      {/* ---------------- Trace + assertions + final ---------------- */}
      <div className="scn-block">
        <header className="scn-block-head">
          <h4>📜 Trace</h4>
          <span className="muted">Click any step to jump there.</span>
        </header>
        <ol className="scn-trace">
          {result.trace.map((s, i) => (
            <li key={i} className={`scn-trace-step ${i <= stepIndex ? 'is-past' : ''} ${i === stepIndex ? 'is-here' : ''} ${s.failure ? 'is-failure' : ''}`}
                onClick={() => { setPlaying(false); setStepIndex(i); }} role="button" tabIndex={0}>
              <span className="scn-trace-num">{i + 1}</span>
              <span className="scn-trace-text">
                <strong>{s.componentName}</strong>
                {s.fromComponentName && <span className="muted"> ← {s.fromComponentName}</span>}
                {s.failure && <span className="scn-trace-failure"> · {s.failure}</span>}
              </span>
              <span className="muted scn-trace-latency">{s.latencyMs}ms</span>
            </li>
          ))}
          {result.trace.length === 0 && <li className="muted">Engine produced no steps. Pick an entry component with outgoing connections.</li>}
        </ol>

        <div className="scn-assertions">
          <h5>Assertions</h5>
          {result.assertions.length === 0 && <p className="muted">No assertions defined.</p>}
          <ul>
            {result.assertions.map((a) => (
              <li key={a.id} className={a.passed ? 'is-pass' : 'is-fail'}>
                <span className="scn-assert-icon">{a.passed ? '✓' : '✗'}</span>
                <span className="scn-assert-label">{a.label}</span>
                <span className="muted scn-assert-detail">expected {a.expected}, got {a.actual}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="scn-final">
          <span className="muted scn-env-label">Final data envelope</span>
          <pre>{JSON.stringify(stripInternal(result.finalEnvelope), null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Replica Canvas — read-only ReactFlow mirror with playback highlighting.
// ============================================================================
function ReplicaCanvas(props) {
  return <ReplicaCanvasInner {...props} />;
}

const NODE_W = 170, NODE_H = 64;
const GRID_GAP_X = 220, GRID_GAP_Y = 110;
function autoPosition(i) {
  const cols = 4;
  return { x: 60 + (i % cols) * GRID_GAP_X, y: 60 + Math.floor(i / cols) * GRID_GAP_Y };
}

function ReplicaCanvasInner({ components, connections, allTypes, scenario, currentStep, selectedId, onSelect }) {
  const { fitView, setCenter } = useReactFlow();

  const activeNodeId = currentStep?.componentId || null;
  const previousNodeId = currentStep?.fromComponentId || null;
  const failedNodeId = currentStep?.failure ? currentStep.componentId : null;
  const activeEdge = useMemo(() => {
    if (!currentStep || !previousNodeId || !activeNodeId) return null;
    return connections.find((e) => e.fromId === previousNodeId && e.toId === activeNodeId) || null;
  }, [currentStep, previousNodeId, activeNodeId, connections]);

  const nodes = useMemo(() => components.map((c, i) => {
    const pos = c.position || autoPosition(i);
    const hasOverride = !!scenario.behaviours?.[c.id] && Object.keys(scenario.behaviours[c.id]).length > 0;
    return {
      id: c.id,
      type: 'replica',
      position: pos,
      data: {
        component: c,
        allTypes,
        isEntry: scenario.entryId === c.id,
        isActive: c.id === activeNodeId,
        isPrevious: c.id === previousNodeId,
        isFailed: c.id === failedNodeId,
        isSelected: c.id === selectedId,
        hasOverride
      },
      draggable: false,
      selectable: false,
      width: NODE_W,
      height: NODE_H
    };
  }), [components, allTypes, scenario, activeNodeId, previousNodeId, failedNodeId, selectedId]);

  useEffect(() => {
    if (!activeNodeId) return;
    const activeNode = nodes.find((n) => n.id === activeNodeId);
    if (!activeNode) return;

    const centerX = activeNode.position.x + (activeNode.width || NODE_W) / 2;
    const centerY = activeNode.position.y + (activeNode.height || NODE_H) / 2;
    const timer = setTimeout(() => {
      try {
        setCenter(centerX, centerY, { duration: 250 });
      } catch {
        /* ignore if React Flow is not ready yet */
      }
    }, 80);

    return () => clearTimeout(timer);
  }, [activeNodeId, nodes, setCenter]);

  const edges = useMemo(() => connections.map((e) => {
    const isActive = activeEdge?.id === e.id;
    return {
      id: e.id,
      source: e.fromId,
      target: e.toId,
      label: e.label || allTypes?.[e.kind]?.label || e.kind,
      animated: isActive,
      style: {
        stroke: isActive ? '#5B6CFF' : 'rgba(120,130,150,0.55)',
        strokeWidth: isActive ? 3 : 1.5
      },
      labelStyle: { fontSize: 11 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#5B6CFF' : 'rgba(120,130,150,0.7)' }
    };
  }), [connections, allTypes, activeEdge]);

  useEffect(() => {
    const t = setTimeout(() => { try { fitView({ padding: 0.15, duration: 250 }); } catch { /* ignore */ } }, 80);
    return () => clearTimeout(t);
  }, [components.length, fitView]);

  const nodeTypes = useMemo(() => ({ replica: ReplicaNode }), []);
  const handleNodeClick = useCallback((evt, node) => { onSelect?.(node.id); }, [onSelect]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      panOnDrag
      zoomOnScroll={false}
      zoomOnPinch
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} size={1} color="rgba(120,130,150,0.18)" />
    </ReactFlow>
  );
}

function ReplicaNode({ data }) {
  const c = data.component;
  const klass = [
    'scn-node',
    data.isEntry && 'is-entry',
    data.isActive && 'is-active',
    data.isPrevious && 'is-previous',
    data.isFailed && 'is-failed',
    data.isSelected && 'is-selected',
    data.hasOverride && 'has-override'
  ].filter(Boolean).join(' ');
  const desc = describeComponent(c, data.allTypes);
  return (
    <div className={klass} style={{ borderColor: c.color || undefined }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="scn-node-icon" style={{ background: c.color || '#5B6CFF' }}>
        <ComponentIcon type={c.type} color="#ffffff" size={18} />
      </div>
      <div className="scn-node-body">
        <strong className="scn-node-name">{c.name}</strong>
        <span className="muted scn-node-type">{desc.label}</span>
      </div>
      {data.hasOverride && <span className="scn-node-badge" title="Behaviour override set">●</span>}
      {data.isEntry && <span className="scn-node-pin" title="Entry point">⏵</span>}
      {data.isActive && <span className="scn-node-pulse" />}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// ============================================================================
// Per-node inspector
// ============================================================================
function NodeInspector({ component, allTypes, isEntry, behaviour, currentStep, onSetEntry, onChangeBehaviour, onClearBehaviour }) {
  const desc = describeComponent(component, allTypes);
  const dirty = Object.keys(behaviour).length > 0;
  return (
    <div className="scn-inspector-card">
      <header className="scn-inspector-head">
        <ComponentIcon type={component.type} color={component.color || '#5B6CFF'} size={22} />
        <div>
          <strong>{component.name}</strong>
          <span className="muted scn-inspector-type">{desc.label}</span>
        </div>
      </header>

      <div className="scn-inspector-row">
        <button type="button" className={`secondary-btn ${isEntry ? 'is-active' : ''}`} onClick={onSetEntry} disabled={isEntry}>
          {isEntry ? '⏵ This is the entry' : '⏵ Make entry point'}
        </button>
      </div>

      <div className="scn-inspector-row">
        <label>Mode</label>
        <select value={behaviour.mode || 'success'} onChange={(e) => onChangeBehaviour({ mode: e.target.value })}>
          <option value="success">✓ Success</option>
          <option value="slow">🐢 Slow (5×)</option>
          <option value="skip">↷ Skip</option>
          <option value="fail">✗ Fail</option>
        </select>
      </div>
      <div className="scn-inspector-row">
        <label>Latency (ms)</label>
        <input type="number" min="0" value={behaviour.latencyMs ?? ''} placeholder="auto"
          onChange={(e) => onChangeBehaviour({ latencyMs: e.target.value === '' ? undefined : +e.target.value })} />
      </div>
      {behaviour.mode === 'fail' && (
        <div className="scn-inspector-row">
          <label>Failure reason</label>
          <input type="text" value={behaviour.failureReason || ''}
            onChange={(e) => onChangeBehaviour({ failureReason: e.target.value })}
            placeholder="e.g. Timeout after 5s" />
        </div>
      )}
      <div className="scn-inspector-row">
        <label>Returns (JSON)</label>
        <textarea
          rows={3}
          placeholder='{"status":"OK"}'
          value={typeof behaviour.returns === 'object' ? JSON.stringify(behaviour.returns) : (behaviour.returnsRaw || '')}
          onChange={(e) => {
            const raw = e.target.value;
            let parsed;
            try { parsed = raw ? JSON.parse(raw) : undefined; } catch { parsed = undefined; }
            onChangeBehaviour({ returns: parsed, returnsRaw: parsed === undefined ? raw : undefined });
          }}
        />
      </div>
      {dirty && (
        <button type="button" className="link-btn" onClick={onClearBehaviour}>Reset to defaults</button>
      )}
      {currentStep && (
        <div className="scn-inspector-step">
          <span className="muted scn-env-label">Live at step {currentStep.index + 1}</span>
          <p className="scn-narrative">{currentStep.narrative}</p>
          {currentStep.failure && <p className="scn-failure">✗ {currentStep.failure}</p>}
          <pre>{JSON.stringify(stripInternal(currentStep.envelopeOut), null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ExpectationEditor({ exp, components, onChange }) {
  switch (exp.kind) {
    case 'no-failure':
      return <span className="scn-exp-pill">No failure along the path</span>;
    case 'visits':
    case 'skips':
      return (
        <span className="scn-exp-form">
          <span className="scn-exp-pill">{exp.kind === 'visits' ? 'Must visit' : 'Must skip'}</span>
          <select value={exp.componentId || ''} onChange={(e) => {
            const c = components.find((x) => x.id === e.target.value);
            onChange({ componentId: e.target.value, componentName: c?.name });
          }}>
            <option value="">— pick component —</option>
            {components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </span>
      );
    case 'output':
      return (
        <span className="scn-exp-form">
          <span className="scn-exp-pill">Output</span>
          <input type="text" placeholder="path e.g. order.status" value={exp.path || ''} onChange={(e) => onChange({ path: e.target.value })} />
          <span className="muted">equals</span>
          <input type="text" placeholder="value" value={exp.equals ?? ''} onChange={(e) => onChange({ equals: maybeNumber(e.target.value) })} />
        </span>
      );
    case 'max-latency':
      return (
        <span className="scn-exp-form">
          <span className="scn-exp-pill">Total latency ≤</span>
          <input type="number" min="0" value={exp.ms ?? ''} onChange={(e) => onChange({ ms: +e.target.value })} />
          <span className="muted">ms</span>
        </span>
      );
    case 'min-steps':
      return (
        <span className="scn-exp-form">
          <span className="scn-exp-pill">At least</span>
          <input type="number" min="1" value={exp.count ?? ''} onChange={(e) => onChange({ count: +e.target.value })} />
          <span className="muted">steps executed</span>
        </span>
      );
    default:
      return <span className="muted">Unknown</span>;
  }
}

function defaultExpectation(kind) {
  switch (kind) {
    case 'no-failure':  return { kind };
    case 'visits':      return { kind, componentId: '' };
    case 'skips':       return { kind, componentId: '' };
    case 'output':      return { kind, path: '', equals: '' };
    case 'max-latency': return { kind, ms: 1000 };
    case 'min-steps':   return { kind, count: 1 };
    default:            return { kind };
  }
}

function maybeNumber(v) {
  if (v === '' || v == null) return v;
  const n = Number(v);
  return Number.isFinite(n) && String(n) === String(v).trim() ? n : v;
}

function stripInternal(env) {
  const out = {};
  Object.keys(env || {}).forEach((k) => { if (!k.startsWith('__')) out[k] = env[k]; });
  return out;
}
