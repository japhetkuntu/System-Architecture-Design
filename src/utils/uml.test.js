import { describe, it, expect } from 'vitest';
import { detectFlows, buildSequenceMermaid, buildAllSequenceDiagrams } from './uml.js';

const allTypes = {
  user: { label: 'User' },
  service: { label: 'Service' },
  db: { label: 'Database' }
};

describe('detectFlows', () => {
  it('returns empty when no components or connections', () => {
    expect(detectFlows({ components: [], connections: [] })).toEqual([]);
    expect(detectFlows({ components: [{ id: 'a', name: 'A' }], connections: [] })).toEqual([]);
  });

  it('starts a flow at components with no incoming edges', () => {
    const components = [
      { id: 'u', name: 'User', type: 'user' },
      { id: 's', name: 'Service', type: 'service' },
      { id: 'd', name: 'DB', type: 'db' }
    ];
    const connections = [
      { id: 'c1', fromId: 'u', toId: 's', kind: 'calls', label: 'request' },
      { id: 'c2', fromId: 's', toId: 'd', kind: 'reads',  label: 'query' }
    ];
    const flows = detectFlows({ components, connections });
    expect(flows).toHaveLength(1);
    expect(flows[0].entryId).toBe('u');
    expect(flows[0].steps.map((s) => s.id)).toEqual(['c1', 'c2']);
  });

  it('also starts a flow at entry-type components even if they have incoming edges', () => {
    const components = [
      { id: 'u', name: 'User', type: 'user' },
      { id: 's', name: 'Service', type: 'service' }
    ];
    const connections = [
      { id: 'c1', fromId: 'u', toId: 's', kind: 'calls' },
      { id: 'c2', fromId: 's', toId: 'u', kind: 'returns' }
    ];
    const flows = detectFlows({ components, connections });
    expect(flows.length).toBeGreaterThanOrEqual(1);
    expect(flows[0].entryId).toBe('u');
  });

  it('handles cycles without infinite loop (each edge visited at most once)', () => {
    const components = [
      { id: 'a', name: 'A', type: 'user' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' }
    ];
    const connections = [
      { id: 'e1', fromId: 'a', toId: 'b', kind: 'calls' },
      { id: 'e2', fromId: 'b', toId: 'c', kind: 'calls' },
      { id: 'e3', fromId: 'c', toId: 'b', kind: 'calls' }
    ];
    const flows = detectFlows({ components, connections });
    expect(flows[0].steps).toHaveLength(3);
  });
});

describe('buildSequenceMermaid', () => {
  it('produces a valid mermaid sequenceDiagram with autonumber + arrows', () => {
    const components = [
      { id: 'u', name: 'User', type: 'user' },
      { id: 's', name: 'Service', type: 'service' }
    ];
    const flow = {
      id: 'flow-u', entryId: 'u', name: 'User',
      steps: [{ id: 'c1', fromId: 'u', toId: 's', kind: 'calls', label: 'login' }]
    };
    const code = buildSequenceMermaid(flow, { components, allTypes });
    expect(code).toMatch(/^sequenceDiagram/);
    expect(code).toContain('autonumber');
    expect(code).toContain('participant');
    expect(code).toContain('->>');
    expect(code).toContain('1. login');
  });

  it('uses async arrow for dotted-arrow relationships', () => {
    const components = [
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' }
    ];
    const flow = {
      id: 'f', entryId: 'a', name: 'A',
      steps: [{ id: 'c1', fromId: 'a', toId: 'b', kind: 'publishes', label: 'event' }]
    };
    const code = buildSequenceMermaid(flow, {
      components,
      allTypes: { publishes: { label: 'publishes', arrow: '-.->' } }
    });
    expect(code).toContain('-->>');
  });
});

describe('buildAllSequenceDiagrams', () => {
  it('returns one entry per detected flow with mermaid + step count', () => {
    const components = [
      { id: 'u', name: 'User', type: 'user' },
      { id: 'c', name: 'Cron', type: 'cron' },
      { id: 's', name: 'Service' }
    ];
    const connections = [
      { id: 'c1', fromId: 'u', toId: 's', kind: 'calls' },
      { id: 'c2', fromId: 'c', toId: 's', kind: 'triggers' }
    ];
    const out = buildAllSequenceDiagrams({ components, connections, allTypes });
    expect(out).toHaveLength(2);
    out.forEach((d) => {
      expect(d.mermaid.startsWith('sequenceDiagram')).toBe(true);
      expect(d.stepCount).toBeGreaterThan(0);
    });
  });
});
