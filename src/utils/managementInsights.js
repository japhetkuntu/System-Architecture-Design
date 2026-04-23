// Translates technical architecture data into business-friendly insights:
// plain-English component descriptions, capability layers, failure modes
// and what-if scenarios. Pure functions — easy to test, no React.

// ---------------------------------------------------------------------------
// Plain-English descriptions for component types. Falls back to a generic
// "internal service" blurb when the type is unknown / custom.
// ---------------------------------------------------------------------------
const TYPE_DESCRIPTIONS = {
  // People & devices
  user:        { label: 'Customer',        text: 'A real person using the product.' },
  customer:    { label: 'Customer',        text: 'A real person using the product.' },
  admin:       { label: 'Internal staff',  text: 'A staff member managing the system from the inside.' },
  browser:     { label: 'Web browser',     text: 'Where customers reach us through a browser.' },
  mobile:      { label: 'Mobile app',      text: 'Where customers reach us through a phone app.' },
  phone:       { label: 'Phone',           text: 'A customer using a phone keypad to reach us.' },
  client:      { label: 'Client device',   text: 'How a customer connects to the product.' },
  ussd:        { label: 'USSD menu',       text: 'A phone-keypad-driven service for users without smartphones.' },
  frontend:    { label: 'App interface',   text: 'What customers actually see and click.' },

  // Edge / front door
  edge:        { label: 'Edge network',    text: 'Delivers content quickly to customers around the world.' },
  cdn:         { label: 'Content network', text: 'Caches images and pages near customers so pages load fast.' },
  loadbalancer:{ label: 'Traffic spreader',text: 'Spreads incoming requests so no one server gets overwhelmed.' },
  lb:          { label: 'Traffic spreader',text: 'Spreads incoming requests so no one server gets overwhelmed.' },
  gateway:     { label: 'Front door',      text: 'The entry point — checks who you are and routes you to the right service.' },
  apigateway:  { label: 'Front door',      text: 'The entry point — checks who you are and routes you to the right service.' },
  'api-gateway': { label: 'Front door',    text: 'The entry point — checks who you are and routes you to the right service.' },

  // APIs
  internal_api:{ label: 'Internal service', text: 'A service used by other parts of the company.' },
  api:         { label: 'Service',         text: 'A piece of software that does one job for the rest of the system.' },
  public_api:  { label: 'Public service',  text: 'A service that customers and partners call from outside.' },
  external_api:{ label: 'Partner service', text: 'A third-party service we depend on (someone else owns it).' },
  external:    { label: 'Outside system',  text: 'A third-party system we connect to (someone else owns it).' },

  // Workers / scheduling
  bg_job:      { label: 'Background worker', text: 'Quietly does work in the background without making customers wait.' },
  consumer:    { label: 'Background worker', text: 'Picks up tasks from a queue and processes them.' },
  kafka_consumer:{ label: 'Event listener',  text: 'Listens to the event stream and reacts when something happens.' },
  scheduler:   { label: 'Scheduled job',   text: 'Runs work automatically on a clock (e.g. nightly reports).' },
  cron:        { label: 'Scheduled job',   text: 'Runs work automatically on a clock.' },
  timer:       { label: 'Timer',           text: 'Triggers something on a delay or interval.' },
  function:    { label: 'On-demand function', text: 'A small piece of code that runs only when needed.' },
  container:   { label: 'Cloud service',   text: 'Software packaged to run flexibly in the cloud.' },
  sdk:         { label: 'Toolkit',         text: 'Code other developers use to talk to our system.' },

  // Messaging
  kafka:       { label: 'Event stream',    text: 'A high-speed broadcast pipeline — sends updates to everyone listening.' },
  queue:       { label: 'Task queue',      text: 'A waiting line for work to be done in order, even during spikes.' },
  topic:       { label: 'Broadcast topic', text: 'A channel that delivers messages to anyone subscribed.' },
  stream:      { label: 'Data stream',     text: 'A continuous flow of data feeding downstream services.' },
  eventbus:    { label: 'Event bus',       text: 'Routes events between different parts of the system.' },
  event:       { label: 'Event channel',   text: 'Carries notifications about things that happened.' },
  webhook:     { label: 'Webhook',         text: 'Lets outside systems notify us when something happens on their side.' },
  nifi:        { label: 'Data pipeline',   text: 'Moves and reshapes data automatically between systems.' },

  // Data
  postgres:    { label: 'Database',        text: 'Where information is stored long-term and queried.' },
  mysql:       { label: 'Database',        text: 'Where information is stored long-term and queried.' },
  sqlserver:   { label: 'Database',        text: 'Where information is stored long-term and queried.' },
  database:    { label: 'Database',        text: 'Where information is stored long-term and queried.' },
  cache:       { label: 'Fast memory',     text: 'A speed-boost layer — keeps frequently used data instantly available.' },
  redis:       { label: 'Fast memory',     text: 'A speed-boost layer — keeps frequently used data instantly available.' },
  inmemory:    { label: 'In-memory store', text: 'Holds short-lived data in memory for instant access.' },
  storage:     { label: 'File storage',    text: 'Where files, images and documents live.' },
  hdd:         { label: 'Disk storage',    text: 'Long-term storage on disk.' },
  search:      { label: 'Search index',    text: 'Lets the system find information quickly across lots of records.' },
  warehouse:   { label: 'Data warehouse',  text: 'Where historical data is kept for reports and analysis.' },

  // Observability
  telemetry:   { label: 'Monitoring',      text: 'Watches the system and alerts the team when something looks wrong.' }
};

