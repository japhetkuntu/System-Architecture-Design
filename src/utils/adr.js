// Archivise ADR (Architecture Decision Record) generator.
// Produces a Markdown document summarizing the differences between a
// captured baseline and the current architecture.

const FIELD_LABELS = {
  type: 'Type', name: 'Name', notes: 'Notes', icon: 'Icon', color: 'Color',
  fromId: 'From', toId: 'To', kind: 'Relationship', label: 'Label'
};

const TYPE_ICON_FALLBACK = {
  service: '⚙️',
  client: '💻',
  external: '🌐',
  database: '🗄️',
  queue: '📨',
  topic: '📣',
  workflow: '🧭',
  function: 'λ',
  api: '⚙️',
  cache: '⚡',
  eventbus: '🚌',
  scheduler: '⏰',
  secrets: '🔐',
  telemetry: '📊',
  loadbalancer: '⚖️',
  apigateway: '🚪',
  idp: '🛡️',
  customer: '🧑',
  mobile: '📱'
};

function compName(c, allTypes) {
  if (!c) return '(unknown)';
  const def = allTypes[c.type];
  const icon = c.icon || def?.icon || TYPE_ICON_FALLBACK[c.type] || '';
  const name = c.name || def?.label || c.id;
  return `${icon ? icon + ' ' : ''}${name}`.trim();
}

function compTypeLabel(c, allTypes) {
  return allTypes[c.type]?.label || c.type;
}

function connDesc(conn, components, allTypes) {
  const f = components.find((c) => c.id === conn.fromId);
  const t = components.find((c) => c.id === conn.toId);
  const verb = conn.label || conn.kind;
  return `**${compName(f, allTypes)}** → **${compName(t, allTypes)}** (${verb})`;
}

function fmtFieldChange(field, change, allTypes, allComps) {
  const label = FIELD_LABELS[field] || field;
  let from = change.from;
  let to = change.to;
  // For from/toId in connections, render component names instead of ids
  if (field === 'fromId' || field === 'toId') {
    from = compName(allComps.find((c) => c.id === from), allTypes);
    to = compName(allComps.find((c) => c.id === to), allTypes);
  }
  return `${label}: \`${from || '∅'}\` → \`${to || '∅'}\``;
}

function statsLine(diff) {
  if (!diff) return '';
  const c = diff.components, e = diff.connections;
  const total = c.added.length + c.removed.length + c.modified.length
    + e.added.length + e.removed.length + e.modified.length
    + (diff.title ? 1 : 0);
  return `**${total}** total change${total === 1 ? '' : 's'} — `
    + `${c.added.length + e.added.length} added · `
    + `${c.removed.length + e.removed.length} removed · `
    + `${c.modified.length + e.modified.length} modified`;
}

function summarizeArchitecture(arch, allTypes) {
  const groups = {};
  arch.components.forEach((c) => {
    const g = allTypes[c.type]?.group || 'Other';
    (groups[g] = groups[g] || []).push(c);
  });
  const groupSummary = Object.entries(groups)
    .map(([g, items]) => `${items.length} ${g.toLowerCase()}`)
    .join(', ');
  return `${arch.components.length} component${arch.components.length === 1 ? '' : 's'} `
    + `(${groupSummary || 'none'}) and `
    + `${arch.connections.length} connection${arch.connections.length === 1 ? '' : 's'}`;
}

function inferConsequences(diff, allTypes, allComps) {
  const positive = [];
  const risks = [];
  const followUps = [];

  if (diff.components.added.length) {
    diff.components.added.forEach((c) => {
      const t = compTypeLabel(c, allTypes).toLowerCase();
      if (t.includes('queue')) {
        positive.push(`Introduces async decoupling via **${compName(c, allTypes)}** — improves resilience and back-pressure handling.`);
      } else if (t.includes('cache')) {
        positive.push(`Adds caching layer **${compName(c, allTypes)}** — should reduce read latency and downstream load.`);
        risks.push(`Cache invalidation strategy for **${compName(c, allTypes)}** must be defined.`);
      } else if (t.includes('search')) {
        positive.push(`Adds search capability via **${compName(c, allTypes)}**.`);
        followUps.push(`Define indexing strategy and reindex plan for **${compName(c, allTypes)}**.`);
      } else if (t.includes('external')) {
        risks.push(`New external dependency **${compName(c, allTypes)}** introduces a vendor SLA, credentials, and failure mode to manage.`);
      } else {
        positive.push(`New ${t}: **${compName(c, allTypes)}**.`);
      }
    });
  }

  if (diff.components.removed.length) {
    diff.components.removed.forEach((c) => {
      risks.push(`**${compName(c, allTypes)}** is being removed — verify no consumers still depend on it.`);
    });
  }

  if (diff.connections.added.length) {
    positive.push(`${diff.connections.added.length} new interaction${diff.connections.added.length === 1 ? '' : 's'} between services — see *Decision* section.`);
  }
  if (diff.connections.removed.length) {
    risks.push(`${diff.connections.removed.length} interaction${diff.connections.removed.length === 1 ? '' : 's'} removed — confirm callers have been migrated and nothing breaks downstream.`);
  }
  if (diff.components.modified.length) {
    diff.components.modified.forEach((m) => {
      if (m.changes.type) {
        risks.push(`**${compName(m.after, allTypes)}** changed type from \`${m.changes.type.from}\` to \`${m.changes.type.to}\` — this is a structural change.`);
      }
      if (m.changes.name) {
        followUps.push(`Rename of **${m.changes.name.from}** → **${m.changes.name.to}** may affect logs, dashboards, and runbooks.`);
      }
    });
  }

  if (!positive.length) positive.push('No new capabilities introduced.');
  if (!risks.length) risks.push('No notable risks identified from this diff.');

  return { positive, risks, followUps };
}

