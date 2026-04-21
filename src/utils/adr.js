// Archivise ADR (Architecture Decision Record) generator.
// Produces a Markdown document summarizing the differences between a
// captured baseline and the current architecture.

const FIELD_LABELS = {
  type: 'Type', name: 'Name', notes: 'Notes', icon: 'Icon', color: 'Color',
  fromId: 'From', toId: 'To', kind: 'Relationship', label: 'Label'
};

function compName(c, allTypes) {
  if (!c) return '(unknown)';
  const def = allTypes[c.type];
  const icon = c.icon || def?.icon || '';
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
  reviewers = ''
}) {
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

  // Decision
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

  // Consequences
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

  // Diagrams
  out.push('## Diagrams');
  out.push('');

  if (baseline && baselineMermaid) {
    out.push('### Before (baseline)');
    out.push('');
    out.push('```mermaid');
    out.push(baselineMermaid);
    out.push('```');
    out.push('');
  }

  out.push(baseline ? '### After (proposed)' : '### Architecture');
  out.push('');
  out.push('```mermaid');
  out.push(mermaid);
  out.push('```');
  out.push('');

  if (baseline && diffMermaid) {
    out.push('### Diff overview');
    out.push('');
    out.push('> Legend: green = added · red dashed = removed · amber = modified');
    out.push('');
    out.push('```mermaid');
    out.push(diffMermaid);
    out.push('```');
    out.push('');
  }

  // Alternatives considered
  if (alternatives && alternatives.trim()) {
    out.push('## Alternatives considered');
    out.push('');
    out.push(alternatives.trim());
    out.push('');
  }

  // Related ADRs
  if (relatedAdrs && relatedAdrs.trim()) {
    out.push('## Related ADRs');
    out.push('');
    relatedAdrs.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      out.push(`- ${line}`);
    });
    out.push('');
  }

  // Reviewers / sign-off
  if (reviewers && reviewers.trim()) {
    out.push('## Reviewers & sign-off');
    out.push('');
    reviewers.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      out.push(`- [ ] ${line}`);
    });
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(`_Generated by Archivise on ${today}._`);
  out.push('');
  return out.join('\n');
}