function normaliseType(type) {
  return String(type || '').toLowerCase().replace(/\s|-/g, '');
}

export function describeComponent(component, allTypes) {
  const t = normaliseType(component?.type);
  const direct = TYPE_DESCRIPTIONS[t];
  if (direct) return direct;
  const custom = allTypes?.[component?.type];
  if (custom?.label) {
    return { label: custom.label, text: `${custom.label} — a custom service in this architecture.` };
  }
  return { label: component?.type || 'Service', text: 'A service in this architecture.' };
}

// ---------------------------------------------------------------------------
// Capability layers — group components into business-meaningful tiers.
// ---------------------------------------------------------------------------
const LAYERS = [
  {
    id: 'user',
    label: 'User-facing',
    blurb: 'What customers and staff actually touch.',
    types: ['user','customer','admin','browser','mobile','phone','client','ussd','frontend']
  },
  {
    id: 'edge',
    label: 'Front door',
    blurb: 'How requests get into the system safely and quickly.',
    types: ['edge','cdn','loadbalancer','lb','gateway','apigateway','api-gateway','public_api']
  },
  {
    id: 'business',
    label: 'Business logic',
    blurb: 'The services that do the actual work.',
    types: [
      'internal_api','api','service','function','container','sdk',
      'bg_job','consumer','kafka_consumer','scheduler','cron','timer',
      'kafka','queue','topic','stream','eventbus','event','webhook','nifi'
    ]
  },
  {
    id: 'data',
    label: 'Data & storage',
    blurb: 'Where information lives.',
    types: ['postgres','mysql','sqlserver','database','cache','redis','inmemory','storage','hdd','search','warehouse']
  },
  {
    id: 'external',
    label: 'External services',
    blurb: 'Partners and outside systems we depend on.',
    types: ['external','external_api','telemetry']
  }
];

const TYPE_TO_LAYER = (() => {
  const map = new Map();
  LAYERS.forEach((l) => l.types.forEach((t) => map.set(t, l.id)));
  return map;
})();

export function layerOf(component) {
  return TYPE_TO_LAYER.get(normaliseType(component?.type)) || 'business';
}

export function getLayerDefs() {
  return LAYERS.map((l) => ({ id: l.id, label: l.label, blurb: l.blurb }));
}

// ---------------------------------------------------------------------------
// Audience — who uses each component (customers / staff / partners / system)
// ---------------------------------------------------------------------------
const AUDIENCE_BY_TYPE = {
  user: 'Customers', customer: 'Customers', browser: 'Customers', mobile: 'Customers',
  phone: 'Customers', client: 'Customers', ussd: 'Customers', frontend: 'Customers',
  admin: 'Internal staff',
  external: 'Partners', external_api: 'Partners',
  public_api: 'Partners & customers',
  telemetry: 'Engineering team'
};
export function audienceFor(component) {
  return AUDIENCE_BY_TYPE[normaliseType(component?.type)] || 'System (internal)';
}

