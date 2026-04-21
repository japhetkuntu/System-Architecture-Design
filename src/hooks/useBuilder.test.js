import { describe, it, expect } from 'vitest';
import { mergeEdges, buildMermaid, computeDiff, runLints, DEFAULT_TYPES } from './useBuilder.js';

const t = DEFAULT_TYPES;

describe('mergeEdges', () => {
  it('merges parallel edges between the same pair of nodes', () => {
    const conns = [
      { id: '1', fromId: 'a', toId: 'b', kind: 'calls', label: 'read' },
      { id: '2', fromId: 'a', toId: 'b', kind: 'calls', label: 'write' },
      { id: '3', fromId: 'a', toId: 'b', kind: 'calls', label: '' }
    ];
    const merged = mergeEdges(conns);
    expect(merged).toHaveLength(1);
    expect(merged[0].fromId).toBe('a');
    expect(merged[0].toId).toBe('b');
    expect(merged[0].connIds).toEqual(['1', '2', '3']);
    expect(merged[0].labels).toContain('read');
    expect(merged[0].labels).toContain('write');
  });

  it('preserves edge notes', () => {
    const conns = [
      { id: '1', fromId: 'a', toId: 'b', kind: 'calls', label: 'call', note: 'async' },
      { id: '2', fromId: 'a', toId: 'b', kind: 'calls', label: 'call', note: 'retry' }
    ];
    const merged = mergeEdges(conns);
    expect(merged[0].notes).toContain('async');
    expect(merged[0].notes).toContain('retry');
  });
});

describe('buildMermaid', () => {
  it('produces a flowchart header with the configured direction', () => {
    const comps = [{ id: 'a', type: 'service', name: 'API', notes: '', icon: '' }];
    const merged = [];
    const mmdLR = buildMermaid({ components: comps, mergedEdges: merged, allTypes: t, layoutDir: 'LR' });
    const mmdTB = buildMermaid({ components: comps, mergedEdges: merged, allTypes: t, layoutDir: 'TB' });
    expect(mmdLR).toMatch(/flowchart LR/);
    expect(mmdTB).toMatch(/flowchart TB/);
  });

  it('emits subgraphs when useSubgraphs is true and omits them when false', () => {
    const comps = [
      { id: 'a', type: 'service', name: 'API', notes: '', icon: '' },
      { id: 'b', type: 'database', name: 'DB', notes: '', icon: '' }
    ];
    const withSub = buildMermaid({ components: comps, mergedEdges: [], allTypes: t, useSubgraphs: true });
    const noSub = buildMermaid({ components: comps, mergedEdges: [], allTypes: t, useSubgraphs: false });
    expect(withSub).toMatch(/subgraph/);
    expect(noSub).not.toMatch(/subgraph/);
  });
});

describe('computeDiff', () => {
  const a = { id: 'a', type: 'service', name: 'API', notes: '', icon: '', color: '' };
  const b = { id: 'b', type: 'database', name: 'DB', notes: '', icon: '', color: '' };
  const c = { id: 'c', type: 'client', name: 'Web', notes: '', icon: '', color: '' };

  it('detects added, removed, and modified components', () => {
    const diff = computeDiff(
      { title: 'X', components: [a, b], connections: [] },
      { title: 'X', components: [{ ...a, name: 'API v2' }, c], connections: [] }
    );
    expect(diff.components.added.map((x) => x.id)).toEqual(['c']);
    expect(diff.components.removed.map((x) => x.id)).toEqual(['b']);
    expect(diff.components.modified.map((m) => m.after.id)).toEqual(['a']);
    expect(diff.components.modified[0].changes).toHaveProperty('name');
  });

  it('returns null when there is no baseline', () => {
    expect(computeDiff(null, { title: 'X', components: [a], connections: [] })).toBeNull();
  });
});

describe('runLints', () => {
  it('flags duplicate component names', () => {
    const lints = runLints({
      components: [
        { id: 'a', type: 'service', name: 'API', notes: '', icon: '' },
        { id: 'b', type: 'service', name: 'API', notes: '', icon: '' }
      ],
      connections: []
    });
    expect(lints.some((l) => l.code === 'duplicate-name')).toBe(true);
  });

  it('flags orphan components with no connections', () => {
    const lints = runLints({
      components: [
        { id: 'a', type: 'service', name: 'API', notes: '', icon: '' },
        { id: 'b', type: 'database', name: 'DB', notes: '', icon: '' }
      ],
      connections: []
    });
    expect(lints.filter((l) => l.code === 'orphan').length).toBeGreaterThan(0);
  });

  it('detects short cycles', () => {
    const lints = runLints({
      components: [
        { id: 'a', type: 'service', name: 'A', notes: '', icon: '' },
        { id: 'b', type: 'service', name: 'B', notes: '', icon: '' }
      ],
      connections: [
        { id: '1', fromId: 'a', toId: 'b', kind: 'calls', label: '' },
        { id: '2', fromId: 'b', toId: 'a', kind: 'calls', label: '' }
      ]
    });
    expect(lints.some((l) => l.code === 'cycle')).toBe(true);
  });

  it('flags empty names', () => {
    const lints = runLints({
      components: [{ id: 'a', type: 'service', name: '', notes: '', icon: '' }],
      connections: []
    });
    expect(lints.some((l) => l.code === 'empty-name')).toBe(true);
  });
});
