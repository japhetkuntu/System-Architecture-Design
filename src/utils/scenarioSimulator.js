// Scenario Simulator — a brand-new, data-driven simulation engine.
//
// Unlike the existing step-by-step "walk every connection" simulation, this
// engine lets the user define a *Scenario*: a named test case with concrete
// input data, per-component behaviour overrides, and an expected final
// outcome. The engine walks the architecture graph from a chosen entry
// component, computes a realistic trace, and compares the result against
// the user's expectations — producing a PASS/FAIL verdict with diagnostics.
//
// Pure functions only. No React, no DOM, no localStorage. UI lives in
// `src/components/ScenarioLab.jsx`. Persistence lives in App state.

import { describeComponent, layerOf, estimateStepMs } from './managementInsights.js';

// ---------------------------------------------------------------------------
// Default behaviour per component type. Each component decides what it does
// with the data envelope it receives. Behaviours are intentionally simple
// and overridable per-step in a Scenario.
// ---------------------------------------------------------------------------
const DEFAULT_BEHAVIOURS = {
  // Data stores: read/write a row keyed by an id-ish input.
  postgres:  { kind: 'datastore', verb: 'looks up', writes: false },
  mysql:     { kind: 'datastore', verb: 'looks up', writes: false },
  sqlserver: { kind: 'datastore', verb: 'looks up', writes: false },
  database:  { kind: 'datastore', verb: 'reads from', writes: false },
  warehouse: { kind: 'datastore', verb: 'queries', writes: false },
  search:    { kind: 'datastore', verb: 'searches', writes: false },
  storage:   { kind: 'datastore', verb: 'fetches file from', writes: false },
  hdd:       { kind: 'datastore', verb: 'reads file from', writes: false },

  // Caches: hit or miss.
  cache:     { kind: 'cache', verb: 'checks' },
  redis:     { kind: 'cache', verb: 'checks' },
  inmemory:  { kind: 'cache', verb: 'checks' },

  // Messaging: publish, no immediate response.
  kafka:     { kind: 'messaging', verb: 'publishes to' },
  queue:     { kind: 'messaging', verb: 'enqueues to' },
  topic:     { kind: 'messaging', verb: 'publishes to' },
  stream:    { kind: 'messaging', verb: 'streams to' },
  eventbus:  { kind: 'messaging', verb: 'emits onto' },
  event:     { kind: 'messaging', verb: 'fires' },
  webhook:   { kind: 'messaging', verb: 'POSTs webhook to' },

  // External / partner APIs.
  external:     { kind: 'external', verb: 'calls partner' },
  external_api: { kind: 'external', verb: 'calls partner' },

  // Edge / front door.
  gateway:      { kind: 'router', verb: 'routes via' },
  apigateway:   { kind: 'router', verb: 'routes via' },
  'api-gateway':{ kind: 'router', verb: 'routes via' },
  loadbalancer: { kind: 'router', verb: 'load-balances via' },
  lb:           { kind: 'router', verb: 'load-balances via' },
  cdn:          { kind: 'router', verb: 'serves via' },
  edge:         { kind: 'router', verb: 'serves via' },

  // Workers.
  bg_job:        { kind: 'worker', verb: 'runs background job' },
  consumer:      { kind: 'worker', verb: 'consumes from' },
  kafka_consumer:{ kind: 'worker', verb: 'consumes from' },
  scheduler:     { kind: 'worker', verb: 'is scheduled by' },
  cron:          { kind: 'worker', verb: 'is scheduled by' },

  // Default for services & APIs.
  api:          { kind: 'service', verb: 'calls' },
  internal_api: { kind: 'service', verb: 'calls' },
  public_api:   { kind: 'service', verb: 'calls' },
  service:      { kind: 'service', verb: 'calls' },
  function:     { kind: 'service', verb: 'invokes' },
  container:    { kind: 'service', verb: 'calls' },

  // People / clients.
  user:    { kind: 'actor', verb: 'starts request from' },
  customer:{ kind: 'actor', verb: 'starts request from' },
  admin:   { kind: 'actor', verb: 'starts request from' },
  browser: { kind: 'actor', verb: 'starts request from' },
  mobile:  { kind: 'actor', verb: 'starts request from' },
  phone:   { kind: 'actor', verb: 'starts request from' },
  ussd:    { kind: 'actor', verb: 'starts request from' },
  client:  { kind: 'actor', verb: 'starts request from' },
  frontend:{ kind: 'actor', verb: 'starts request from' }
};