// ---------------------------------------------------------------------------
// Estimated step duration (ms) — used by the Journey Simulator metrics.
// ---------------------------------------------------------------------------
const STEP_MS_BY_TYPE = {
  cache: 5, redis: 5, inmemory: 5,
  function: 80, container: 60,
  internal_api: 70, api: 70, public_api: 90,
  external_api: 600, external: 600,
  postgres: 40, mysql: 40, sqlserver: 60, database: 50, search: 80, warehouse: 200,
  storage: 120, hdd: 120,
  kafka: 15, queue: 10, topic: 10, stream: 15, eventbus: 10, event: 10, webhook: 250,
  bg_job: 200, consumer: 50, kafka_consumer: 50,
  scheduler: 5, cron: 5, timer: 5,
  gateway: 25, apigateway: 25, 'api-gateway': 25, loadbalancer: 8, lb: 8, edge: 15, cdn: 15,
  user: 0, customer: 0, admin: 0, browser: 0, mobile: 0, phone: 0, client: 0, ussd: 5, frontend: 20,
  sdk: 20, telemetry: 0, nifi: 100
};
export function estimateStepMs(component) {
  const t = normaliseType(component?.type);
  return STEP_MS_BY_TYPE[t] ?? 60;
}

// ---------------------------------------------------------------------------
// Recovery time (minutes) — used in capability cards.
// ---------------------------------------------------------------------------
const RECOVERY_MIN_BY_TYPE = {
  cache: 1, redis: 1, inmemory: 1,
  function: 2, container: 3,
  internal_api: 5, api: 5, public_api: 10,
  external_api: 60, external: 60, telemetry: 5,
  postgres: 30, mysql: 30, sqlserver: 30, database: 30, search: 20, warehouse: 60,
  storage: 15, hdd: 15,
  kafka: 15, queue: 5, topic: 10, stream: 15, eventbus: 10, event: 10, webhook: 30,
  bg_job: 5, consumer: 5, kafka_consumer: 5,
  scheduler: 2, cron: 2, timer: 2,
  gateway: 5, apigateway: 5, 'api-gateway': 5, loadbalancer: 5, lb: 5, edge: 10, cdn: 10,
  frontend: 10, sdk: 5, ussd: 30, nifi: 20
};
export function recoveryMinutesFor(component) {
  const t = normaliseType(component?.type);
  return RECOVERY_MIN_BY_TYPE[t] ?? 15;
}
export function formatRecovery(minutes) {
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `~${minutes} min`;
  const hrs = Math.round(minutes / 60);
  return hrs === 1 ? '~1 hour' : `~${hrs} hours`;
}

// ---------------------------------------------------------------------------
// Health status — heuristic classification (green / amber / red).
// ---------------------------------------------------------------------------
export function healthFor(component, { incoming, outgoing, allTypes }) {
  const t = normaliseType(component?.type);
  // External dependencies are inherently amber — not under our control.
  if (t === 'external_api' || t === 'external') return 'amber';
  // Hot bottlenecks (lots of incoming, no caching layer) → amber.
  if (incoming >= 4) return 'amber';
  // Stranded components — connected to nothing → amber.
  if (incoming === 0 && outgoing === 0) return 'amber';
  return 'green';
}

// ---------------------------------------------------------------------------
// Failure modes — risks per component and per connection.
// ---------------------------------------------------------------------------
function isDataStore(t) {
  return ['postgres','mysql','sqlserver','database','warehouse','storage','hdd','search'].includes(t);
}
function isCache(t) {
  return ['cache','redis','inmemory'].includes(t);
}
function isExternal(t) {
  return ['external','external_api'].includes(t);
}
function isMessaging(t) {
  return ['kafka','queue','topic','stream','eventbus','event','webhook','nifi'].includes(t);
}
function isEntryPoint(t) {
  return ['gateway','apigateway','api-gateway','loadbalancer','lb','edge','cdn','public_api'].includes(t);
}

