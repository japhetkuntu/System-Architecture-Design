// Convert an architecture (components + connections) into derived UML
// diagrams. Pure functions — easy to test, easy to reuse from anywhere.

// Component types we treat as ingress / external triggers when no explicit
// "no incoming connections" entry-point exists.
const ENTRY_TYPES = new Set([
  'user', 'browser', 'mobile', 'client',
  'gateway', 'apigateway', 'api-gateway',
  'cron', 'scheduler', 'cronjob',
  'queue', 'eventbus', 'event', 'topic', 'webhook',
  'cdn', 'lb', 'loadbalancer'
]);

function safeName(name) {
  // Mermaid sequenceDiagram participant aliases must be safe identifiers.
  // We keep the human label as the display name.
  return (name || 'unknown')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'node';
}

function escSeqLabel(s) {
  // Sequence diagram line labels can't contain raw newlines or semicolons.
  return String(s || '')
    .replace(/[\n\r]+/g, ' ')
    .replace(/;/g, ',')
    .trim();
}

/**
 * Detect "flows" — ordered chains of connections starting at an entry point.
 *
 * @returns Array<{ id, name, entryId, steps: Array<connection> }>
 *   where `steps` are connections (in their stable index order) reachable
 *   from `entryId` via a BFS that respects the user's connection ordering.
 */
export function detectFlows({ components, connections }) {
  if (!components?.length || !connections?.length) return [];

  const compById = new Map(components.map((c) => [c.id, c]));
  const outByFrom = new Map();
  connections.forEach((conn, idx) => {
    if (!outByFrom.has(conn.fromId)) outByFrom.set(conn.fromId, []);
    outByFrom.get(conn.fromId).push({ ...conn, _idx: idx });
  });

  const incoming = new Map();
  connections.forEach((c) => {
    incoming.set(c.toId, (incoming.get(c.toId) || 0) + 1);
  });

  // 1. Components with NO incoming edges are natural entry points.
  // 2. Plus anything whose type is in ENTRY_TYPES (even if it has incoming),
  //    because users like to start a flow from "User" / "Cron" explicitly.
  const entryIds = new Set();
  components.forEach((c) => {
    if (!incoming.get(c.id)) entryIds.add(c.id);
    const t = String(c.type || '').toLowerCase().replace(/\s|-/g, '');
    if (ENTRY_TYPES.has(t)) entryIds.add(c.id);
  });

  // Fallback: if nothing qualifies (everything is a cycle), seed with the
  // source of the first connection so we still produce something useful.
  if (entryIds.size === 0 && connections[0]) {
    entryIds.add(connections[0].fromId);
  }

  const flows = [];
  for (const entryId of entryIds) {
    const entry = compById.get(entryId);
    if (!entry) continue;
    if (!outByFrom.has(entryId)) continue; // entry with no outgoing — skip

    // BFS from entry; visit each EDGE at most once (allow node revisits).
    const visitedEdges = new Set();
    const queue = [entryId];
    const steps = [];
    while (queue.length) {
      const nodeId = queue.shift();
      const outs = outByFrom.get(nodeId) || [];
      // Preserve user-defined connection order.
      outs.sort((a, b) => a._idx - b._idx);
      for (const conn of outs) {
        if (visitedEdges.has(conn.id)) continue;
        visitedEdges.add(conn.id);
        steps.push(conn);
        queue.push(conn.toId);
      }
    }

    if (!steps.length) continue;
    flows.push({
      id: `flow-${entryId}`,
      entryId,
      name: entry.name || 'Flow',
      steps
    });
  }

  // Sort flows so the longest / most-meaningful appear first.
  flows.sort((a, b) => b.steps.length - a.steps.length);
  return flows;
}

/**
 * Build a Mermaid `sequenceDiagram` from a single flow.
 *
 * Standardizations applied (UML-style):
 *   • `title` and `autonumber` for legibility.
 *   • Participants declared up-front in first-seen order, with type labels.
 *   • `Note over <entry>` opens the flow with a trigger description.
 *   • Sync calls use `->>` and bracket the callee with `activate`/`deactivate`
 *     so the lifeline shows execution bars (proper UML semantics).
 *   • Async / fire-and-forget calls use `-->>` and get a side note marking
 *     them as asynchronous (no activation — sender doesn't block).
 *   • Consecutive calls from the same source to *different* targets are
 *     wrapped in `par` / `and` blocks to convey fan-out in parallel.
 *   • Self-calls render as a single `->>` with the standard self-loop.
 *   • Closing `Note over <last>` marks the end of the flow.
 */
