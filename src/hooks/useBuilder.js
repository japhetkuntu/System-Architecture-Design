import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabaseClient.js';

const STATE_KEY     = 'archivise:state:v1';
const BASELINE_KEY  = 'archivise:baseline:v1';
const DOCS_KEY      = 'archivise:docs:v1';
const ACTIVE_DOC_KEY = 'archivise:active-doc:v1';
const SETTINGS_KEY  = 'archivise:settings:v1';
const CLOUD_KEY     = 'archivise:cloud-id:v1';
const PROJECT_KEY   = 'archivise:project-id:v1';
const CLOUD_TABLE   = 'architectures';
const PROJECT_TABLE = 'projects';

const MAX_HISTORY = 60;

// ---- Storage helpers ----------------------------------------------------
function loadJson(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota */ }
}

async function loadRemoteArchitecture(id) {
  if (!id) throw new Error('Missing cloud architecture ID');
  if (!supabase) throw new Error('Supabase is not configured');
  console.log('[Supabase] loadRemoteArchitecture', { id });
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('id, title, payload, project_id')
    .eq('id', id)
    .single();
  if (error) {
    console.error('[Supabase] loadRemoteArchitecture error', error);
    throw error;
  }
  console.log('[Supabase] loadRemoteArchitecture success', { id: data?.id, title: data?.title });
  return data;
}

async function saveRemoteArchitecture(id, payload, projectId) {
  if (!payload) throw new Error('Missing payload');
  if (!supabase) throw new Error('Supabase is not configured');
  console.log('[Supabase] saveRemoteArchitecture start', { id, projectId, payload: { title: payload.title, components: payload.components?.length, connections: payload.connections?.length } });
  const row = { title: payload.title, payload, project_id: projectId || null };
  if (id) {
    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .upsert({ id, ...row }, { onConflict: 'id' })
      .select()
      .single();
    if (error) {
      console.error('[Supabase] upsert error', error);
      throw error;
    }
    console.log('[Supabase] upsert success', { id: data.id });
    return data.id;
  }
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error('[Supabase] insert error', error);
    throw error;
  }
  console.log('[Supabase] insert success', { id: data.id });
  return data.id;
}

async function listRemoteArchitectures({ limit = 100, projectId } = {}) {
  if (!supabase) throw new Error('Supabase is not configured');
  console.log('[Supabase] listRemoteArchitectures', { projectId });
  let query = supabase
    .from(CLOUD_TABLE)
    .select('id, title, payload, project_id, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (projectId === null) query = query.is('project_id', null);
  else if (projectId) query = query.eq('project_id', projectId);
  const { data, error } = await query;
  if (error) {
    console.error('[Supabase] list error', error);
    throw error;
  }
  return (data || []).map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.project_id || null,
    updatedAt: r.updated_at || r.created_at,
    componentCount: r.payload?.components?.length || 0,
    connectionCount: r.payload?.connections?.length || 0
  }));
}

async function deleteRemoteArchitecture(id) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from(CLOUD_TABLE).delete().eq('id', id);
  if (error) throw error;
}

async function listRemoteProjects() {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from(PROJECT_TABLE)
    .select('id, name, description, created_at, updated_at')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[Supabase] listProjects error', error);
    throw error;
  }
  return data || [];
}

async function createRemoteProject({ name, description }) {
  if (!supabase) throw new Error('Supabase is not configured');
  if (!name || !name.trim()) throw new Error('Project name is required');
  const { data, error } = await supabase
    .from(PROJECT_TABLE)
    .insert({ name: name.trim(), description: description || null })
    .select()
    .single();
  if (error) {
    console.error('[Supabase] createProject error', error);
    throw error;
  }
  return data;
}

async function renameRemoteProject(id, name) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from(PROJECT_TABLE)
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) throw error;
}

async function deleteRemoteProject(id) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from(PROJECT_TABLE).delete().eq('id', id);
  if (error) throw error;
}

async function moveRemoteArchitectureToProject(id, projectId) {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from(CLOUD_TABLE)
    .update({ project_id: projectId || null })
    .eq('id', id);
  if (error) throw error;
}

// ---- Default component types --------------------------------------------
// Organised the way a senior architect actually whiteboards: clients on the
// left, edge/security at the front door, compute in the middle, data at the
// back, messaging on the side, temporal/orchestration as its own plane,
// observability and external systems on the periphery.
export const DEFAULT_TYPES = {
  // Clients
  user:         { label: 'User / Actor',          group: 'Clients',       shape: 'stadium', icon: '👤', color: '#b45309' },
  frontend:     { label: 'Frontend / SPA',        group: 'Clients',       shape: 'round',   icon: '🖥️', color: '#1d4ed8' },
  mobile:       { label: 'Mobile App',            group: 'Clients',       shape: 'round',   icon: '📱', color: '#2563eb' },

  // Edge & security (the AWS "front door")
  edge:         { label: 'CDN / Edge',            group: 'Edge',          shape: 'hex',     icon: '🌍', color: '#0369a1' },
  loadbalancer: { label: 'Load Balancer',         group: 'Edge',          shape: 'hex',     icon: '⚖️', color: '#0284c7' },
  apigateway:   { label: 'API Gateway',           group: 'Edge',          shape: 'hex',     icon: '🚪', color: '#0891b2' },
  idp:          { label: 'Identity Provider',     group: 'Security',      shape: 'rect',    icon: '🛡️', color: '#9333ea' },
  secrets:      { label: 'Secrets / KMS',         group: 'Security',      shape: 'rect',    icon: '🔐', color: '#7e22ce' },

  // Compute / backend
  api:          { label: 'API / Service',         group: 'Backend',       shape: 'rect',    icon: '⚙️', color: '#4338ca' },
  function:     { label: 'Function / Lambda',     group: 'Backend',       shape: 'round',   icon: 'λ',  color: '#5b21b6' },
  container:    { label: 'Container / Task',      group: 'Backend',       shape: 'rect',    icon: '🐳', color: '#4f46e5' },
  consumer:     { label: 'Consumer / Worker',     group: 'Backend',       shape: 'rect',    icon: '🔄', color: '#6d28d9' },

  // Messaging
  queue:        { label: 'Queue (SQS-style)',     group: 'Messaging',     shape: 'queue',   icon: '📨', color: '#be185d' },
  topic:        { label: 'Pub/Sub Topic (SNS)',   group: 'Messaging',     shape: 'queue',   icon: '📣', color: '#db2777' },

  // Temporal / orchestration plane (the new group)
  scheduler:    { label: 'Scheduler / Cron',      group: 'Temporal',      shape: 'stadium', icon: '⏰', color: '#0d9488' },
  eventbus:     { label: 'Event Bus (EventBridge)', group: 'Temporal',    shape: 'hex',     icon: '🚌', color: '#0f766e' },
  workflow:     { label: 'Workflow (Step Fn / Temporal)', group: 'Temporal', shape: 'rect', icon: '🧭', color: '#047857' },
  statemachine: { label: 'State Machine',         group: 'Temporal',      shape: 'rect',    icon: '🔁', color: '#059669' },
  activity:     { label: 'Activity / Task',       group: 'Temporal',      shape: 'rect',    icon: '🛠️', color: '#10b981' },
  saga:         { label: 'Saga / Orchestrator',   group: 'Temporal',      shape: 'rect',    icon: '🪢', color: '#15803d' },
  timer:        { label: 'Timer / Delay',         group: 'Temporal',      shape: 'stadium', icon: '⏲️', color: '#65a30d' },
  signal:       { label: 'Signal / Webhook',      group: 'Temporal',      shape: 'stadium', icon: '📡', color: '#84cc16' },

  // Data
  database:     { label: 'Database',              group: 'Data',          shape: 'cyl',     icon: '🗄️', color: '#15803d' },
  search:       { label: 'Search Index',          group: 'Data',          shape: 'cyl',     icon: '🔍', color: '#0f766e' },
  cache:        { label: 'Cache',                 group: 'Data',          shape: 'cyl',     icon: '⚡', color: '#a16207' },
  storage:      { label: 'Object Storage (S3)',   group: 'Data',          shape: 'cyl',     icon: '📦', color: '#7c3aed' },
  warehouse:    { label: 'Warehouse / Lake',      group: 'Data',          shape: 'cyl',     icon: '📈', color: '#9333ea' },
  stream:       { label: 'Stream (Kinesis/Kafka)', group: 'Data',         shape: 'queue',   icon: '🌊', color: '#0e7490' },

  // Observability
  telemetry:    { label: 'Telemetry / Metrics',   group: 'Observability', shape: 'rect',    icon: '📊', color: '#475569' },

  // External systems
  external:     { label: 'External API',          group: 'External',      shape: 'rect',    icon: '🌐', color: '#475569' }
};