export function buildRisks({ components, connections, allTypes }) {
  const risks = [];
  const compById = new Map(components.map((c) => [c.id, c]));

  const incoming = new Map();
  const outgoing = new Map();
  components.forEach((c) => { incoming.set(c.id, 0); outgoing.set(c.id, 0); });
  connections.forEach((e) => {
    outgoing.set(e.fromId, (outgoing.get(e.fromId) || 0) + 1);
    incoming.set(e.toId, (incoming.get(e.toId) || 0) + 1);
  });

  // Per-component risks ---------------------------------------------------
  components.forEach((c) => {
    const t = normaliseType(c.type);
    const inDeg = incoming.get(c.id) || 0;
    const outDeg = outgoing.get(c.id) || 0;
    const desc = describeComponent(c, allTypes);
    const tag = (kind) => ({ id: `${c.id}-${kind}`, scope: 'component', componentId: c.id, componentName: c.name, capability: desc.label });

    if (isExternal(t)) {
      risks.push({ ...tag('vendor-outage'), title: `${c.name} could be unavailable`, impact: `If our partner's service is down, ${c.name}-powered features stop working until they recover.`, likelihood: 'Medium', severity: 'High', recommendation: 'Add a fallback or graceful degradation path so customers see a friendly message instead of an error.' });
    }
    if (isDataStore(t) && inDeg >= 3 && !components.some((o) => isCache(normaliseType(o.type)))) {
      risks.push({ ...tag('hot-db'), title: `${c.name} is a busy database with no cache in front`, impact: 'During peak time customers may see slow page loads or checkout errors.', likelihood: 'High', severity: 'High', recommendation: 'Put a fast-memory cache between callers and this database, or add a read replica.' });
    }
    if (isDataStore(t) && inDeg >= 1 && !components.some((o) => o.id !== c.id && normaliseType(o.type) === t)) {
      risks.push({ ...tag('spof-db'), title: `${c.name} is a single point of failure`, impact: 'If this database goes down, every feature that reads or writes from it stops working.', likelihood: 'Low', severity: 'Critical', recommendation: 'Run a replica in another zone and rehearse the failover.' });
    }
    if (isEntryPoint(t) && inDeg <= 0 && outDeg >= 2) {
      // entry points fan out, fine
    }
    if (isMessaging(t) && outDeg === 0) {
      risks.push({ ...tag('orphan-queue'), title: `${c.name} has no consumers`, impact: 'Messages will pile up unread — anything depending on those events will appear broken.', likelihood: 'Medium', severity: 'High', recommendation: 'Connect at least one worker that consumes from this channel, or remove it.' });
    }
    if (inDeg >= 5) {
      risks.push({ ...tag('bottleneck'), title: `${c.name} is a traffic bottleneck`, impact: 'Many parts of the system rely on it — a slowdown here ripples everywhere.', likelihood: 'Medium', severity: 'High', recommendation: 'Split responsibilities or add horizontal scaling so it can grow with demand.' });
    }
    if (inDeg === 0 && outDeg === 0 && !isEntryPoint(t)) {
      risks.push({ ...tag('orphan'), title: `${c.name} is not connected to anything`, impact: 'It either isn\'t doing anything yet, or it represents work-in-progress.', likelihood: 'Low', severity: 'Low', recommendation: 'Either wire it up to its callers/dependencies or remove it from the picture.' });
    }
    if (isCache(t) && outDeg === 0 && inDeg >= 1) {
      // typical — caches don't call out
    }
    if (t === 'gateway' || t === 'apigateway' || t === 'api-gateway') {
      risks.push({ ...tag('gateway-spof'), title: `${c.name} is the only front door`, impact: 'If the gateway has an outage, customers can\'t reach any feature at all.', likelihood: 'Low', severity: 'Critical', recommendation: 'Run the gateway across multiple zones and monitor it independently of the services behind it.' });
    }
  });

  // Per-connection risks -------------------------------------------------
  connections.forEach((e) => {
    const from = compById.get(e.fromId);
    const to = compById.get(e.toId);
    if (!from || !to) return;
    const fromT = normaliseType(from.type);
    const toT = normaliseType(to.type);
    const rel = allTypes?.[e.kind];
    const arrow = rel?.arrow || '';
    const isAsync = arrow.includes('-.') || /async|publish|emit|enqueue|notify/i.test(`${e.label || ''} ${rel?.label || ''}`);
    const tag = (kind) => ({ id: `${e.id}-${kind}`, scope: 'connection', componentId: from.id, componentName: `${from.name} → ${to.name}`, capability: rel?.label || e.kind || 'calls' });

    if (!isAsync && isExternal(toT)) {
      risks.push({ ...tag('sync-external'), title: `${from.name} waits for ${to.name} (external)`, impact: 'When the partner is slow, our customers wait too — pages and actions feel sluggish.', likelihood: 'High', severity: 'High', recommendation: 'Wrap the call with a short timeout and a fallback, or push it to a background job.' });
    }
    if (!isAsync && isDataStore(toT) && /loop|all|each|fetch all|batch/i.test(e.label || '')) {
      risks.push({ ...tag('n-plus-1'), title: `${from.name} may make many round-trips to ${to.name}`, impact: 'Pages that show lists could become very slow as the data grows.', likelihood: 'Medium', severity: 'Medium', recommendation: 'Batch the queries or pre-compute the result.' });
    }
  });

  // Sort by severity then likelihood --------------------------------------
  const sevWeight = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  const likWeight = { Low: 1, Medium: 2, High: 3 };
  risks.sort((a, b) => (sevWeight[b.severity] - sevWeight[a.severity]) || (likWeight[b.likelihood] - likWeight[a.likelihood]));
  return risks;
}

