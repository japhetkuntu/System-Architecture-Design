import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'archivise:state:v1';
const BASELINE_KEY = 'archivise:baseline:v1';

function loadStoredState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadStoredBaseline() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BASELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- Default component types --------------------------------------------
export const DEFAULT_TYPES = {
  user:      { label: 'User / Actor',      group: 'Clients',   shape: 'stadium', icon: '👤', color: '#b45309' },
  frontend:  { label: 'Frontend / Client', group: 'Clients',   shape: 'round',   icon: '🖥️', color: '#1d4ed8' },
  api:       { label: 'API / Service',     group: 'Backend',   shape: 'rect',    icon: '⚙️', color: '#4338ca' },
  consumer:  { label: 'Consumer / Worker', group: 'Backend',   shape: 'rect',    icon: '🔄', color: '#6d28d9' },
  queue:     { label: 'Queue Topic',       group: 'Messaging', shape: 'queue',   icon: '📨', color: '#be185d' },
  database:  { label: 'Database',          group: 'Data',      shape: 'cyl',     icon: '🗄️', color: '#15803d' },
  search:    { label: 'Search Engine',     group: 'Data',      shape: 'cyl',     icon: '🔍', color: '#0f766e' },
  cache:     { label: 'Cache',             group: 'Data',      shape: 'cyl',     icon: '⚡', color: '#a16207' },
  storage:   { label: 'Object Storage',    group: 'Data',      shape: 'cyl',     icon: '📦', color: '#7c3aed' },
  external:  { label: 'External API',      group: 'External',  shape: 'rect',    icon: '🌐', color: '#475569' }
};

const GROUP_ORDER = ['Clients', 'Backend', 'Messaging', 'Data', 'External', 'Custom'];

export const RELATIONSHIPS = [
  { id: 'calls',       label: 'calls' },
  { id: 'publishes',   label: 'publishes to' },
  { id: 'consumes',    label: 'consumes from' },
  { id: 'reads',       label: 'reads from' },
  { id: 'writes',      label: 'writes to' },
  { id: 'integrates',  label: 'integrates with' },
  { id: 'uses',        label: 'uses' },
  { id: 'sends',       label: 'sends data to' },
  { id: 'returns',     label: 'returns data to' },
  { id: 'notifies',    label: 'notifies' }
];

let nextId = 1;
const newId = () => `c${nextId++}`;

function slugify(name, fallback) {
  const base = (name || fallback || 'node')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || fallback || 'node';
}