const GROUP_ORDER = ['Clients', 'Edge', 'Security', 'Backend', 'Messaging', 'Temporal', 'Data', 'Observability', 'External', 'Custom'];

// Relationship vocabulary, organised the way a senior AWS-style architect
// reads a diagram: synchronous request/response, asynchronous events, the
// data plane, the temporal/orchestration plane, security, and reliability.
// `arrow` is a Mermaid edge style: '-->' solid, '-.->' dotted (async/control),
// '==>' thick (data plane / streams), '--o' open circle (observation/replication),
// '--x' cross (failover).
export const RELATIONSHIPS = [
  // ── Synchronous (request / response) ─────────────────────────────────────
  { id: 'calls',       label: 'calls',              category: 'Synchronous', arrow: '-->',  description: 'Generic blocking call (HTTP/gRPC/RPC)' },
  { id: 'queries',     label: 'queries',            category: 'Synchronous', arrow: '-->',  description: 'Read-only request (GET / GraphQL query)' },
  { id: 'commands',    label: 'commands',           category: 'Synchronous', arrow: '-->',  description: 'State-changing call (POST / mutation)' },
  { id: 'invokes',     label: 'invokes',            category: 'Synchronous', arrow: '-->',  description: 'Synchronous function/Lambda invocation' },

  // ── Asynchronous (events / messaging) ────────────────────────────────────
  { id: 'publishes',   label: 'publishes to',       category: 'Asynchronous', arrow: '-.->', description: 'Publishes event to a topic (SNS/Kafka)' },
  { id: 'subscribes',  label: 'subscribes to',      category: 'Asynchronous', arrow: '-.->', description: 'Subscribes to a topic / event source' },
  { id: 'consumes',    label: 'consumes from',      category: 'Asynchronous', arrow: '-.->', description: 'Pulls messages from a queue (SQS-style)' },
  { id: 'emits',       label: 'emits',              category: 'Asynchronous', arrow: '-.->', description: 'Emits a domain event' },
  { id: 'notifies',    label: 'notifies',           category: 'Asynchronous', arrow: '-.->', description: 'Push notification (SNS / webhook)' },
  { id: 'fans-out',    label: 'fans out to',        category: 'Asynchronous', arrow: '-.->', description: 'One source, many parallel targets' },

  // ── Data plane (storage & streaming) ─────────────────────────────────────
  { id: 'reads',       label: 'reads from',         category: 'Data',         arrow: '-->',  description: 'Reads from a datastore' },
  { id: 'writes',      label: 'writes to',          category: 'Data',         arrow: '-->',  description: 'Writes to a datastore' },
  { id: 'caches',      label: 'caches',             category: 'Data',         arrow: '-->',  description: 'Caches results from a slower source' },
  { id: 'indexes',     label: 'indexes into',       category: 'Data',         arrow: '-->',  description: 'Feeds a search index / projection' },
  { id: 'streams',     label: 'streams to',         category: 'Data',         arrow: '==>',  description: 'Continuous data plane (Kinesis/Kafka)' },
  { id: 'replicates',  label: 'replicates to',      category: 'Data',         arrow: '--o',  description: 'Replication target (read replica / DR)' },

  // ── Temporal / orchestration ─────────────────────────────────────────────
  { id: 'triggers',    label: 'triggers',           category: 'Temporal',     arrow: '-.->', description: 'Event triggers a workflow / function' },
  { id: 'schedules',   label: 'schedules',          category: 'Temporal',     arrow: '-.->', description: 'Cron-style scheduled execution' },
  { id: 'orchestrates',label: 'orchestrates',       category: 'Temporal',     arrow: '-.->', description: 'Workflow controls downstream steps' },
  { id: 'awaits',      label: 'awaits',             category: 'Temporal',     arrow: '-.->', description: 'Awaits signal / timer / completion' },
  { id: 'compensates', label: 'compensates',        category: 'Temporal',     arrow: '-.->', description: 'Saga rollback / compensation' },
  { id: 'times-out-to',label: 'times out to',       category: 'Temporal',     arrow: '-.->', description: 'Fallback path on timeout' },

  // ── Security & trust ─────────────────────────────────────────────────────
  { id: 'authenticates-via', label: 'authenticates via', category: 'Security', arrow: '-->', description: 'Auth handled by IDP (OIDC/SAML)' },
  { id: 'authorizes-via',    label: 'authorizes via',    category: 'Security', arrow: '-->', description: 'Policy / permissions check' },

  // ── Reliability ──────────────────────────────────────────────────────────
  { id: 'load-balances-to', label: 'load-balances to', category: 'Reliability', arrow: '-->', description: 'LB distributes traffic across targets' },
  { id: 'fails-over-to',    label: 'fails over to',    category: 'Reliability', arrow: '--x', description: 'Disaster-recovery / failover target' },
  { id: 'observes',         label: 'observes',         category: 'Reliability', arrow: '--o', description: 'Telemetry, traces, metrics, logs' },

  // ── Generic (back-compat) ────────────────────────────────────────────────
  { id: 'integrates',  label: 'integrates with',    category: 'Other',        arrow: '-->',  description: 'Generic integration point' },
  { id: 'uses',        label: 'uses',               category: 'Other',        arrow: '-->',  description: 'Generic dependency' },
  { id: 'sends',       label: 'sends data to',      category: 'Other',        arrow: '-->',  description: 'Generic data send' },
  { id: 'returns',     label: 'returns data to',    category: 'Other',        arrow: '-->',  description: 'Response / callback' }
];

export const RELATIONSHIP_CATEGORIES = [
  'Synchronous', 'Asynchronous', 'Data', 'Temporal', 'Security', 'Reliability', 'Other'
];

export function getRelationship(id) {
  return RELATIONSHIPS.find((r) => r.id === id) || RELATIONSHIPS[0];
}

// ---- ID generation ------------------------------------------------------
let nextId = 1;
const newId = () => `c${nextId++}`;

// ---- Slug / label helpers ----------------------------------------------
function slugify(name, fallback) {
  const base = (name || fallback || 'node')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || fallback || 'node';
}

function escapeLabel(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\|/g, '/')
    .replace(/\n/g, '\\n');
}