export function generateAdrMarkdown({
  number = null,
  status = 'Proposed',
  author = '',
  title,
  baseline,
  current,
  diff,
  allTypes,
  mermaid,
  baselineMermaid,
  diffMermaid,
  alternatives = '',
  relatedAdrs = '',
  reviewers = '',
  // NEW (all optional, backward-compatible):
  // - sections: per-section toggles. Anything missing defaults to true.
  // - diagrams: explicit list of {label, code} to embed in the Diagrams
  //   section. When provided, overrides the default baseline/current/diff
  //   trio so callers can include sequence diagrams etc.
  // - customSections: array of { heading, body } appended after the
  //   built-in sections, before the footer.
  sections = {},
  diagrams = null,
  customSections = [],
  // NEW (Phase B intelligence):
  // - flowInsights: array of analyseFlow() outputs to render under "Orchestration".
  // - risks: { items: buildRisks(...), summary: summariseRisks(...) } to render under "Risks".
  // - scenarioResults: array of { scenario, result } pairs from runScenario to render
  //   under "Scenario test results".
  flowInsights = null,
  risks = null,
  scenarioResults = null
}) {
  const want = (key, fallback = true) => (sections[key] === undefined ? fallback : !!sections[key]);
  const today = new Date().toISOString().slice(0, 10);
  const adrTitle = title || current?.title || 'Architecture change';
  const numStr = number ? `ADR-${String(number).padStart(4, '0')}` : 'ADR';

  const out = [];
  out.push(`# ${numStr}: ${adrTitle}`);
  out.push('');
  out.push(`- **Status**: ${status}`);
  out.push(`- **Date**: ${today}`);
  if (author) out.push(`- **Author**: ${author}`);
  if (baseline?.capturedAt) {
    out.push(`- **Baseline captured**: ${new Date(baseline.capturedAt).toLocaleString()}`);
  }
  out.push('');

  // Context
  if (want('context')) {
    out.push('## Context');
    out.push('');
    if (baseline) {
      out.push(`The existing architecture, **${baseline.title}**, currently consists of ${summarizeArchitecture(baseline, allTypes)}.`);
      out.push('');
      out.push(`We are proposing changes that result in **${current.title}**, which will consist of ${summarizeArchitecture(current, allTypes)}.`);
    } else {
      out.push(`This document captures the initial design of **${current.title}**, consisting of ${summarizeArchitecture(current, allTypes)}.`);
    }
    out.push('');
  }

  // Decision
  if (want('decision')) {
    out.push('## Decision');
    out.push('');

  if (diff) {
    out.push(statsLine(diff));
    out.push('');

    if (diff.title) {
      out.push(`### Renamed`);
      out.push(`- Title changed from *${diff.title.from}* to **${diff.title.to}**`);
      out.push('');
    }

    const allComps = [
      ...baseline.components,
      ...current.components.filter((c) => !baseline.components.find((b) => b.id === c.id))
    ];

    if (diff.components.added.length) {
      out.push(`### ➕ Added components (${diff.components.added.length})`);
      diff.components.added.forEach((c) => {
        const note = c.notes ? ` — ${c.notes}` : '';
        out.push(`- **${compName(c, allTypes)}** *(${compTypeLabel(c, allTypes)})*${note}`);
      });
      out.push('');
    }

    if (diff.components.removed.length) {
      out.push(`### ➖ Removed components (${diff.components.removed.length})`);
      diff.components.removed.forEach((c) => {
        const note = c.notes ? ` — ${c.notes}` : '';
        out.push(`- ~~**${compName(c, allTypes)}**~~ *(${compTypeLabel(c, allTypes)})*${note}`);
      });
      out.push('');
    }

    if (diff.components.modified.length) {
      out.push(`### ✏️ Modified components (${diff.components.modified.length})`);
      diff.components.modified.forEach((m) => {
        out.push(`- **${compName(m.after, allTypes)}**`);
        Object.entries(m.changes).forEach(([f, v]) => {
          out.push(`  - ${fmtFieldChange(f, v, allTypes, allComps)}`);
        });
      });
      out.push('');
    }

    if (diff.connections.added.length) {
      out.push(`### 🔗 New interactions (${diff.connections.added.length})`);
      diff.connections.added.forEach((e) => out.push(`- ${connDesc(e, allComps, allTypes)}`));
      out.push('');
    }

    if (diff.connections.removed.length) {
      out.push(`### 🚫 Removed interactions (${diff.connections.removed.length})`);
      diff.connections.removed.forEach((e) => out.push(`- ~~${connDesc(e, allComps, allTypes)}~~`));
      out.push('');
    }

    if (diff.connections.modified.length) {
      out.push(`### ✏️ Modified interactions (${diff.connections.modified.length})`);
      diff.connections.modified.forEach((m) => {
        out.push(`- ${connDesc(m.after, allComps, allTypes)}`);
        Object.entries(m.changes).forEach(([f, v]) => {
          out.push(`  - ${fmtFieldChange(f, v, allTypes, allComps)}`);
        });
      });
      out.push('');
    }

    if (
      !diff.components.added.length && !diff.components.removed.length &&
      !diff.components.modified.length && !diff.connections.added.length &&
      !diff.connections.removed.length && !diff.connections.modified.length &&
      !diff.title
    ) {
      out.push('_No changes detected between the baseline and the current architecture._');
      out.push('');
    }
  } else {
    out.push('### Components');
    current.components.forEach((c) => {
      const note = c.notes ? ` — ${c.notes}` : '';
      out.push(`- **${compName(c, allTypes)}** *(${compTypeLabel(c, allTypes)})*${note}`);
    });
    out.push('');
    if (current.connections.length) {
      out.push('### Interactions');
      current.connections.forEach((e) => out.push(`- ${connDesc(e, current.components, allTypes)}`));
      out.push('');
    }
  }
  } // end Decision

  // Consequences
  if (want('consequences')) {
    out.push('## Consequences');
    out.push('');

    if (diff) {
      const allComps = [...baseline.components, ...current.components];
      const { positive, risks, followUps } = inferConsequences(diff, allTypes, allComps);
      out.push('### ✅ Positive');
      positive.forEach((p) => out.push(`- ${p}`));
      out.push('');
      out.push('### ⚠️ Risks & things to verify');
      risks.forEach((r) => out.push(`- ${r}`));
      out.push('');
      if (followUps.length) {
        out.push('### 📋 Follow-ups');
        followUps.forEach((f) => out.push(`- ${f}`));
        out.push('');
      }
    } else {
      out.push('_(Document positive outcomes, risks, and follow-ups once baseline diff is available.)_');
      out.push('');
    }
  }

  // Diagrams
  if (want('diagrams')) {
    // Build the list of diagrams to embed. If the caller passed an explicit
    // `diagrams` array, use it verbatim (so they can include sequence
    // diagrams, exclude the diff, etc.). Otherwise fall back to the
    // historical baseline / current / diff trio.
    let diagramList;
    if (Array.isArray(diagrams)) {
      diagramList = diagrams.filter((d) => d && d.code && (d.include !== false));
    } else {
      diagramList = [];
      if (baseline && baselineMermaid) {
        diagramList.push({ label: 'Before (baseline)', code: baselineMermaid });
      }
      if (mermaid) {
        diagramList.push({ label: baseline ? 'After (proposed)' : 'Architecture', code: mermaid });
      }
      if (baseline && diffMermaid) {
        diagramList.push({
          label: 'Diff overview',
          code: diffMermaid,
          legend: 'Legend: green = added · red dashed = removed · amber = modified'
        });
      }
    }

    if (diagramList.length) {
      out.push('## Diagrams');
      out.push('');
      diagramList.forEach((d) => {
        out.push(`### ${d.label || 'Diagram'}`);
        out.push('');
        if (d.legend) { out.push(`> ${d.legend}`); out.push(''); }
        if (d.description) { out.push(d.description); out.push(''); }
        out.push('```mermaid');
        out.push(d.code);
        out.push('```');
        out.push('');
      });
    }
  }

  // Alternatives considered
  if (want('alternatives') && alternatives && alternatives.trim()) {
    out.push('## Alternatives considered');
    out.push('');
    out.push(alternatives.trim());
    out.push('');
  }

  // Related ADRs
  if (want('related') && relatedAdrs && relatedAdrs.trim()) {
    out.push('## Related ADRs');
    out.push('');
    relatedAdrs.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      out.push(`- ${line}`);
    });
    out.push('');
  }

  // Reviewers / sign-off
  if (want('reviewers') && reviewers && reviewers.trim()) {
    out.push('## Reviewers & sign-off');
    out.push('');
    reviewers.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      out.push(`- [ ] ${line}`);
    });
    out.push('');
  }

  // ----- Phase B intelligence sections (all optional) -----

  // Orchestration insights per detected flow
  if (want('orchestration', false) && Array.isArray(flowInsights) && flowInsights.length) {
    out.push('## Orchestration insights');
    out.push('');
    flowInsights.forEach((ins) => {
      if (!ins) return;
      out.push(`### ${ins.name}`);
      out.push('');
      out.push(`- **Steps**: ${ins.stepCount} · **Components in path**: ${ins.componentCount}`);
      out.push(`- **Estimated latency**: ~${ins.estimatedLatencyMs}ms`);
      if (ins.slowest) out.push(`- **Slowest hop**: ${ins.slowest.name} (~${ins.slowest.ms}ms)`);
      out.push(`- **Sync / Async hops**: ${ins.syncCount} / ${ins.asyncCount}`);
      out.push(`- **External dependencies in path**: ${ins.externalCount}`);
      if (ins.fanOuts?.length) {
        out.push(`- **Fan-out points**: ${ins.fanOuts.map((f) => `${f.fromName} → ${f.targets.join(', ')}`).join('; ')}`);
      }
      if (ins.recommendations?.length) {
        out.push('');
        out.push('**Recommendations:**');
        ins.recommendations.forEach((r) => out.push(`- ${r}`));
      }
      out.push('');
    });
  }

  // Risk assessment
  if (want('risks', false) && risks && (risks.summary || (risks.items || []).length)) {
    out.push('## Risk assessment');
    out.push('');
    if (risks.summary) {
      const s = risks.summary;
      out.push(`**${s.total || (risks.items || []).length}** risk${(s.total || risks.items?.length) === 1 ? '' : 's'} identified — ${s.high || 0} high · ${s.medium || 0} medium · ${s.low || 0} low.`);
      out.push('');
    }
    (risks.items || []).forEach((r) => {
      const sev = (r.severity || 'medium').toUpperCase();
      const tgt = r.componentName ? ` (${r.componentName})` : '';
      out.push(`- **[${sev}]** ${r.title}${tgt} — ${r.recommendation || r.impact || ''}`);
    });
    out.push('');
  }

  // Scenario test results
  if (want('scenarios', false) && Array.isArray(scenarioResults) && scenarioResults.length) {
    out.push('## Scenario test results');
    out.push('');
    const passed = scenarioResults.filter((s) => s.result?.passed).length;
    out.push(`**${passed}/${scenarioResults.length}** scenario${scenarioResults.length === 1 ? '' : 's'} pass.`);
    out.push('');
    scenarioResults.forEach(({ scenario, result }) => {
      const icon = result?.passed ? '✓' : '✗';
      out.push(`### ${icon} ${scenario.name}`);
      out.push('');
      if (scenario.description) { out.push(scenario.description); out.push(''); }
      out.push(`- **Verdict**: ${result?.passed ? 'PASS' : (result?.aborted ? `ABORTED — ${result.abortReason}` : 'FAIL')}`);
      out.push(`- **Steps executed**: ${result?.trace?.length || 0}`);
      out.push(`- **Estimated latency**: ~${result?.totalLatencyMs || 0}ms`);
      if (result?.assertions?.length) {
        out.push('- **Assertions**:');
        result.assertions.forEach((a) => {
          out.push(`  - ${a.passed ? '✓' : '✗'} ${a.label} *(expected ${a.expected}, got ${a.actual})*`);
        });
      }
      out.push('');
    });
  }

  // Custom user-added sections
  if (Array.isArray(customSections)) {
    customSections.forEach((sec) => {
      const heading = (sec?.heading || '').trim();
      const body = (sec?.body || '').trim();
      if (!heading && !body) return;
      if (heading) { out.push(`## ${heading}`); out.push(''); }
      if (body) { out.push(body); out.push(''); }
    });
  }

  out.push('---');
  out.push('');
  out.push(`_Generated by Archivise on ${today}._`);
  out.push('');
  return out.join('\n');
}