function escapeLabel(s) {
  return String(s || '').replace(/"/g, '\\"').replace(/\|/g, '/');
}

function shapeNode(id, label, shape) {
  const l = escapeLabel(label);
  switch (shape) {
    case 'cyl':     return `${id}[("${l}")]`;
    case 'queue':   return `${id}>"${l}"]`;
    case 'round':   return `${id}("${l}")`;
    case 'stadium': return `${id}(["${l}"])`;
    case 'rect':
    default:        return `${id}["${l}"]`;
  }
}

export function mergeEdges(connections) {
  const map = new Map();
  const order = [];
  connections.forEach((conn) => {
    const key = `${conn.fromId}=>${conn.toId}`;
    if (!map.has(key)) {
      map.set(key, { fromId: conn.fromId, toId: conn.toId, labels: [], connIds: [] });
      order.push(key);
    }
    const rel = RELATIONSHIPS.find((r) => r.id === conn.kind);
    const lbl = conn.label || rel?.label || '';
    if (lbl) map.get(key).labels.push(lbl);
    map.get(key).connIds.push(conn.id);
  });
  return order.map((k) => map.get(k));
}

function hexLight(hex) {
  if (!hex || !hex.startsWith('#')) return '#f5f5f4';
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = (v) => Math.round(v + (255 - v) * 0.82);
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

export function buildMermaid({ components, mergedEdges, allTypes }) {
  if (!components.length) {
    return 'flowchart LR\n  empty["Add components from the palette to see your diagram"]';
  }

  const lines = ['flowchart LR'];

  const used = new Set();
  const idMap = {};
  components.forEach((c) => {
    let base = slugify(c.name, c.id);
    let cand = base;
    let n = 1;
    while (used.has(cand)) cand = `${base}_${n++}`;
    used.add(cand);
    idMap[c.id] = cand;
  });

  const grouped = {};
  components.forEach((c) => {
    const g = allTypes[c.type]?.group || 'Other';
    (grouped[g] = grouped[g] || []).push(c);
  });

  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !GROUP_ORDER.includes(g))
  ];

  orderedGroups.forEach((g) => {
    lines.push(`  subgraph ${slugify(g)}["${g}"]`);
    grouped[g].forEach((c) => {
      const def = allTypes[c.type];
      const baseName = c.name || def?.label || 'Component';
      const icon = c.icon || def?.icon || '';
      const display = icon ? `${icon} ${baseName}` : baseName;
      const label = c.notes ? `${display}\\n(${c.notes})` : display;
      lines.push(`    ${shapeNode(idMap[c.id], label, def?.shape || 'rect')}`);
    });
    lines.push('  end');
  });

  mergedEdges.forEach((e) => {
    const from = idMap[e.fromId];
    const to = idMap[e.toId];
    if (!from || !to) return;
    const label = e.labels.length ? e.labels.join(' • ') : '';
    if (label) {
      lines.push(`  ${from} -->|"${escapeLabel(label)}"| ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  });

  components.forEach((c) => {
    const def = allTypes[c.type];
    const color = c.color || def?.color;
    if (color) {
      lines.push(`  style ${idMap[c.id]} fill:${hexLight(color)},stroke:${color},color:#1f2937,stroke-width:1.5px`);
    }
  });

  return lines.join('\n');
}

// ---- Diff helpers --------------------------------------------------------
const COMP_FIELDS = ['type', 'name', 'notes', 'icon', 'color'];
const CONN_FIELDS = ['fromId', 'toId', 'kind', 'label'];

function diffItems(baseList, currList, fields) {
  const baseMap = new Map(baseList.map((x) => [x.id, x]));
  const currMap = new Map(currList.map((x) => [x.id, x]));
  const added = [];
  const removed = [];
  const modified = [];
  const unchanged = [];
  currList.forEach((c) => {
    const b = baseMap.get(c.id);
    if (!b) { added.push(c); return; }
    const changes = {};
    fields.forEach((f) => {
      if ((b[f] || '') !== (c[f] || '')) changes[f] = { from: b[f], to: c[f] };
    });
    if (Object.keys(changes).length) modified.push({ before: b, after: c, changes });
    else unchanged.push(c);
  });
  baseList.forEach((b) => {
    if (!currMap.has(b.id)) removed.push(b);
  });
  return { added, removed, modified, unchanged };
}

function computeDiff(baseline, current) {
  if (!baseline) return null;
  return {
    title: baseline.title !== current.title ? { from: baseline.title, to: current.title } : null,
    components: diffItems(baseline.components || [], current.components || [], COMP_FIELDS),
    connections: diffItems(baseline.connections || [], current.connections || [], CONN_FIELDS)
  };
}

function buildDiffMermaid({ baseline, current, allTypes }) {
  if (!baseline) return '';

  // Union components by id (current wins for label)
  const compMap = new Map();
  baseline.components.forEach((c) => compMap.set(c.id, { ...c, _origin: 'baseline' }));
  current.components.forEach((c) => {
    const existing = compMap.get(c.id);
    compMap.set(c.id, { ...c, _origin: existing ? 'both' : 'current' });
  });
  const unionComponents = Array.from(compMap.values());
  if (!unionComponents.length) return 'flowchart LR\n  empty["No components yet"]';

  const baseCompMap = new Map(baseline.components.map((c) => [c.id, c]));
  const currCompMap = new Map(current.components.map((c) => [c.id, c]));

  const compStatus = (id) => {
    const inB = baseCompMap.has(id);
    const inC = currCompMap.has(id);
    if (inB && !inC) return 'removed';
    if (!inB && inC) return 'added';
    const b = baseCompMap.get(id);
    const c = currCompMap.get(id);
    const changed = COMP_FIELDS.some((f) => (b[f] || '') !== (c[f] || ''));
    return changed ? 'modified' : 'unchanged';
  };

  // id -> mermaid id
  const used = new Set();
  const idMap = {};
  unionComponents.forEach((c) => {
    let base = slugify(c.name, c.id);
    let cand = base;
    let n = 1;
    while (used.has(cand)) cand = `${base}_${n++}`;
    used.add(cand);
    idMap[c.id] = cand;
  });

  const lines = ['flowchart LR'];
  lines.push('  classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px');
  lines.push('  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-width:2px,stroke-dasharray:5 3');
  lines.push('  classDef modified fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:2px');
  lines.push('  classDef unchanged fill:#f1f5f9,stroke:#94a3b8,color:#334155');

  const grouped = {};
  unionComponents.forEach((c) => {
    const g = allTypes[c.type]?.group || 'Other';
    (grouped[g] = grouped[g] || []).push(c);
  });
  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !GROUP_ORDER.includes(g))
  ];
  orderedGroups.forEach((g) => {
    lines.push(`  subgraph ${slugify(g)}["${g}"]`);
    grouped[g].forEach((c) => {
      const def = allTypes[c.type];
      const baseName = c.name || def?.label || 'Component';
      const icon = c.icon || def?.icon || '';
      const status = compStatus(c.id);
      const tag = status === 'added' ? '+ ' : status === 'removed' ? '- ' : status === 'modified' ? '~ ' : '';
      const display = icon ? `${tag}${icon} ${baseName}` : `${tag}${baseName}`;
      const label = c.notes ? `${display}\\n(${c.notes})` : display;
      lines.push(`    ${shapeNode(idMap[c.id], label, def?.shape || 'rect')}`);
    });
    lines.push('  end');
  });

  // Edges: union by (fromId,toId,kind,label)
  const edgeKey = (e) => `${e.fromId}|${e.toId}|${e.kind}|${e.label || ''}`;
  const baseEdges = new Map(baseline.connections.map((e) => [edgeKey(e), e]));
  const currEdges = new Map(current.connections.map((e) => [edgeKey(e), e]));
  const allKeys = Array.from(new Set([...baseEdges.keys(), ...currEdges.keys()]));

  // Group edges by (from,to) and status for label merging
  const grouping = new Map();
  allKeys.forEach((k) => {
    const inB = baseEdges.has(k);
    const inC = currEdges.has(k);
    const e = inC ? currEdges.get(k) : baseEdges.get(k);
    const status = inB && inC ? 'unchanged' : inC ? 'added' : 'removed';
    const gkey = `${e.fromId}=>${e.toId}|${status}`;
    if (!grouping.has(gkey)) grouping.set(gkey, { fromId: e.fromId, toId: e.toId, labels: [], status });
    const rel = RELATIONSHIPS.find((r) => r.id === e.kind);
    const lbl = e.label || rel?.label || '';
    if (lbl) grouping.get(gkey).labels.push(lbl);
  });

  const edgeStyles = [];
  let edgeIdx = 0;
  Array.from(grouping.values()).forEach((g) => {
    const from = idMap[g.fromId];
    const to = idMap[g.toId];
    if (!from || !to) return;
    const tag = g.status === 'added' ? '+ ' : g.status === 'removed' ? '- ' : '';
    const label = g.labels.length ? `${tag}${g.labels.join(' • ')}` : tag.trim();
    if (label) {
      lines.push(`  ${from} -->|"${escapeLabel(label)}"| ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
    if (g.status === 'added') edgeStyles.push(`  linkStyle ${edgeIdx} stroke:#16a34a,stroke-width:2.5px`);
    else if (g.status === 'removed') edgeStyles.push(`  linkStyle ${edgeIdx} stroke:#dc2626,stroke-width:2.5px,stroke-dasharray:5 3`);
    edgeIdx++;
  });

  unionComponents.forEach((c) => {
    lines.push(`  class ${idMap[c.id]} ${compStatus(c.id)}`);
  });
  lines.push(...edgeStyles);

  return lines.join('\n');
}

export function useBuilder() {
  const stored = loadStoredState();
  if (stored && typeof stored.nextId === 'number' && stored.nextId > nextId) {
    nextId = stored.nextId;
  }

  const [components, setComponents] = useState(() => stored?.components ?? []);
  const [connections, setConnections] = useState(() => stored?.connections ?? []);
  const [customTypes, setCustomTypes] = useState(() => stored?.customTypes ?? {});
  const [title, setTitle] = useState(() => stored?.title ?? 'My Architecture');
  const [baseline, setBaseline] = useState(() => loadStoredBaseline());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ title, components, connections, customTypes, nextId })
      );
    } catch {
      // ignore quota errors
    }
  }, [title, components, connections, customTypes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (baseline) {
        window.localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
      } else {
        window.localStorage.removeItem(BASELINE_KEY);
      }
    } catch { /* noop */ }
  }, [baseline]);

  const allTypes = useMemo(() => ({ ...DEFAULT_TYPES, ...customTypes }), [customTypes]);

  const addComponent = useCallback((type) => {
    const def = ({ ...DEFAULT_TYPES, ...customTypes })[type];
    if (!def) return;
    setComponents((prev) => [
      ...prev,
      {
        id: newId(),
        type,
        name: `${def.label} ${prev.filter((p) => p.type === type).length + 1}`,
        notes: '',
        icon: '',
        color: ''
      }
    ]);
  }, [customTypes]);

  const updateComponent = useCallback((id, patch) => {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeComponent = useCallback((id) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
  }, []);

  const addConnection = useCallback((conn) => {
    if (!conn.fromId || !conn.toId || conn.fromId === conn.toId) return;
    setConnections((prev) => [...prev, { id: newId(), kind: 'calls', label: '', ...conn }]);
  }, []);

  const updateConnection = useCallback((id, patch) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeConnection = useCallback((id) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const duplicateConnection = useCallback((id) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      const copy = { ...src, id: newId() };
      const next = prev.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, []);

  const swapConnection = useCallback((id) => {
    setConnections((prev) => prev.map((c) =>
      c.id === id ? { ...c, fromId: c.toId, toId: c.fromId } : c
    ));
  }, []);

  const moveConnection = useCallback((id, delta) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const addCustomType = useCallback((def) => {
    const key = `custom_${slugify(def.label, 'type')}_${Date.now().toString(36)}`;
    const full = {
      label: def.label || 'Custom',
      group: def.group || 'Custom',
      shape: def.shape || 'rect',
      icon: def.icon || '🧩',
      color: def.color || '#475569'
    };
    setCustomTypes((prev) => ({ ...prev, [key]: full }));
    return key;
  }, []);

  const removeCustomType = useCallback((key) => {
    setCustomTypes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setComponents([]);
    setConnections([]);
    setCustomTypes({});
    setTitle('My Architecture');
    setBaseline(null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(BASELINE_KEY);
      } catch { /* noop */ }
    }
  }, []);

  // ---- Import / Export ---------------------------------------------------
  const exportJson = useCallback(() => {
    return JSON.stringify({
      version: 1,
      title,
      components,
      connections,
      customTypes,
      nextId,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }, [title, components, connections, customTypes]);

  const importJson = useCallback((jsonText, { asBaseline = false } = {}) => {
    let data;
    try {
      data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    } catch (e) {
      throw new Error('Invalid JSON file');
    }
    if (!data || !Array.isArray(data.components) || !Array.isArray(data.connections)) {
      throw new Error('Not a valid Archivise architecture file');
    }
    const incoming = {
      title: data.title || 'Imported Architecture',
      components: data.components,
      connections: data.connections,
      customTypes: data.customTypes || {}
    };
    setTitle(incoming.title);
    setComponents(incoming.components);
    setConnections(incoming.connections);
    setCustomTypes(incoming.customTypes);
    if (typeof data.nextId === 'number' && data.nextId > nextId) nextId = data.nextId;
    if (asBaseline) {
      setBaseline({
        title: incoming.title,
        components: incoming.components,
        connections: incoming.connections,
        customTypes: incoming.customTypes,
        capturedAt: new Date().toISOString()
      });
    }
    return incoming;
  }, []);

  // ---- Baseline / Diff ---------------------------------------------------
  const captureBaseline = useCallback(() => {
    setBaseline({
      title,
      components: JSON.parse(JSON.stringify(components)),
      connections: JSON.parse(JSON.stringify(connections)),
      customTypes: JSON.parse(JSON.stringify(customTypes)),
      capturedAt: new Date().toISOString()
    });
  }, [title, components, connections, customTypes]);

  const clearBaseline = useCallback(() => setBaseline(null), []);

  const restoreBaseline = useCallback(() => {
    if (!baseline) return;
    setTitle(baseline.title);
    setComponents(JSON.parse(JSON.stringify(baseline.components)));
    setConnections(JSON.parse(JSON.stringify(baseline.connections)));
    setCustomTypes(JSON.parse(JSON.stringify(baseline.customTypes || {})));
  }, [baseline]);

  const loadSample = useCallback(() => {
    nextId = 1;
    const c = [
      { id: newId(), type: 'user',     name: 'Customer',                notes: '', icon: '', color: '' },
      { id: newId(), type: 'frontend', name: 'Mobile App',              notes: '', icon: '', color: '' },
      { id: newId(), type: 'api',      name: 'Identity API',            notes: 'Auth + user mgmt', icon: '', color: '' },
      { id: newId(), type: 'queue',    name: 'customer_creation_request_received', notes: 'Kafka topic', icon: '', color: '' },
      { id: newId(), type: 'consumer', name: 'User Onboarding Consumer', notes: '', icon: '', color: '' },
      { id: newId(), type: 'database', name: 'PostgreSQL',              notes: 'users db', icon: '', color: '' },
      { id: newId(), type: 'search',   name: 'Elasticsearch',           notes: '', icon: '', color: '' },
      { id: newId(), type: 'external', name: 'Fineract',                notes: 'Core banking', icon: '', color: '' }
    ];
    setComponents(c);
    setConnections([
      { id: newId(), fromId: c[0].id, toId: c[1].id, kind: 'uses',       label: '' },
      { id: newId(), fromId: c[1].id, toId: c[2].id, kind: 'calls',      label: 'register' },
      { id: newId(), fromId: c[1].id, toId: c[2].id, kind: 'calls',      label: 'login' },
      { id: newId(), fromId: c[2].id, toId: c[3].id, kind: 'publishes',  label: '' },
      { id: newId(), fromId: c[4].id, toId: c[3].id, kind: 'consumes',   label: '' },
      { id: newId(), fromId: c[4].id, toId: c[5].id, kind: 'writes',     label: '' },
      { id: newId(), fromId: c[4].id, toId: c[6].id, kind: 'writes',     label: 'index user' },
      { id: newId(), fromId: c[4].id, toId: c[7].id, kind: 'integrates', label: 'create account' },
      { id: newId(), fromId: c[7].id, toId: c[4].id, kind: 'returns',    label: 'account id' }
    ]);
    setTitle('Customer Onboarding');
  }, []);

  const mergedEdges = useMemo(() => mergeEdges(connections), [connections]);

  const mermaid = useMemo(
    () => buildMermaid({ components, mergedEdges, allTypes }),
    [components, mergedEdges, allTypes]
  );

  const simulationSteps = useMemo(() => {
    return mergedEdges.map((e, idx) => {
      const from = components.find((c) => c.id === e.fromId);
      const to = components.find((c) => c.id === e.toId);
      return {
        index: idx,
        fromId: e.fromId,
        toId: e.toId,
        fromName: from?.name || '?',
        toName: to?.name || '?',
        labels: e.labels,
        narrative: from && to
          ? `${from.name} ${e.labels.join(' & ') || 'connects to'} ${to.name}`
          : ''
      };
    });
  }, [mergedEdges, components]);

  const diff = useMemo(
    () => computeDiff(baseline, { title, components, connections }),
    [baseline, title, components, connections]
  );

  const diffMermaid = useMemo(
    () => buildDiffMermaid({
      baseline,
      current: { title, components, connections },
      allTypes
    }),
    [baseline, title, components, connections, allTypes]
  );

  const baselineMermaid = useMemo(() => {
    if (!baseline) return '';
    const merged = mergeEdges(baseline.connections || []);
    const baselineAllTypes = { ...DEFAULT_TYPES, ...(baseline.customTypes || {}) };
    return buildMermaid({
      components: baseline.components || [],
      mergedEdges: merged,
      allTypes: baselineAllTypes
    });
  }, [baseline]);

  return {
    title, setTitle,
    components, addComponent, updateComponent, removeComponent,
    connections, addConnection, updateConnection, removeConnection,
    duplicateConnection, swapConnection, moveConnection,
    customTypes, allTypes, addCustomType, removeCustomType,
    mermaid, mergedEdges, simulationSteps,
    reset, loadSample,
    exportJson, importJson,
    baseline, captureBaseline, clearBaseline, restoreBaseline,
    diff, diffMermaid, baselineMermaid
  };
}