export function summariseRisks(risks) {
  const by = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  risks.forEach((r) => { by[r.severity] = (by[r.severity] || 0) + 1; });
  // Score: weighted sum, capped at 100 (lower is better).
  const raw = (by.Critical * 25) + (by.High * 12) + (by.Medium * 5) + (by.Low * 1);
  const score = Math.min(100, raw);
  let band = 'Healthy';
  if (score > 60) band = 'Critical attention needed';
  else if (score > 30) band = 'Needs attention';
  else if (score > 10) band = 'Mostly healthy';
  return { score, band, by };
}

// ---------------------------------------------------------------------------
// What-if scenarios — generated based on what's actually in the architecture.
// Each scenario picks a set of affected component IDs and a tier (red/amber).
// ---------------------------------------------------------------------------
export function buildScenarios({ components, connections }) {
  const compById = new Map(components.map((c) => [c.id, c]));
  const types = components.map((c) => normaliseType(c.type));

  // Helper: dependents reachable from `seedIds` (downstream impact).
  const downstreamFrom = (seedIds) => {
    const out = new Set(seedIds);
    let frontier = [...seedIds];
    while (frontier.length) {
      const next = [];
      frontier.forEach((id) => {
        connections.forEach((e) => {
          if (e.fromId === id && !out.has(e.toId)) { out.add(e.toId); next.push(e.toId); }
        });
      });
      frontier = next;
    }
    return out;
  };
  // Helper: anything that *depends on* seedIds (upstream impact).
  const upstreamFrom = (seedIds) => {
    const out = new Set(seedIds);
    let frontier = [...seedIds];
    while (frontier.length) {
      const next = [];
      frontier.forEach((id) => {
        connections.forEach((e) => {
          if (e.toId === id && !out.has(e.fromId)) { out.add(e.fromId); next.push(e.fromId); }
        });
      });
      frontier = next;
    }
    return out;
  };

  const findIdsByType = (predicate) =>
    components.filter((c) => predicate(normaliseType(c.type))).map((c) => c.id);

  const scenarios = [];

  // 1. Peak traffic ------------------------------------------------------
  const entryIds = findIdsByType((t) => isEntryPoint(t) || ['user','customer','browser','mobile','frontend'].includes(t));
  if (entryIds.length) {
    const affected = downstreamFrom(entryIds);
    scenarios.push({
      id: 'peak-traffic',
      title: 'Peak traffic hits',
      description: 'Marketing campaign or seasonal spike sends 10× the usual customer load.',
      consequence: 'Front-door services strain first, then services and databases queue up. Some customers experience slow pages.',
      userImpact: 'Up to 1 in 5 customers may see slow page loads or timeouts during the peak.',
      response: 'Pre-scale the front door and worker pool, enable caching aggressively, and queue non-essential work.',
      affectedIds: [...affected],
      severityById: Object.fromEntries([...affected].map((id) => {
        const t = normaliseType(compById.get(id)?.type);
        return [id, isDataStore(t) || isEntryPoint(t) ? 'red' : 'amber'];
      }))
    });
  }

  // 2. Database goes offline --------------------------------------------
  const dbIds = findIdsByType(isDataStore);
  if (dbIds.length) {
    const target = dbIds[0];
    const affected = upstreamFrom([target]);
    scenarios.push({
      id: 'db-down',
      title: `${compById.get(target)?.name || 'Primary database'} goes offline`,
      description: 'The main store of record is unavailable for a window of time.',
      consequence: 'Every feature that reads or writes from it stops working. Customers see errors.',
      userImpact: 'Most paying customers are blocked from completing any meaningful action.',
      response: 'Fail over to the standby, freeze writes, and put up a friendly status banner.',
      affectedIds: [...affected],
      severityById: Object.fromEntries([...affected].map((id) => [id, id === target ? 'red' : 'amber']))
    });
  }

  // 3. Third-party API fails --------------------------------------------
  const externalIds = findIdsByType(isExternal);
  if (externalIds.length) {
    const target = externalIds[0];
    const affected = upstreamFrom([target]);
    scenarios.push({
      id: 'vendor-out',
      title: `${compById.get(target)?.name || 'Partner service'} has an outage`,
      description: 'A third-party service we depend on is unreachable for hours.',
      consequence: 'Features that depend on this partner break. Other features still work.',
      userImpact: 'Customers using the affected feature see errors or missing data; everything else is fine.',
      response: 'Show a graceful "temporarily unavailable" message and retry in the background once they recover.',
      affectedIds: [...affected],
      severityById: Object.fromEntries([...affected].map((id) => [id, id === target ? 'red' : 'amber']))
    });
  }

  // 4. Cache flush -------------------------------------------------------
  const cacheIds = findIdsByType(isCache);
  if (cacheIds.length) {
    const target = cacheIds[0];
    const affectedDbs = findIdsByType(isDataStore);
    const affected = new Set([target, ...affectedDbs]);
    scenarios.push({
      id: 'cache-flush',
      title: `${compById.get(target)?.name || 'Cache'} is wiped (e.g. restart)`,
      description: 'The fast-memory layer empties — every request now goes to the database until it warms up again.',
      consequence: 'Database load spikes 5–20×. Pages slow down and may briefly time out.',
      userImpact: 'Customers see noticeably slower page loads for 5–15 minutes.',
      response: 'Pre-warm the cache after restarts and keep a circuit breaker on the database.',
      affectedIds: [...affected],
      severityById: Object.fromEntries([...affected].map((id) => [id, id === target ? 'amber' : 'red']))
    });
  }

  // 5. Security breach detected ----------------------------------------
  const sensitive = findIdsByType((t) => isDataStore(t) || isEntryPoint(t) || ['public_api','gateway','apigateway','api-gateway'].includes(t));
  if (sensitive.length) {
    scenarios.push({
      id: 'security',
      title: 'Security breach detected',
      description: 'Suspicious activity is observed against the front door or a data store.',
      consequence: 'We may need to lock down access, rotate credentials and audit recent changes.',
      userImpact: 'Customers may need to sign in again. Some features may be temporarily restricted.',
      response: 'Trigger the incident playbook: rotate keys, force sign-out, and audit logs.',
      affectedIds: sensitive,
      severityById: Object.fromEntries(sensitive.map((id) => {
        const t = normaliseType(compById.get(id)?.type);
        return [id, isDataStore(t) ? 'red' : 'amber'];
      }))
    });
  }

  // 6. Region / zone outage --------------------------------------------
  if (components.length >= 4) {
    const half = Math.ceil(components.length / 2);
    const affected = components.slice(0, half).map((c) => c.id);
    scenarios.push({
      id: 'region-out',
      title: 'Cloud region partial outage',
      description: 'A cloud provider zone fails, taking down roughly half of our services for an hour.',
      consequence: 'Affected services either fail or fall back to a standby. Throughput is reduced.',
      userImpact: 'Customers in some geographies see degraded performance; a few features may be unavailable.',
      response: 'Re-route traffic to healthy zones and communicate proactively with customers.',
      affectedIds: affected,
      severityById: Object.fromEntries(affected.map((id, i) => [id, i % 2 === 0 ? 'red' : 'amber']))
    });
  }

  return scenarios;
}