function wrapText(text, maxLen = 24) {
  const words = String(text || '').split(/(\s+)/);
  let line = '';
  const lines = [];

  for (const token of words) {
    if (!token) continue;
    if (token.trim() === '') {
      line += token;
      continue;
    }
    if ((line + token).length <= maxLen || !line.trim()) {
      line += token;
      continue;
    }
    lines.push(line.trimEnd());
    if (token.length > maxLen) {
      let start = 0;
      while (start < token.length) {
        lines.push(token.slice(start, start + maxLen));
        start += maxLen;
      }
      line = '';
    } else {
      line = token;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.join('\n');
}

function wrapLabel(value) {
  return String(value || '')
    .split('\n')
    .map((part) => wrapText(part, 26))
    .join('\n');
}

function shapeNode(id, label, shape) {
  const l = escapeLabel(wrapLabel(label));
  switch (shape) {
    case 'cyl':     return `${id}[("${l}")]`;
    case 'queue':   return `${id}>"${l}"]`;
    case 'round':   return `${id}("${l}")`;
    case 'stadium': return `${id}(["${l}"])`;
    case 'hex':     return `${id}{{"${l}"}}`;
    case 'rect':
    default:        return `${id}["${l}"]`;
  }
}

// Priority for picking a representative arrow when several connections are
// merged onto one edge: data plane > async/control > observation > failover > sync.
const ARROW_PRIORITY = { '==>': 5, '-.->': 4, '--o': 3, '--x': 2, '-->': 1 };
function pickArrow(arrows) {
  if (!arrows || !arrows.length) return '-->';
  return arrows.reduce((best, a) => (ARROW_PRIORITY[a] || 0) > (ARROW_PRIORITY[best] || 0) ? a : best, arrows[0]);
}

// Build a labelled mermaid edge for any of the supported arrow styles.
function edgeLine(from, to, arrow, label) {
  const safe = label ? `"${escapeLabel(wrapLabel(label))}"` : '';
  if (!label) return `  ${from} ${arrow} ${to}`;
  switch (arrow) {
    case '-.->': return `  ${from} -. ${safe} .-> ${to}`;
    case '==>':  return `  ${from} == ${safe} ==> ${to}`;
    case '--o':  return `  ${from} -- ${safe} --o ${to}`;
    case '--x':  return `  ${from} -- ${safe} --x ${to}`;
    case '-->':
    default:     return `  ${from} -->|${safe}| ${to}`;
  }
}

// ---- Edge merging (pure) -----------------------------------------------
export function mergeEdges(connections) {
  const map = new Map();
  const order = [];
  connections.forEach((conn) => {
    const key = `${conn.fromId}=>${conn.toId}`;
    if (!map.has(key)) {
      map.set(key, {
        fromId: conn.fromId,
        toId: conn.toId,
        labels: [],
        notes: [],
        connIds: [],
        arrows: [],
        categories: []
      });
      order.push(key);
    }
    const rel = getRelationship(conn.kind);
    const lbl = conn.label || rel?.label || '';
    if (lbl) map.get(key).labels.push(lbl);
    if (conn.note) map.get(key).notes.push(conn.note);
    if (rel?.arrow) map.get(key).arrows.push(rel.arrow);
    if (rel?.category) map.get(key).categories.push(rel.category);
    map.get(key).connIds.push(conn.id);
  });
  return order.map((k) => {
    const e = map.get(k);
    e.arrow = pickArrow(e.arrows);
    return e;
  });
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

// ---- Mermaid builder (pure) --------------------------------------------
export function buildMermaid({ components, mergedEdges, allTypes, layoutDir = 'LR', useSubgraphs = true }) {
  // Init directive — keeps the diagram airy in any renderer (live view, ADR
  // preview, exported markdown), not just our own DiagramView.
  const initDirective = `%%{init: {"flowchart": {"curve": "basis", "nodeSpacing": 70, "rankSpacing": 90, "padding": 24, "diagramPadding": 32, "htmlLabels": false, "useMaxWidth": false}} }%%`;

  if (!components.length) {
    return `${initDirective}\nflowchart ${layoutDir}\n  empty["Add components from the palette to see your diagram"]`;
  }

  const lines = [initDirective, `flowchart ${layoutDir}`];

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

  const renderNode = (c, indent) => {
    const def = allTypes[c.type];
    const baseName = c.name || def?.label || 'Component';
    const icon = c.icon || def?.icon || '';
    const display = icon ? `${icon} ${baseName}` : baseName;
    const label = c.notes ? `${display}\\n(${c.notes})` : display;
    lines.push(`${indent}${shapeNode(idMap[c.id], label, def?.shape || 'rect')}`);
  };

  if (useSubgraphs) {
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
      grouped[g].forEach((c) => renderNode(c, '    '));
      lines.push('  end');
    });
  } else {
    components.forEach((c) => renderNode(c, '  '));
  }

  mergedEdges.forEach((e) => {
    const from = idMap[e.fromId];
    const to = idMap[e.toId];
    if (!from || !to) return;
    // Each parallel label / note renders on its own line so multiple
    // connections between the same two nodes stay readable.
    const parts = [];
    if (e.labels.length) parts.push(e.labels.join('\n'));
    if (e.notes && e.notes.length) parts.push(e.notes.map((n) => `📝 ${n}`).join('\n'));
    const label = parts.join('\n');
    lines.push(edgeLine(from, to, e.arrow || '-->', label));
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

// ---- Diff helpers -------------------------------------------------------
const COMP_FIELDS = ['type', 'name', 'notes', 'icon', 'color'];
const CONN_FIELDS = ['fromId', 'toId', 'kind', 'label', 'note'];

function diffItems(baseList, currList, fields) {
  const baseMap = new Map(baseList.map((x) => [x.id, x]));
  const currMap = new Map(currList.map((x) => [x.id, x]));
  const added = [], removed = [], modified = [], unchanged = [];
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

export function computeDiff(baseline, current) {
  if (!baseline) return null;
  return {
    title: baseline.title !== current.title ? { from: baseline.title, to: current.title } : null,
    components: diffItems(baseline.components || [], current.components || [], COMP_FIELDS),
    connections: diffItems(baseline.connections || [], current.connections || [], CONN_FIELDS)
  };
}

export function buildDiffMermaid({ baseline, current, allTypes, layoutDir = 'LR', useSubgraphs = true }) {
  if (!baseline) return '';
  const compMap = new Map();
  baseline.components.forEach((c) => compMap.set(c.id, { ...c, _origin: 'baseline' }));
  current.components.forEach((c) => {
    const existing = compMap.get(c.id);
    compMap.set(c.id, { ...c, _origin: existing ? 'both' : 'current' });
  });
  const unionComponents = Array.from(compMap.values());
  if (!unionComponents.length) return `flowchart ${layoutDir}\n  empty["No components yet"]`;

  const baseCompMap = new Map(baseline.components.map((c) => [c.id, c]));
  const currCompMap = new Map(current.components.map((c) => [c.id, c]));

  const compStatus = (id) => {
    const inB = baseCompMap.has(id);
    const inC = currCompMap.has(id);
    if (inB && !inC) return 'removed';
    if (!inB && inC) return 'added';
    const b = baseCompMap.get(id);
    const c = currCompMap.get(id);
    return COMP_FIELDS.some((f) => (b[f] || '') !== (c[f] || '')) ? 'modified' : 'unchanged';
  };

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

  const lines = [`flowchart ${layoutDir}`];
  lines.push('  classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px');
  lines.push('  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-width:2px,stroke-dasharray:5 3');
  lines.push('  classDef modified fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:2px');
  lines.push('  classDef unchanged fill:#f1f5f9,stroke:#94a3b8,color:#334155');

  const renderNode = (c, indent) => {
    const def = allTypes[c.type];
    const baseName = c.name || def?.label || 'Component';
    const icon = c.icon || def?.icon || '';
    const status = compStatus(c.id);
    const tag = status === 'added' ? '+ ' : status === 'removed' ? '- ' : status === 'modified' ? '~ ' : '';
    const display = icon ? `${tag}${icon} ${baseName}` : `${tag}${baseName}`;
    const label = c.notes ? `${display}\\n(${c.notes})` : display;
    lines.push(`${indent}${shapeNode(idMap[c.id], label, def?.shape || 'rect')}`);
  };

  if (useSubgraphs) {
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
      grouped[g].forEach((c) => renderNode(c, '    '));
      lines.push('  end');
    });
  } else {
    unionComponents.forEach((c) => renderNode(c, '  '));
  }

  const edgeKey = (e) => `${e.fromId}|${e.toId}|${e.kind}|${e.label || ''}|${e.note || ''}`;
  const baseEdges = new Map(baseline.connections.map((e) => [edgeKey(e), e]));
  const currEdges = new Map(current.connections.map((e) => [edgeKey(e), e]));
  const allKeys = Array.from(new Set([...baseEdges.keys(), ...currEdges.keys()]));

  const grouping = new Map();
  allKeys.forEach((k) => {
    const inB = baseEdges.has(k);
    const inC = currEdges.has(k);
    const e = inC ? currEdges.get(k) : baseEdges.get(k);
    const status = inB && inC ? 'unchanged' : inC ? 'added' : 'removed';
    const gkey = `${e.fromId}=>${e.toId}|${status}`;
    if (!grouping.has(gkey)) grouping.set(gkey, { fromId: e.fromId, toId: e.toId, labels: [], arrows: [], status });
    const rel = getRelationship(e.kind);
    const lbl = e.label || rel?.label || '';
    if (lbl) grouping.get(gkey).labels.push(lbl);
    if (rel?.arrow) grouping.get(gkey).arrows.push(rel.arrow);
  });

  const edgeStyles = [];
  let edgeIdx = 0;
  Array.from(grouping.values()).forEach((g) => {
    const from = idMap[g.fromId];
    const to = idMap[g.toId];
    if (!from || !to) return;
    const tag = g.status === 'added' ? '+ ' : g.status === 'removed' ? '- ' : '';
    const label = g.labels.length ? `${tag}${g.labels.join(' • ')}` : tag.trim();
    const arrow = pickArrow(g.arrows);
    lines.push(edgeLine(from, to, arrow, label));
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

// ---- Validation / lints (pure) ------------------------------------------
export function runLints({ components, connections }) {
  const lints = [];

  // Duplicate names
  const nameCounts = new Map();
  components.forEach((c) => {
    const n = (c.name || '').trim().toLowerCase();
    if (!n) return;
    nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
  });
  nameCounts.forEach((count, name) => {
    if (count > 1) {
      lints.push({
        severity: 'warn',
        code: 'duplicate-name',
        message: `${count} components share the name "${name}". Consider renaming for clarity.`
      });
    }
  });

  // Orphans (no incoming or outgoing edges)
  const connected = new Set();
  connections.forEach((e) => { connected.add(e.fromId); connected.add(e.toId); });
  components.forEach((c) => {
    if (!connected.has(c.id)) {
      lints.push({
        severity: 'info',
        code: 'orphan',
        componentId: c.id,
        message: `"${c.name || c.id}" is not connected to anything.`
      });
    }
  });

  // Empty names
  components.forEach((c) => {
    if (!(c.name || '').trim()) {
      lints.push({
        severity: 'warn',
        code: 'empty-name',
        componentId: c.id,
        message: `A ${c.type} component has no name.`
      });
    }
  });

  // Cycles (directed). Detect via DFS.
  const adj = new Map();
  components.forEach((c) => adj.set(c.id, []));
  connections.forEach((e) => {
    if (adj.has(e.fromId) && adj.has(e.toId)) adj.get(e.fromId).push(e.toId);
  });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(components.map((c) => [c.id, WHITE]));
  const cycles = [];
  const stack = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        const idx = stack.indexOf(v);
        cycles.push(stack.slice(idx).concat(v));
      } else if (color.get(v) === WHITE) dfs(v);
    }
    stack.pop();
    color.set(u, BLACK);
  };
  components.forEach((c) => { if (color.get(c.id) === WHITE) dfs(c.id); });
  cycles.slice(0, 3).forEach((cyc) => {
    const byId = new Map(components.map((c) => [c.id, c]));
    const names = cyc.map((id) => byId.get(id)?.name || id).join(' → ');
    lints.push({
      severity: 'info',
      code: 'cycle',
      message: `Cycle detected: ${names}. Cycles aren't always wrong, but verify this is intended.`
    });
  });

  // Invalid references (defensive)
  const compIds = new Set(components.map((c) => c.id));
  connections.forEach((e) => {
    if (!compIds.has(e.fromId) || !compIds.has(e.toId)) {
      lints.push({
        severity: 'error',
        code: 'dangling-connection',
        message: `Connection ${e.id} points to a missing component.`
      });
    }
  });

  return lints;
}

// ---- Workflow orchestration analysis (pure) ----------------------------
// Identify systems that cannot be durable on their own — they hang, double-
// charge, leak resources, or leave inconsistent state when a downstream fails
// or a bug throws mid-flow. The recommendation is to wrap them in a durable
// execution engine (Temporal / Step Functions / Cadence) so retries, timers,
// and compensations are first-class.
//
// Returns:
//   {
//     candidates:  [{ id, name, type, severity, riskScore, reasons[], recommendation }],
//     findings:    [{ severity, category, message, recommendation, componentId }],
//     score, grade, summary
//   }
const NON_TRIVIAL_GROUPS = new Set(['Backend', 'Data', 'External', 'Messaging', 'Temporal']);
const DURABLE_TYPES = new Set(['workflow', 'statemachine', 'saga']);
const SYNC_KINDS = new Set(['calls', 'queries', 'commands', 'invokes', 'sends', 'integrates', 'uses', 'reads', 'writes']);
const EXTERNAL_TYPES = new Set(['external']);

export function analyzeOrchestration({ components, connections, allTypes }) {
  const findings = [];
  const candidates = [];
  if (!components.length) {
    return {
      candidates, findings, score: null, grade: 'N/A',
      summary: 'Add components to scan for orchestration risks.'
    };
  }

  const types = allTypes || DEFAULT_TYPES;
  const byId = new Map(components.map((c) => [c.id, c]));
  const groupOf = (id) => types[byId.get(id)?.type]?.group || '';
  const typeOf  = (id) => byId.get(id)?.type || '';

  const add = (severity, category, message, recommendation, componentId = null) =>
    findings.push({ severity, category, message, recommendation, componentId });

  // Build adjacency views once.
  const outgoing = new Map(components.map((c) => [c.id, []]));
  const incoming = new Map(components.map((c) => [c.id, []]));
  connections.forEach((e) => {
    outgoing.get(e.fromId)?.push(e);
    incoming.get(e.toId)?.push(e);
  });

  // ---- Candidate detection: which components NEED a workflow? ----------
  components.forEach((c) => {
    if (DURABLE_TYPES.has(c.type)) return;            // already durable
    if (groupOf(c.id) === 'Clients') return;          // user/SPA — not our problem
    if (groupOf(c.id) === 'Edge') return;             // gateways/CDNs are stateless
    if (groupOf(c.id) === 'Data') return;             // datastores aren't orchestrators
    const out = outgoing.get(c.id) || [];

    // 1. Multi-step synchronous orchestration ("god service" pattern).
    const syncTargets = out.filter((e) => SYNC_KINDS.has(e.kind)
      && NON_TRIVIAL_GROUPS.has(groupOf(e.toId))
      && !DURABLE_TYPES.has(typeOf(e.toId)));
    const distinctSyncTargets = new Set(syncTargets.map((e) => e.toId));

    // 2. Synchronous calls to external systems.
    const externalSync = out.filter((e) => SYNC_KINDS.has(e.kind) && EXTERNAL_TYPES.has(typeOf(e.toId)));

    // 3. Mixed choreography: publishes events AND makes sync state-changing
    //    calls. Mid-flight failures leave the world inconsistent.
    const publishes = out.filter((e) => ['publishes', 'emits', 'notifies', 'fans-out'].includes(e.kind));
    const sideEffects = out.filter((e) => ['commands', 'writes', 'invokes'].includes(e.kind));
    const choreographySmell = publishes.length > 0 && sideEffects.length > 0;

    // 4. Long synchronous chain (this component is N hops deep in a sync chain).
    //    Cheap proxy: this component is itself called synchronously AND then makes
    //    further sync calls — every hop multiplies failure probability.
    const calledSync = (incoming.get(c.id) || []).some((e) => SYNC_KINDS.has(e.kind));
    const chainHop = calledSync && syncTargets.length >= 1;

    const reasons = [];
    let riskScore = 0;
    if (distinctSyncTargets.size >= 2) {
      riskScore += 40 + (distinctSyncTargets.size - 2) * 15;
      reasons.push(`Coordinates ${distinctSyncTargets.size} synchronous downstream services — a partial failure leaves the workflow half-done.`);
    }
    if (externalSync.length > 0) {
      riskScore += 30;
      reasons.push(`Calls ${externalSync.length} external system${externalSync.length === 1 ? '' : 's'} synchronously. A slow third party blocks the whole request thread.`);
    }
    if (choreographySmell) {
      riskScore += 25;
      reasons.push('Mixes side-effecting writes with event publishing in the same flow — there is no atomic "do-all-or-nothing".');
    }
    if (chainHop && distinctSyncTargets.size >= 2) {
      riskScore += 15;
      reasons.push('Sits in the middle of a long synchronous call chain. Retries cascade upward and timeouts compound.');
    }

    if (riskScore >= 30) {
      const severity = riskScore >= 70 ? 'error' : riskScore >= 45 ? 'warn' : 'info';
      candidates.push({
        id: c.id,
        name: c.name,
        type: c.type,
        severity,
        riskScore: Math.min(100, riskScore),
        reasons,
        recommendation: `Wrap "${c.name}" in a Temporal workflow. Each downstream call becomes a retried activity, timeouts are explicit, and compensations roll back on failure — so the system stays consistent even when a dependency dies or a bug throws mid-flow.`
      });
      add(severity, 'Orchestration',
        `"${c.name}" runs a non-durable multi-step flow.`,
        `Wrap it in a Temporal workflow so every step is retried, every timeout is explicit, and partial failures are compensated.`,
        c.id);
    }
  });

  // ---- Durability gap findings (only the orchestration-relevant ones) ---
  const queues = components.filter((c) => c.type === 'queue' || c.type === 'topic');
  queues.forEach((q) => {
    const consumers = connections.filter((e) => e.toId === q.id && e.kind === 'consumes');
    if (consumers.length === 0) {
      add('warn', 'Durability',
        `Queue "${q.name}" has no consumer. Messages will pile up indefinitely.`,
        'Attach a worker that consumes from this queue, ideally driven by a Temporal workflow so retries and DLQ routing are durable.',
        q.id);
    }
  });
  if (queues.length > 0) {
    const dlqLike = components.some((c) =>
      (c.type === 'queue' || c.type === 'topic') && /dlq|dead/i.test(c.name || '')
    );
    if (!dlqLike) {
      add('info', 'Durability',
        'No dead-letter queue (DLQ) is shown for your async messaging.',
        'Add a DLQ so poison messages do not vanish. Temporal handles this automatically per workflow.');
    }
  }

  const workflows = components.filter((c) => DURABLE_TYPES.has(c.type));
  workflows.forEach((w) => {
    const out = outgoing.get(w.id) || [];
    const hasTimeout = out.some((e) => e.kind === 'times-out-to');
    const hasCompensate = out.some((e) => e.kind === 'compensates');
    if (!hasTimeout) {
      add('info', 'Durability',
        `Workflow "${w.name}" has no explicit timeout / fallback path.`,
        'Add a "times out to" edge so long-running activities have a defined fallback (Temporal: StartToCloseTimeout).',
        w.id);
    }
    if (!hasCompensate && out.length >= 3) {
      add('info', 'Durability',
        `Workflow "${w.name}" performs multiple steps with no compensation path.`,
        'Add "compensates" edges so partial failures roll back (saga pattern — Temporal supports this natively with workflow.defer / SAGA helpers).',
        w.id);
    }
  });

  const externals = components.filter((c) => c.type === 'external');
  externals.forEach((ex) => {
    const callers = connections.filter((e) => e.toId === ex.id && SYNC_KINDS.has(e.kind));
    if (callers.length > 0) {
      const protectedByWorkflow = callers.some((e) => DURABLE_TYPES.has(typeOf(e.fromId)));
      if (!protectedByWorkflow) {
        add('warn', 'Durability',
          `External system "${ex.name}" is called synchronously without a durable wrapper.`,
          'Move the call into a Temporal activity with retries + circuit-breaker. The workflow stays alive even if the third party is down for hours.',
          ex.id);
      }
    }
  });

  // ---- Score (durability-only weighting) --------------------------------
  const weight = { error: 14, warn: 7, info: 2 };
  const penalty = findings.reduce((s, f) => s + (weight[f.severity] || 0), 0);
  const score = Math.max(0, 100 - penalty);
  const grade =
    score >= 90 ? 'A' :
    score >= 80 ? 'B' :
    score >= 65 ? 'C' :
    score >= 50 ? 'D' : 'F';

  let summary;
  if (candidates.length === 0 && findings.length === 0) {
    summary = 'No orchestration risks detected — every multi-step flow is already durable.';
  } else if (candidates.length === 0) {
    summary = `${findings.length} durability gap${findings.length === 1 ? '' : 's'} to address.`;
  } else {
    summary = `${candidates.length} component${candidates.length === 1 ? '' : 's'} should be wrapped in a Temporal workflow.`;
  }

  return { candidates, findings, score, grade, summary };
}

// Backwards-compat alias (kept exported so older imports keep working).
export const assessResilience = analyzeOrchestration;

// ---- Temporal redesign generator (pure) --------------------------------
// Given an architecture and a set of orchestration candidates, return a
// redesigned { components, connections } where each candidate's multi-step
// synchronous flow is mediated by a Temporal workflow node. The original
// "candidate → downstream" sync edges become "workflow → downstream"
// activity-execution edges, and the candidate now "starts" the workflow.
export function generateTemporalRedesign({ components, connections, candidates, allTypes }) {
  if (!candidates || !candidates.length) {
    return { components: components.slice(), connections: connections.slice() };
  }
  const types = allTypes || DEFAULT_TYPES;
  const groupOf = (typeKey) => types[typeKey]?.group || '';
  const typeOf  = (cid, comps) => comps.find((c) => c.id === cid)?.type || '';

  // Clone everything so we never mutate the caller's state.
  const newComponents = JSON.parse(JSON.stringify(components));
  let newConnections   = JSON.parse(JSON.stringify(connections));

  // Stable id generator for inserted nodes (avoid colliding with existing ones).
  let seq = Math.max(0, ...newComponents.map((c) => {
    const m = /^c(\d+)$/.exec(c.id || '');
    return m ? parseInt(m[1], 10) : 0;
  }));
  const mintId = () => `c${++seq}`;

  candidates.forEach((cand) => {
    const owner = newComponents.find((c) => c.id === cand.id);
    if (!owner) return;

    // Insert a Temporal workflow node for this candidate.
    const wfId = mintId();
    newComponents.push({
      id: wfId,
      type: 'workflow',
      name: `${owner.name} Workflow`,
      notes: 'Temporal — durable execution',
      icon: '🧭',
      color: '#047857'
    });

    // Add a DLQ + timer once per redesign (shared) if not present.
    // (Keep the redesign lean — only insert what each candidate needs.)
    // Rewire: for every sync edge from the owner to a non-trivial target,
    // (a) drop the original sync edge,
    // (b) add owner → workflow ("starts"),
    // (c) add workflow → target ("orchestrates" — durable activity execution).
    const ownerSyncEdges = newConnections.filter((e) =>
      e.fromId === owner.id
      && SYNC_KINDS.has(e.kind)
      && NON_TRIVIAL_GROUPS.has(groupOf(typeOf(e.toId, newComponents)))
      && !DURABLE_TYPES.has(typeOf(e.toId, newComponents))
    );
    if (ownerSyncEdges.length === 0) return;

    // Drop the originals.
    const dropIds = new Set(ownerSyncEdges.map((e) => e.id));
    newConnections = newConnections.filter((e) => !dropIds.has(e.id));

    // Owner → workflow (single "starts" edge).
    newConnections.push({
      id: mintId(),
      fromId: owner.id,
      toId: wfId,
      kind: 'triggers',
      label: 'starts workflow',
      note: 'Durable handoff — owner returns immediately'
    });

    // Workflow → each downstream (orchestrated activity).
    ownerSyncEdges.forEach((orig) => {
      newConnections.push({
        id: mintId(),
        fromId: wfId,
        toId: orig.toId,
        kind: 'orchestrates',
        label: orig.label || 'executes activity',
        note: 'Retried with backoff · idempotent · timeout enforced'
      });
    });

    // If the candidate calls an external system synchronously, also add a
    // compensation path placeholder so the user sees the saga pattern.
    const externalDownstream = ownerSyncEdges.find((e) =>
      EXTERNAL_TYPES.has(typeOf(e.toId, newComponents))
    );
    if (externalDownstream) {
      newConnections.push({
        id: mintId(),
        fromId: wfId,
        toId: externalDownstream.toId,
        kind: 'compensates',
        label: 'rollback on failure',
        note: 'Saga compensation — undoes the external side-effect'
      });
    }
  });

  return { components: newComponents, connections: newConnections };
}


// ---- The hook -----------------------------------------------------------
export function useBuilder() {
  const stored = loadJson(STATE_KEY);
  if (stored && typeof stored.nextId === 'number' && stored.nextId > nextId) {
    nextId = stored.nextId;
  }

  const [components, setComponents] = useState(() => stored?.components ?? []);
  const [connections, setConnections] = useState(() => stored?.connections ?? []);
  const [customTypes, setCustomTypes] = useState(() => stored?.customTypes ?? {});
  const [title, setTitle] = useState(() => stored?.title ?? 'My Architecture');
  const [baseline, setBaseline] = useState(() => loadJson(BASELINE_KEY));
  const [cloudId, setCloudId] = useState(() => loadJson(CLOUD_KEY) || null);
  const [activeProjectId, setActiveProjectIdState] = useState(() => loadJson(PROJECT_KEY) || null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudLastSavedAt, setCloudLastSavedAt] = useState(null);
  const [cloudError, setCloudError] = useState(null);

  // Settings (layout)
  const storedSettings = loadJson(SETTINGS_KEY) || {};
  const [layoutDir, setLayoutDir] = useState(storedSettings.layoutDir || 'LR');
  const [useSubgraphs, setUseSubgraphs] = useState(storedSettings.useSubgraphs !== false);

  useEffect(() => {
    saveJson(SETTINGS_KEY, { layoutDir, useSubgraphs });
  }, [layoutDir, useSubgraphs]);

  useEffect(() => {
    saveJson(CLOUD_KEY, cloudId);
  }, [cloudId]);

  useEffect(() => {
    saveJson(PROJECT_KEY, activeProjectId);
  }, [activeProjectId]);

  const setActiveProjectId = useCallback((id) => {
    setActiveProjectIdState(id || null);
    // Switching projects detaches us from the current cloud record so the
    // next edit lands in the newly selected project as a fresh architecture.
    setCloudId(null);
  }, []);

  // History (undo/redo) — snapshots of the entire editable state.
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const stateRef = useRef({ title, components, connections, customTypes });
  useEffect(() => {
    stateRef.current = { title, components, connections, customTypes };
  }, [title, components, connections, customTypes]);

  const lastCommitRef = useRef({ tag: null, at: 0 });

  // Push a snapshot to `past`. If `tag` matches the previous commit within
  // 800ms, replace instead of pushing (coalesces rapid typing into one undo).
  const commit = useCallback((tag = null) => {
    const now = Date.now();
    const snap = JSON.parse(JSON.stringify(stateRef.current));
    setFuture([]);
    setPast((prev) => {
      if (tag && lastCommitRef.current.tag === tag && now - lastCommitRef.current.at < 800) {
        lastCommitRef.current = { tag, at: now };
        return prev; // coalesce — don't push again
      }
      lastCommitRef.current = { tag, at: now };
      const next = [...prev, snap];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
  }, []);

  const applySnap = useCallback((snap) => {
    setTitle(snap.title);
    setComponents(snap.components);
    setConnections(snap.connections);
    setCustomTypes(snap.customTypes);
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const snap = p[p.length - 1];
      setFuture((f) => [JSON.parse(JSON.stringify(stateRef.current)), ...f].slice(0, MAX_HISTORY));
      applySnap(snap);
      lastCommitRef.current = { tag: null, at: 0 };
      return p.slice(0, -1);
    });
  }, [applySnap]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [snap, ...rest] = f;
      setPast((p) => [...p, JSON.parse(JSON.stringify(stateRef.current))].slice(-MAX_HISTORY));
      applySnap(snap);
      lastCommitRef.current = { tag: null, at: 0 };
      return rest;
    });
  }, [applySnap]);

  // Persist state + baseline
  useEffect(() => {
    saveJson(STATE_KEY, { title, components, connections, customTypes, nextId });
  }, [title, components, connections, customTypes]);

  useEffect(() => {
    if (baseline) saveJson(BASELINE_KEY, baseline);
    else saveJson(BASELINE_KEY, null);
  }, [baseline]);

  // Cloud auto-sync. When Supabase is configured we treat it as the source of
  // truth: as soon as the user has any real content we create a record (so it
  // shows up in the shared gallery), and any subsequent change is debounced
  // up to that record. localStorage continues to act as an offline cache.
  // Cloud auto-sync. We do NOT auto-create remote records — the user must
  // explicitly click "Save to cloud" first. Once a cloudId exists, every
  // edit debounces an upsert so the file content stays in sync without the
  // user having to think about it.
  useEffect(() => {
    if (!supabaseConfigured || !cloudId) return;
    const payload = { title, components, connections, customTypes, nextId };
    const handle = setTimeout(async () => {
      setCloudSaving(true);
      setCloudError(null);
      try {
        await saveRemoteArchitecture(cloudId, payload, activeProjectId);
        setCloudLastSavedAt(Date.now());
      } catch (e) {
        console.warn('Cloud auto-save failed:', e?.message || e);
        setCloudError(e?.message || 'Cloud save failed');
      } finally {
        setCloudSaving(false);
      }
    }, 1200);
    return () => clearTimeout(handle);
  }, [title, components, connections, customTypes, cloudId, activeProjectId]);

  const allTypes = useMemo(() => ({ ...DEFAULT_TYPES, ...customTypes }), [customTypes]);

  const loadCloudArchitecture = useCallback(async (id) => {
    const record = await loadRemoteArchitecture(id);
    if (!record || !record.payload) throw new Error('Cloud architecture not found');
    commit();
    const payload = record.payload;
    setTitle(payload.title || 'My Architecture');
    setComponents(payload.components || []);
    setConnections(payload.connections || []);
    setCustomTypes(payload.customTypes || {});
    if (typeof payload.nextId === 'number' && payload.nextId > nextId) nextId = payload.nextId;
    setCloudId(record.id);
    if (record.project_id) setActiveProjectIdState(record.project_id);
    return record.id;
  }, [commit]);

  const saveCloudArchitecture = useCallback(async () => {
    const payload = { title, components, connections, customTypes, nextId };
    setCloudSaving(true);
    setCloudError(null);
    try {
      const id = await saveRemoteArchitecture(cloudId, payload, activeProjectId);
      setCloudId(id);
      setCloudLastSavedAt(Date.now());
      return id;
    } catch (e) {
      setCloudError(e?.message || 'Cloud save failed');
      throw e;
    } finally {
      setCloudSaving(false);
    }
  }, [title, components, connections, customTypes, cloudId, activeProjectId]);

  const detachFromCloud = useCallback(() => {
    setCloudId(null);
    setCloudLastSavedAt(null);
    setCloudError(null);
  }, []);

  // ---------- Mutators (each commits history) ----------
  const addComponent = useCallback((type) => {
    const def = allTypes[type];
    if (!def) return;
    commit();
    setComponents((prev) => [
      ...prev,
      {
        id: newId(),
        type,
        name: `${def.label} ${prev.filter((p) => p.type === type).length + 1}`,
        notes: '', icon: '', color: ''
      }
    ]);
  }, [allTypes, commit]);

  const updateComponent = useCallback((id, patch) => {
    commit(`update-comp-${id}-${Object.keys(patch).join('-')}`);
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [commit]);

  const removeComponent = useCallback((id) => {
    commit();
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setConnections((prev) => prev.filter((c) => c.fromId !== id && c.toId !== id));
  }, [commit]);

  const removeComponents = useCallback((ids) => {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    commit();
    setComponents((prev) => prev.filter((c) => !set.has(c.id)));
    setConnections((prev) => prev.filter((c) => !set.has(c.fromId) && !set.has(c.toId)));
  }, [commit]);

  const applyToComponents = useCallback((ids, patch) => {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    commit();
    setComponents((prev) => prev.map((c) => (set.has(c.id) ? { ...c, ...patch } : c)));
  }, [commit]);

  const moveComponent = useCallback((id, delta) => {
    commit();
    setComponents((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, [commit]);

  const reorderComponents = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    commit();
    setComponents((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, [commit]);

  const addConnection = useCallback((conn) => {
    if (!conn.fromId || !conn.toId || conn.fromId === conn.toId) return;
    commit();
    setConnections((prev) => [...prev, { id: newId(), kind: 'calls', label: '', note: '', ...conn }]);
  }, [commit]);

  const updateConnection = useCallback((id, patch) => {
    commit(`update-conn-${id}-${Object.keys(patch).join('-')}`);
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, [commit]);

  const removeConnection = useCallback((id) => {
    commit();
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, [commit]);

  const duplicateConnection = useCallback((id) => {
    commit();
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: newId() };
      const next = prev.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }, [commit]);

  const swapConnection = useCallback((id) => {
    commit();
    setConnections((prev) => prev.map((c) =>
      c.id === id ? { ...c, fromId: c.toId, toId: c.fromId } : c
    ));
  }, [commit]);

  const moveConnection = useCallback((id, delta) => {
    commit();
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
  }, [commit]);

  const reorderConnections = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    commit();
    setConnections((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, [commit]);

  const addCustomType = useCallback((def) => {
    const key = `custom_${slugify(def.label, 'type')}_${Date.now().toString(36)}`;
    commit();
    setCustomTypes((prev) => ({
      ...prev,
      [key]: {
        label: def.label || 'Custom',
        group: def.group || 'Custom',
        shape: def.shape || 'rect',
        icon: def.icon || '🧩',
        color: def.color || '#475569'
      }
    }));
    return key;
  }, [commit]);

  const removeCustomType = useCallback((key) => {
    commit();
    setCustomTypes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [commit]);

  const setTitleTracked = useCallback((t) => {
    commit('title-edit');
    setTitle(t);
  }, [commit]);

  const reset = useCallback(() => {
    commit();
    setComponents([]);
    setConnections([]);
    setCustomTypes({});
    setTitle('My Architecture');
    setBaseline(null);
  }, [commit]);

  // ---------- Import / Export ----------
  const exportJson = useCallback(() => JSON.stringify({
    version: 1,
    title, components, connections, customTypes, nextId,
    exportedAt: new Date().toISOString()
  }, null, 2), [title, components, connections, customTypes]);

  const importJson = useCallback((jsonText, { asBaseline = false } = {}) => {
    let data;
    try { data = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText; }
    catch { throw new Error('Invalid JSON file'); }
    if (!data || !Array.isArray(data.components) || !Array.isArray(data.connections)) {
      throw new Error('Not a valid Archivise architecture file');
    }
    commit();
    const incoming = {
      title: data.title || 'Imported Architecture',
      components: data.components,
      connections: data.connections.map((c) => ({ note: '', ...c })),
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
  }, [commit]);

  // ---------- Baseline ----------
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
    commit();
    setTitle(baseline.title);
    setComponents(JSON.parse(JSON.stringify(baseline.components)));
    setConnections(JSON.parse(JSON.stringify(baseline.connections)));
    setCustomTypes(JSON.parse(JSON.stringify(baseline.customTypes || {})));
  }, [baseline, commit]);

  const loadSample = useCallback(() => {
    commit();
    nextId = 1;
    const c = [
      { id: newId(), type: 'user',         name: 'Customer',                notes: '', icon: '', color: '' },
      { id: newId(), type: 'mobile',       name: 'Mobile App',              notes: '', icon: '', color: '' },
      { id: newId(), type: 'edge',         name: 'CloudFront',              notes: 'TLS + WAF', icon: '', color: '' },
      { id: newId(), type: 'apigateway',   name: 'API Gateway',             notes: '', icon: '', color: '' },
      { id: newId(), type: 'idp',          name: 'Cognito',                 notes: 'OIDC', icon: '', color: '' },
      { id: newId(), type: 'api',          name: 'Identity API',            notes: 'Auth + user mgmt', icon: '', color: '' },
      { id: newId(), type: 'eventbus',     name: 'EventBridge',             notes: 'domain events', icon: '', color: '' },
      { id: newId(), type: 'workflow',     name: 'Onboarding Workflow',     notes: 'Step Functions', icon: '', color: '' },
      { id: newId(), type: 'function',     name: 'Provision Account',       notes: 'Lambda', icon: '', color: '' },
      { id: newId(), type: 'function',     name: 'Send Welcome Email',      notes: 'Lambda', icon: '', color: '' },
      { id: newId(), type: 'queue',        name: 'kyc_queue',               notes: 'SQS', icon: '', color: '' },
      { id: newId(), type: 'consumer',     name: 'KYC Worker',              notes: '', icon: '', color: '' },
      { id: newId(), type: 'database',     name: 'PostgreSQL',              notes: 'users db', icon: '', color: '' },
      { id: newId(), type: 'search',       name: 'OpenSearch',              notes: '', icon: '', color: '' },
      { id: newId(), type: 'external',     name: 'Fineract',                notes: 'Core banking', icon: '', color: '' },
      { id: newId(), type: 'scheduler',    name: 'Daily Reconciliation',    notes: 'cron 0 2 * * *', icon: '', color: '' },
      { id: newId(), type: 'telemetry',    name: 'CloudWatch',              notes: 'metrics + logs', icon: '', color: '' }
    ];
    setComponents(c);
    setConnections([
      { id: newId(), fromId: c[0].id,  toId: c[1].id,  kind: 'uses',                 label: '', note: '' },
      { id: newId(), fromId: c[1].id,  toId: c[2].id,  kind: 'calls',                label: 'HTTPS', note: '' },
      { id: newId(), fromId: c[2].id,  toId: c[3].id,  kind: 'load-balances-to',     label: '', note: '' },
      { id: newId(), fromId: c[3].id,  toId: c[5].id,  kind: 'commands',             label: 'register', note: '' },
      { id: newId(), fromId: c[5].id,  toId: c[4].id,  kind: 'authenticates-via',    label: '', note: '' },
      { id: newId(), fromId: c[5].id,  toId: c[6].id,  kind: 'emits',                label: 'CustomerRegistered', note: 'fire-and-forget' },
      { id: newId(), fromId: c[6].id,  toId: c[7].id,  kind: 'triggers',             label: '', note: '' },
      { id: newId(), fromId: c[7].id,  toId: c[8].id,  kind: 'orchestrates',         label: 'step 1', note: '' },
      { id: newId(), fromId: c[7].id,  toId: c[10].id, kind: 'fans-out',             label: 'KYC checks', note: '' },
      { id: newId(), fromId: c[11].id, toId: c[10].id, kind: 'consumes',             label: '', note: '' },
      { id: newId(), fromId: c[11].id, toId: c[14].id, kind: 'integrates',           label: 'KYC lookup', note: '' },
      { id: newId(), fromId: c[8].id,  toId: c[14].id, kind: 'commands',             label: 'create account', note: '' },
      { id: newId(), fromId: c[8].id,  toId: c[12].id, kind: 'writes',               label: '', note: '' },
      { id: newId(), fromId: c[8].id,  toId: c[13].id, kind: 'indexes',              label: 'user profile', note: '' },
      { id: newId(), fromId: c[7].id,  toId: c[9].id,  kind: 'invokes',              label: 'on success', note: '' },
      { id: newId(), fromId: c[7].id,  toId: c[8].id,  kind: 'compensates',          label: 'on failure', note: 'saga rollback' },
      { id: newId(), fromId: c[15].id, toId: c[12].id, kind: 'schedules',            label: 'reconcile', note: '' },
      { id: newId(), fromId: c[16].id, toId: c[5].id,  kind: 'observes',             label: '', note: '' },
      { id: newId(), fromId: c[16].id, toId: c[7].id,  kind: 'observes',             label: '', note: '' }
    ]);
    setTitle('Customer Onboarding');
  }, [commit]);

  // ---------- Derived ----------
  const mergedEdges = useMemo(() => mergeEdges(connections), [connections]);

  const mermaid = useMemo(
    () => buildMermaid({ components, mergedEdges, allTypes, layoutDir, useSubgraphs }),
    [components, mergedEdges, allTypes, layoutDir, useSubgraphs]
  );

  const simulationSteps = useMemo(() => mergedEdges.map((e, idx) => {
    const from = components.find((c) => c.id === e.fromId);
    const to = components.find((c) => c.id === e.toId);
    return {
      index: idx,
      fromId: e.fromId, toId: e.toId,
      fromName: from?.name || '?', toName: to?.name || '?',
      labels: e.labels,
      narrative: from && to
        ? `${from.name} ${e.labels.join(' & ') || 'connects to'} ${to.name}`
        : ''
    };
  }), [mergedEdges, components]);

  const diff = useMemo(
    () => computeDiff(baseline, { title, components, connections }),
    [baseline, title, components, connections]
  );

  const diffMermaid = useMemo(
    () => buildDiffMermaid({
      baseline, current: { title, components, connections }, allTypes, layoutDir, useSubgraphs
    }),
    [baseline, title, components, connections, allTypes, layoutDir, useSubgraphs]
  );

  const baselineMermaid = useMemo(() => {
    if (!baseline) return '';
    const merged = mergeEdges(baseline.connections || []);
    const baselineAllTypes = { ...DEFAULT_TYPES, ...(baseline.customTypes || {}) };
    return buildMermaid({
      components: baseline.components || [],
      mergedEdges: merged,
      allTypes: baselineAllTypes,
      layoutDir, useSubgraphs
    });
  }, [baseline, layoutDir, useSubgraphs]);

  const lints = useMemo(
    () => runLints({ components, connections }),
    [components, connections]
  );

  const orchestration = useMemo(
    () => analyzeOrchestration({ components, connections, allTypes }),
    [components, connections, allTypes]
  );
  // Backwards-compat: keep `assessment` exported under both names.
  const assessment = orchestration;

  const applyTemporalRedesign = useCallback(() => {
    const cands = orchestration?.candidates || [];
    if (!cands.length) return false;
    // Capture today's design as the baseline so the diff tab tells the story.
    const snapshot = {
      title, components, connections, customTypes,
      capturedAt: new Date().toISOString()
    };
    setBaseline(JSON.parse(JSON.stringify(snapshot)));
    commit('temporal-redesign');
    const next = generateTemporalRedesign({ components, connections, candidates: cands, allTypes });
    setComponents(next.components);
    setConnections(next.connections);
    return true;
  }, [orchestration, title, components, connections, customTypes, allTypes, commit]);

  // ---------- Multi-document workspace ----------
  const loadDocs = () => loadJson(DOCS_KEY) || [];
  const [docs, setDocsState] = useState(loadDocs);
  const [activeDocId, setActiveDocId] = useState(() => loadJson(ACTIVE_DOC_KEY)?.id || null);

  const persistDocs = (next) => { setDocsState(next); saveJson(DOCS_KEY, next); };
  const persistActive = (id) => { setActiveDocId(id); saveJson(ACTIVE_DOC_KEY, { id }); };

  const saveAsDoc = useCallback((name) => {
    const id = `doc_${Date.now().toString(36)}`;
    const doc = {
      id,
      name: (name || title || 'Untitled').trim(),
      updatedAt: new Date().toISOString(),
      state: { title, components, connections, customTypes },
      baseline
    };
    persistDocs([...loadDocs(), doc]);
    persistActive(id);
    return id;
  }, [title, components, connections, customTypes, baseline]);

  const saveActiveDoc = useCallback(() => {
    const list = loadDocs();
    if (!activeDocId) return null;
    const idx = list.findIndex((d) => d.id === activeDocId);
    if (idx === -1) return null;
    list[idx] = {
      ...list[idx],
      name: title || list[idx].name,
      updatedAt: new Date().toISOString(),
      state: { title, components, connections, customTypes },
      baseline
    };
    persistDocs(list);
    return activeDocId;
  }, [activeDocId, title, components, connections, customTypes, baseline]);

  const loadDoc = useCallback((id) => {
    const list = loadDocs();
    const d = list.find((x) => x.id === id);
    if (!d) return;
    commit();
    setTitle(d.state.title);
    setComponents(d.state.components);
    setConnections((d.state.connections || []).map((c) => ({ note: '', ...c })));
    setCustomTypes(d.state.customTypes || {});
    setBaseline(d.baseline || null);
    persistActive(id);
  }, [commit]);

  const renameDoc = useCallback((id, name) => {
    const list = loadDocs().map((d) => d.id === id ? { ...d, name: name.trim() || d.name } : d);
    persistDocs(list);
  }, []);

  const duplicateDoc = useCallback((id) => {
    const list = loadDocs();
    const src = list.find((d) => d.id === id);
    if (!src) return;
    const copy = { ...JSON.parse(JSON.stringify(src)), id: `doc_${Date.now().toString(36)}`, name: `${src.name} (copy)`, updatedAt: new Date().toISOString() };
    persistDocs([...list, copy]);
    return copy.id;
  }, []);

  const deleteDoc = useCallback((id) => {
    const next = loadDocs().filter((d) => d.id !== id);
    persistDocs(next);
    if (activeDocId === id) persistActive(null);
  }, [activeDocId]);

  const newDoc = useCallback(() => {
    commit();
    setComponents([]);
    setConnections([]);
    setCustomTypes({});
    setTitle('My Architecture');
    setBaseline(null);
    persistActive(null);
  }, [commit]);

  // Auto-save active doc whenever state changes (debounced via effect dep coalescing)
  useEffect(() => {
    if (!activeDocId) return;
    const handle = setTimeout(() => { saveActiveDoc(); }, 600);
    return () => clearTimeout(handle);
  }, [activeDocId, title, components, connections, customTypes, baseline, saveActiveDoc]);

  return {
    // state
    title, setTitle: setTitleTracked,
    components, addComponent, updateComponent, removeComponent,
    removeComponents, applyToComponents, moveComponent, reorderComponents,
    connections, addConnection, updateConnection, removeConnection,
    duplicateConnection, swapConnection, moveConnection, reorderConnections,
    customTypes, allTypes, addCustomType, removeCustomType,
    // history
    undo, redo, canUndo: past.length > 0, canRedo: future.length > 0,
    // layout
    layoutDir, setLayoutDir, useSubgraphs, setUseSubgraphs,
    // derived
    mermaid, mergedEdges, simulationSteps, lints, assessment, orchestration,
    applyTemporalRedesign,
    // maintenance
    reset, loadSample,
    // import/export
    exportJson, importJson,
    // baseline / diff
    baseline, captureBaseline, clearBaseline, restoreBaseline,
    diff, diffMermaid, baselineMermaid,
    // cloud persistence
    cloudEnabled: supabaseConfigured,
    cloudId, loadCloudArchitecture, saveCloudArchitecture,
    cloudSaving, cloudLastSavedAt, cloudError, detachFromCloud,
    listCloudArchitectures: listRemoteArchitectures,
    deleteCloudArchitecture: deleteRemoteArchitecture,
    // projects
    activeProjectId, setActiveProjectId,
    listCloudProjects: listRemoteProjects,
    createCloudProject: createRemoteProject,
    renameCloudProject: renameRemoteProject,
    deleteCloudProject: deleteRemoteProject,
    moveCloudArchitectureToProject: moveRemoteArchitectureToProject,
    // workspaces
    docs, activeDocId, saveAsDoc, saveActiveDoc, loadDoc, renameDoc, duplicateDoc, deleteDoc, newDoc
  };
}