function behaviourFor(component) {
  const t = String(component?.type || '').toLowerCase().replace(/\s|-/g, '');
  return DEFAULT_BEHAVIOURS[t] || { kind: 'service', verb: 'calls' };
}

// Friendly id used by Scenario forms.
export function newScenarioId() {
  return `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Scenario shape (documented for callers):
//
// {
//   id: 'scn_xxx',
//   name: 'Place order — happy path',
//   description: 'Customer places a $99 order, payment succeeds',
//   entryId: 'comp_user',                       // starting component id
//   inputs: [                                    // user-supplied data
//     { key: 'orderId',  value: 'ORD-1234' },
//     { key: 'amount',   value: 99.00 }
//   ],
//   behaviours: {                                // optional per-component overrides
//     [componentId]: {
//        mode: 'success' | 'fail' | 'slow' | 'skip',     // default 'success'
//        latencyMs: 80,                          // default = type-based
//        returns: { user: { id: 1, ... } },      // mock data merged into envelope
//        failureReason: 'Timeout after 5s',
//        note: 'free-text shown in trace'
//     }
//   },
//   expectations: [                              // optional assertions
//     { kind: 'visits', componentId: 'comp_db', op: 'in_path' },
//     { kind: 'output', path: 'order.status', equals: 'CONFIRMED' },
//     { kind: 'no-failure' },
//     { kind: 'max-latency', ms: 800 }
//   ],
//   expectedOutput: { ... }                      // free-form, also surfaced in UI
// }
// ---------------------------------------------------------------------------

// Build a default scenario seeded from the architecture so the user has
// something to edit instead of an empty form.
export function newScenarioTemplate({ components, connections }) {
  const entry = pickEntryComponent({ components, connections });
  return {
    id: newScenarioId(),
    name: 'New scenario',
    description: '',
    entryId: entry?.id || (components[0]?.id ?? null),
    inputs: [{ key: 'requestId', value: 'REQ-001' }],
    behaviours: {},
    expectations: [{ kind: 'no-failure' }],
    expectedOutput: ''
  };
}

function pickEntryComponent({ components, connections }) {
  if (!components.length) return null;
  const incoming = new Map();
  components.forEach((c) => incoming.set(c.id, 0));
  (connections || []).forEach((e) => incoming.set(e.toId, (incoming.get(e.toId) || 0) + 1));
  // Prefer actor types with no incoming edges.
  const actor = components.find((c) => behaviourFor(c).kind === 'actor' && (incoming.get(c.id) || 0) === 0);
  if (actor) return actor;
  // Otherwise the first component with no incoming.
  return components.find((c) => (incoming.get(c.id) || 0) === 0) || components[0];
}

// ---------------------------------------------------------------------------
// Run a single scenario against the architecture. Returns a deterministic
// result object: ordered trace + assertions + final envelope + verdict.
// ---------------------------------------------------------------------------
export function runScenario(scenario, { components, connections, allTypes }) {
  if (!scenario || !components?.length) {
    return emptyResult('Add components first.');
  }
  const entry = components.find((c) => c.id === scenario.entryId) || pickEntryComponent({ components, connections });
  if (!entry) return emptyResult('No entry component selected.');

  const compById = new Map(components.map((c) => [c.id, c]));
  const outByFrom = new Map();
  (connections || []).forEach((e) => {
    if (!outByFrom.has(e.fromId)) outByFrom.set(e.fromId, []);
    outByFrom.get(e.fromId).push(e);
  });

  const envelope = inputsToEnvelope(scenario.inputs);
  const trace = [];
  let totalLatency = 0;
  let aborted = false;
  let abortReason = null;

  // Iterative DFS so we visit each EDGE at most once but allow node revisits.
  const visitedEdges = new Set();
  const visitedNodes = new Set([entry.id]);
  const stack = [{ nodeId: entry.id, depth: 0, parentEdgeId: null, parentLabel: '__entry__' }];

  // First trace entry: the entry component itself.
  pushTrace({
    componentId: entry.id, componentName: entry.name,
    incomingLabel: '__entry__',
    behaviour: behaviourFor(entry),
    override: scenario.behaviours?.[entry.id] || null,
    envelopeIn: { ...envelope },
    envelopeOut: applyBehaviour(entry, scenario.behaviours?.[entry.id], envelope, allTypes).envelope,
    latencyMs: stepLatency(entry, scenario.behaviours?.[entry.id]),
    failure: null,
    isEntry: true
  });
  totalLatency += stepLatency(entry, scenario.behaviours?.[entry.id]);
  Object.assign(envelope, applyBehaviour(entry, scenario.behaviours?.[entry.id], envelope, allTypes).envelope);

  // Walk outgoing edges in user order.
  while (stack.length && !aborted) {
    const { nodeId } = stack.pop();
    const outs = (outByFrom.get(nodeId) || []).slice();
    outs.sort((a, b) => 0); // preserve insertion order
    for (const conn of outs) {
      if (visitedEdges.has(conn.id)) continue;
      visitedEdges.add(conn.id);
      const to = compById.get(conn.toId);
      if (!to) continue;
      visitedNodes.add(to.id);

      const override = scenario.behaviours?.[to.id] || null;
      const behaviour = behaviourFor(to);
      const envIn = { ...envelope };
      const { envelope: envOut, narrative } = applyBehaviour(to, override, envelope, allTypes, conn);
      const latencyMs = stepLatency(to, override);
      totalLatency += latencyMs;

      let failure = null;
      if (override?.mode === 'fail') {
        failure = override.failureReason || `${to.name} failed`;
      } else if (behaviour.kind === 'external' && override?.mode !== 'success') {
        // External calls can fail by default in 'auto' mode? Keep deterministic: only fail when user asks.
      }

      pushTrace({
        componentId: to.id, componentName: to.name,
        incomingLabel: conn.label || allTypes?.[conn.kind]?.label || conn.kind || 'calls',
        fromComponentId: nodeId, fromComponentName: compById.get(nodeId)?.name,
        behaviour, override,
        envelopeIn: envIn,
        envelopeOut: { ...envIn, ...envOut },
        narrative,
        latencyMs,
        failure
      });

      Object.assign(envelope, envOut);

      if (failure) {
        aborted = true;
        abortReason = failure;
        break;
      }

      // Continue traversal unless this is a terminal sink (cache hit, datastore returning, actor).
      if (behaviour.kind === 'datastore' || behaviour.kind === 'cache' || behaviour.kind === 'actor') {
        // datastores/caches typically don't fan out — but if user wired it, follow
      }
      stack.push({ nodeId: to.id });
    }
  }

  const assertions = evaluateAssertions(scenario.expectations || [], { trace, envelope, totalLatency, aborted });
  const passed = !aborted && assertions.every((a) => a.passed);

  function pushTrace(entry) {
    trace.push({ index: trace.length, ...entry });
  }

  return {
    ok: !aborted,
    passed,
    aborted,
    abortReason,
    totalLatencyMs: totalLatency,
    finalEnvelope: envelope,
    visitedComponentIds: [...visitedNodes],
    visitedEdgeIds: [...visitedEdges],
    trace,
    assertions,
    summary: summarise(trace, totalLatency, assertions, aborted)
  };
}

function emptyResult(message) {
  return {
    ok: false, passed: false, aborted: true, abortReason: message,
    totalLatencyMs: 0, finalEnvelope: {}, visitedComponentIds: [], visitedEdgeIds: [],
    trace: [], assertions: [], summary: message
  };
}

function inputsToEnvelope(inputs) {
  const env = { __inputs: {} };
  (inputs || []).forEach(({ key, value }) => {
    if (!key) return;
    env.__inputs[key] = value;
    env[key] = value;
  });
  return env;
}

function stepLatency(component, override) {
  if (override?.latencyMs != null && Number.isFinite(+override.latencyMs)) return Math.max(0, +override.latencyMs);
  if (override?.mode === 'skip') return 0;
  const base = estimateStepMs(component);
  if (override?.mode === 'slow') return base * 5;
  return base;
}

// Each component "does its job" with the envelope. The default behaviour is
// driven by component type; user can override the returned data.
function applyBehaviour(component, override, envelope, allTypes, conn) {
  const beh = behaviourFor(component);
  const desc = describeComponent(component, allTypes);
  let envOut = {};
  let narrative = '';

  if (override?.mode === 'skip') {
    narrative = `${component.name} is skipped`;
    return { envelope: {}, narrative };
  }

  if (override?.returns && typeof override.returns === 'object') {
    envOut = { ...override.returns };
  }

  switch (beh.kind) {
    case 'datastore': {
      const idKey = pickIdKey(envelope);
      const idVal = idKey ? envelope[idKey] : null;
      narrative = idKey
        ? `${component.name} ${beh.verb} record where ${idKey} = ${formatValue(idVal)}`
        : `${component.name} ${beh.verb} default record`;
      if (!override?.returns) {
        envOut[component.name.toLowerCase().replace(/\s+/g, '_')] = idVal != null ? { id: idVal, found: true } : { found: false };
      }
      break;
    }
    case 'cache': {
      const idKey = pickIdKey(envelope);
      narrative = idKey
        ? `${component.name} ${beh.verb} cache key ${idKey}`
        : `${component.name} ${beh.verb} cache`;
      if (!override?.returns) {
        envOut.cacheHit = override?.mode === 'success';
      }
      break;
    }
    case 'messaging': {
      narrative = `${component.name} ${beh.verb} an event`;
      if (!override?.returns) envOut.published = true;
      break;
    }
    case 'external': {
      narrative = `${component.name} ${beh.verb} (third-party)`;
      if (!override?.returns) envOut.partnerCalled = component.name;
      break;
    }
    case 'router': {
      narrative = `${component.name} ${beh.verb} the request`;
      break;
    }
    case 'worker': {
      narrative = `${component.name} processes the work`;
      break;
    }
    case 'actor': {
      narrative = `${component.name} initiates the request`;
      if (!override?.returns) envOut.requestStartedBy = component.name;
      break;
    }
    default: { // service
      const verbLabel = conn?.label || beh.verb;
      narrative = `${component.name} executes ${desc.label.toLowerCase()} (${verbLabel})`;
      break;
    }
  }

  return { envelope: envOut, narrative };
}

function pickIdKey(envelope) {
  const keys = Object.keys(envelope).filter((k) => !k.startsWith('__'));
  // Prefer keys ending with Id, _id, id.
  const idKey = keys.find((k) => /id$/i.test(k));
  return idKey || null;
}

function formatValue(v) {
  if (v == null) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
function evaluateAssertions(expectations, { trace, envelope, totalLatency, aborted }) {
  return (expectations || []).map((exp, idx) => {
    const id = `exp-${idx}`;
    try {
      switch (exp.kind) {
        case 'no-failure':
          return { id, kind: exp.kind, label: 'No failures along the path',
            passed: !aborted,
            actual: aborted ? 'flow aborted' : 'completed',
            expected: 'completed' };
        case 'visits': {
          const visited = trace.some((s) => s.componentId === exp.componentId);
          return { id, kind: exp.kind, label: `Visits ${exp.componentName || exp.componentId}`,
            passed: !!visited, actual: visited ? 'visited' : 'never visited', expected: 'visited' };
        }
        case 'skips': {
          const visited = trace.some((s) => s.componentId === exp.componentId);
          return { id, kind: exp.kind, label: `Does NOT visit ${exp.componentName || exp.componentId}`,
            passed: !visited, actual: visited ? 'visited' : 'skipped', expected: 'skipped' };
        }
        case 'output': {
          const actual = readPath(envelope, exp.path);
          const passed = String(actual) === String(exp.equals);
          return { id, kind: exp.kind, label: `Output ${exp.path} equals ${formatValue(exp.equals)}`,
            passed, actual: formatValue(actual), expected: formatValue(exp.equals) };
        }
        case 'max-latency': {
          const passed = totalLatency <= +exp.ms;
          return { id, kind: exp.kind, label: `Total latency ≤ ${exp.ms}ms`,
            passed, actual: `${totalLatency}ms`, expected: `≤ ${exp.ms}ms` };
        }
        case 'min-steps': {
          const passed = trace.length >= +exp.count;
          return { id, kind: exp.kind, label: `At least ${exp.count} steps executed`,
            passed, actual: `${trace.length}`, expected: `≥ ${exp.count}` };
        }
        default:
          return { id, kind: exp.kind || 'unknown', label: 'Unknown assertion', passed: false, actual: '?', expected: '?' };
      }
    } catch (e) {
      return { id, kind: exp.kind, label: 'Invalid assertion', passed: false, actual: e.message, expected: '—' };
    }
  });
}

function readPath(obj, path) {
  if (!path) return obj;
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function summarise(trace, totalLatency, assertions, aborted) {
  if (aborted) return `Flow aborted after ${trace.length} step${trace.length === 1 ? '' : 's'}.`;
  const passed = assertions.filter((a) => a.passed).length;
  const total = assertions.length;
  return `${trace.length} step${trace.length === 1 ? '' : 's'} executed in ~${totalLatency}ms. ${passed}/${total} assertion${total === 1 ? '' : 's'} passed.`;
}

// ---------------------------------------------------------------------------
// Orchestration intelligence — derived insights about a flow path.
// Used by both the journey-tab "Orchestration report" and the ADR.
// ---------------------------------------------------------------------------
export function analyseFlow(flow, { components, connections, allTypes }) {
  if (!flow || !flow.steps?.length) return null;
  const compById = new Map(components.map((c) => [c.id, c]));
  let syncCount = 0, asyncCount = 0;
  let slowest = null;
  let totalMs = 0;
  const fanOuts = [];
  const reachable = new Set([flow.entryId]);

  // Group steps by source for fan-out detection.
  const groups = new Map();
  flow.steps.forEach((s) => {
    const arr = groups.get(s.fromId) || [];
    arr.push(s);
    groups.set(s.fromId, arr);
  });
  groups.forEach((arr, fromId) => {
    if (arr.length >= 2) {
      const targets = arr.map((s) => compById.get(s.toId)?.name).filter(Boolean);
      fanOuts.push({ fromId, fromName: compById.get(fromId)?.name, targets });
    }
  });

  flow.steps.forEach((s) => {
    reachable.add(s.toId);
    const rel = allTypes?.[s.kind];
    const arrow = rel?.arrow || '';
    const isAsync = arrow.includes('-.') || /async|publish|emit|enqueue|notify|stream/i.test(`${s.label || ''} ${rel?.label || ''}`);
    if (isAsync) asyncCount++; else syncCount++;
    const target = compById.get(s.toId);
    const ms = estimateStepMs(target);
    totalMs += ms;
    if (!slowest || ms > slowest.ms) slowest = { ms, name: target?.name, id: target?.id };
  });

  const externalCount = [...reachable].filter((id) => {
    const c = compById.get(id);
    const t = String(c?.type || '').toLowerCase().replace(/\s|-/g, '');
    return t === 'external' || t === 'external_api';
  }).length;

  const recommendations = [];
  if (slowest && slowest.ms >= 200) {
    recommendations.push(`The slowest hop is ${slowest.name} (~${slowest.ms}ms). Consider caching, async, or a faster backend.`);
  }
  if (syncCount > 0 && asyncCount === 0 && flow.steps.length >= 4) {
    recommendations.push('All hops are synchronous — a failure anywhere fails the whole request. Consider moving non-critical work to a queue.');
  }
  if (fanOuts.length === 0 && flow.steps.length >= 5) {
    recommendations.push('No parallel fan-out detected. Independent calls could run in parallel to reduce latency.');
  }
  if (externalCount >= 2) {
    recommendations.push(`${externalCount} external services in this flow — outage of any one can break it. Add fallbacks/timeouts.`);
  }
  if (!recommendations.length) {
    recommendations.push('No obvious orchestration issues — looks well-shaped.');
  }

  return {
    name: flow.name,
    stepCount: flow.steps.length,
    componentCount: reachable.size,
    syncCount, asyncCount,
    fanOuts,
    slowest,
    estimatedLatencyMs: totalMs,
    externalCount,
    recommendations
  };
}