export function buildSequenceMermaid(flow, { components, allTypes } = {}) {
  if (!flow || !flow.steps?.length) {
    return 'sequenceDiagram\n  Note over System: No flow detected';
  }
  const compById = new Map((components || []).map((c) => [c.id, c]));
  const aliasOf = new Map();
  const usedAliases = new Set();
  function aliasFor(id) {
    if (aliasOf.has(id)) return aliasOf.get(id);
    const c = compById.get(id);
    let base = safeName(c?.name || id);
    let alias = base;
    let n = 2;
    while (usedAliases.has(alias)) { alias = `${base}_${n++}`; }
    usedAliases.add(alias);
    aliasOf.set(id, alias);
    return alias;
  }

  const participants = [];
  const seenParticipants = new Set();
  function ensureParticipant(id) {
    if (seenParticipants.has(id)) return;
    seenParticipants.add(id);
    const c = compById.get(id);
    const alias = aliasFor(id);
    const display = (c?.name || id).replace(/"/g, "'");
    const typeLabel = allTypes?.[c?.type]?.label || c?.type || '';
    const labelText = typeLabel ? `${display} (${typeLabel})` : display;
    // `actor` for human/external participants, `participant` for systems.
    const t = String(c?.type || '').toLowerCase().replace(/\s|-/g, '');
    const isActor = ['user', 'customer', 'admin', 'browser', 'mobile', 'phone', 'client'].includes(t);
    participants.push(`  ${isActor ? 'actor' : 'participant'} ${alias} as "${labelText}"`);
  }

  // Pre-declare participants in first-seen order (entry first, then targets).
  ensureParticipant(flow.entryId);
  flow.steps.forEach((s) => { ensureParticipant(s.fromId); ensureParticipant(s.toId); });

  const title = `Architecture flow: ${(flow.name || 'Main flow').replace(/"/g, "'")}`;
  const lines = ['sequenceDiagram', `  title ${title}`, '  autonumber', ...participants];

  // Opening note on the entry lifeline so management/readers immediately see
  // who initiates this flow.
  const entry = compById.get(flow.entryId);
  if (entry) {
    lines.push(`  Note over ${aliasFor(flow.entryId)}: Triggers "${(flow.name || 'flow').replace(/"/g, "'")}"`);
  }

  // Group consecutive fan-out (same source, different targets, all async-ish
  // or independent) into par/and blocks for clearer parallelism.
  const steps = flow.steps;
  const activeStack = []; // alias names currently activated (for sync calls)
  let i = 0;
  while (i < steps.length) {
    // Look ahead: does the next run share the same fromId AND have ≥2 distinct targets?
    let j = i;
    while (j < steps.length && steps[j].fromId === steps[i].fromId) j++;
    const groupSize = j - i;
    const distinctTargets = new Set(steps.slice(i, j).map((s) => s.toId));
    const useParallel = groupSize >= 2 && distinctTargets.size >= 2;

    if (useParallel) {
      lines.push(`  par ${aliasFor(steps[i].fromId) ? compById.get(steps[i].fromId)?.name || 'caller' : 'caller'} fans out`);
      for (let k = i; k < j; k++) {
        if (k > i) lines.push('  and');
        emitStep(steps[k], lines, aliasFor, allTypes, activeStack, '    ');
      }
      lines.push('  end');
    } else {
      for (let k = i; k < j; k++) {
        emitStep(steps[k], lines, aliasFor, allTypes, activeStack, '  ');
      }
    }
    i = j;
  }

  // Drain any remaining activations so the diagram is balanced.
  while (activeStack.length) {
    lines.push(`  deactivate ${activeStack.pop()}`);
  }

  // Closing marker on the lifeline of the last touched component.
  const lastStep = steps[steps.length - 1];
  if (lastStep) {
    lines.push(`  Note over ${aliasFor(lastStep.toId)}: End of flow`);
  }

  return lines.join('\n');
}

function emitStep(conn, lines, aliasFor, allTypes, activeStack, indent) {
  const fromAlias = aliasFor(conn.fromId);
  const toAlias = aliasFor(conn.toId);
  const rel = allTypes?.[conn.kind] || null;
  const label = escSeqLabel(conn.label || rel?.label || conn.kind || 'calls');
  // Decide sync/async by relationship arrow style:
  //   solid `-->`  → sync request (activates callee)
  //   dotted `-.>` → async fire-and-forget (no activation)
  const arrowDef = rel?.arrow || '';
  const isAsync = arrowDef.includes('-.') ||
    /async|publish|emit|enqueue|notify|fire|stream/i.test(label) ||
    /async|publish|emit|enqueue|notify|fire|stream/i.test(rel?.label || '');
  const arrow = isAsync ? '-->>' : '->>';
  lines.push(`${indent}${fromAlias}${arrow}${toAlias}: ${label}`);
  if (isAsync) {
    lines.push(`${indent}Note right of ${toAlias}: async — no immediate response`);
  } else {
    lines.push(`${indent}activate ${toAlias}`);
    activeStack.push(toAlias);
    // We deactivate eagerly after each sync step to keep the diagram readable
    // (Mermaid balances activations strictly). Real call-stack nesting would
    // require explicit return semantics we don't model.
    lines.push(`${indent}deactivate ${toAlias}`);
    activeStack.pop();
  }
}

/**
 * Convenience: detect flows + build sequence mermaid for each.
 */
export function buildAllSequenceDiagrams({ components, connections, allTypes }) {
  const flows = detectFlows({ components, connections });
  return flows.map((f) => ({
    id: f.id,
    name: f.name,
    stepCount: f.steps.length,
    mermaid: buildSequenceMermaid(f, { components, allTypes })
  }));
}
