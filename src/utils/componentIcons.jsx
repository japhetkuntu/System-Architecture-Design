import React from 'react';

/**
 * Hubtel-style component glyphs. Each is a small inline SVG, ~32×32, drawn
 * in monochrome — the parent applies the brand color via `currentColor`.
 *
 * The shapes echo the categories from Hubtel's drawio icon set
 * (Internal/Public/External APIs, Kafka, jobs, datastores, USSD, etc.)
 * without depending on any external icon library, so they render fast and
 * reliably in cards, palette tiles, and on the canvas nodes.
 */

const wrap = (children) => (
  <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

// Generic primitives reused across glyphs --------------------------------------

const ApiHex = ({ accent }) => wrap(
  <g>
    <path d="M16 2 28 9v14L16 30 4 23V9z" fill="currentColor" opacity="0.22" />
    <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    {accent === 'in' && <path d="M11 16h10M16 11v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />}
    {accent === 'out' && <path d="M10 16h12M18 11l4 5-4 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
    {accent === 'pub' && <circle cx="16" cy="16" r="4" fill="currentColor" />}
    {accent === 'gw' && <path d="M11 13h10M11 19h10M9 16h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />}
  </g>
);

const Cylinder = ({ accent }) => wrap(
  <g fill="none" stroke="currentColor" strokeWidth="1.8">
    <ellipse cx="16" cy="7" rx="10" ry="3" fill="currentColor" fillOpacity="0.25" />
    <path d="M6 7v18c0 1.7 4.5 3 10 3s10-1.3 10-3V7" fill="currentColor" fillOpacity="0.1" />
    <path d="M6 13c0 1.7 4.5 3 10 3s10-1.3 10-3" />
    <path d="M6 19c0 1.7 4.5 3 10 3s10-1.3 10-3" />
    {accent === 'pg' && <circle cx="22" cy="22" r="3" fill="currentColor" stroke="none" />}
    {accent === 'mysql' && <path d="M19 21c2-1 3-3 3-5" strokeWidth="2" strokeLinecap="round" />}
    {accent === 'mssql' && <rect x="19" y="19" width="6" height="6" fill="currentColor" stroke="none" />}
  </g>
);

const Server = () => wrap(
  <g fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4" y="6" width="24" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
    <rect x="4" y="14" width="24" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
    <rect x="4" y="22" width="24" height="6" rx="1" fill="currentColor" fillOpacity="0.18" />
    <circle cx="8" cy="9" r="0.9" fill="currentColor" />
    <circle cx="8" cy="17" r="0.9" fill="currentColor" />
    <circle cx="8" cy="25" r="0.9" fill="currentColor" />
  </g>
);

// Per-type glyphs --------------------------------------------------------------

const ICONS = {
  // APIs (Internal/Public/External) — distinct hex glyphs, color from caller
  internal_api: () => <ApiHex accent="in" />,
  public_api:   () => <ApiHex accent="pub" />,
  external_api: () => <ApiHex accent="out" />,
  api:          () => <ApiHex accent="in" />,

  // Streaming / messaging
  kafka: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="16" r="3.5" fill="currentColor" fillOpacity="0.2" />
      <circle cx="22" cy="9" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="22" cy="23" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="22" cy="16" r="3" fill="currentColor" fillOpacity="0.2" />
      <line x1="12" y1="14.5" x2="19.2" y2="10.5" />
      <line x1="12" y1="17.5" x2="19.2" y2="21.5" />
      <line x1="12.5" y1="16" x2="19" y2="16" />
    </g>
  ),
  kafka_consumer: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="13" r="5" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 5v3M16 18v3M8 13h3M21 13h3M11 8l2 2M21 18l-2-2M11 18l2-2M21 8l-2 2" strokeLinecap="round" />
      <path d="M8 25h16M11 28l-2-3M21 28l2-3" strokeLinecap="round" />
    </g>
  ),
  stream: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 10c4 0 4 4 8 4s4-4 8-4 4 4 8 4" fill="currentColor" fillOpacity="0.15" />
      <path d="M4 18c4 0 4 4 8 4s4-4 8-4 4 4 8 4" fill="currentColor" fillOpacity="0.15" />
    </g>
  ),
  queue: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="10" width="6" height="12" rx="1" fill="currentColor" fillOpacity="0.2" />
      <rect x="13" y="10" width="6" height="12" rx="1" fill="currentColor" fillOpacity="0.2" />
      <rect x="22" y="10" width="6" height="12" rx="1" fill="currentColor" fillOpacity="0.2" />
    </g>
  ),
  topic: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="16" r="4" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 16l8-6M16 16l8 6M16 16l-8-6M16 16l-8 6" />
    </g>
  ),

  // Jobs / scheduler / SDK
  bg_job: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="6" width="22" height="20" rx="2" fill="currentColor" fillOpacity="0.18" />
      <path d="M10 12h12M10 16h12M10 20h7" />
    </g>
  ),
  consumer: () => ICONS.bg_job(),
  scheduler: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="17" r="9" fill="currentColor" fillOpacity="0.18" />
      <path d="M16 11v6l4 3" strokeLinecap="round" />
      <path d="M9 6l-2 2M23 6l2 2" strokeLinecap="round" />
    </g>
  ),
  timer: () => ICONS.scheduler(),
  sdk: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 7l-6 9 6 9" />
      <path d="M21 7l6 9-6 9" />
      <path d="M18 6l-4 20" />
    </g>
  ),

  // Datastores
  postgres:  () => <Cylinder accent="pg" />,
  mysql:     () => <Cylinder accent="mysql" />,
  sqlserver: () => <Cylinder accent="mssql" />,
  database:  () => <Cylinder />,
  cache:     () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 9l11-5 11 5-11 5z" fill="currentColor" fillOpacity="0.2" />
      <path d="M5 9v8l11 5 11-5V9" />
      <path d="M5 17l11 5 11-5" />
    </g>
  ),
  redis: () => ICONS.cache(),
  inmemory: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="11" width="24" height="10" rx="1" fill="currentColor" fillOpacity="0.2" />
      <line x1="9" y1="11" x2="9" y2="21" />
      <line x1="14" y1="11" x2="14" y2="21" />
      <line x1="19" y1="11" x2="19" y2="21" />
      <line x1="24" y1="11" x2="24" y2="21" />
    </g>
  ),
  storage: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 9h20l-2 18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="currentColor" fillOpacity="0.2" />
      <path d="M5 9l3-4h16l3 4z" fill="currentColor" fillOpacity="0.3" />
      <circle cx="22" cy="24" r="2.5" fill="currentColor" stroke="none" />
    </g>
  ),
  search: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="14" cy="14" r="7" fill="currentColor" fillOpacity="0.18" />
      <line x1="19" y1="19" x2="27" y2="27" strokeLinecap="round" />
    </g>
  ),
  hdd: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7" width="26" height="18" rx="3" fill="currentColor" fillOpacity="0.18" />
      <circle cx="16" cy="16" r="6" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="24" cy="22" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  warehouse: () => ICONS.storage(),

  // Backend / compute
  function:  () => wrap(
    <g fill="currentColor">
      <path d="M20 4l-10 24h-4l10-24z" opacity="0.25" />
      <path d="M20 4l-10 24h-4l10-24z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </g>
  ),
  container: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="14" width="24" height="10" rx="1" fill="currentColor" fillOpacity="0.18" />
      <rect x="6.5" y="10" width="3.5" height="3.5" />
      <rect x="11" y="10" width="3.5" height="3.5" />
      <rect x="15.5" y="10" width="3.5" height="3.5" />
      <rect x="20" y="10" width="3.5" height="3.5" />
    </g>
  ),

  // Edge / security
  edge:         () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="16" r="11" fill="currentColor" fillOpacity="0.18" />
      <ellipse cx="16" cy="16" rx="5" ry="11" />
      <line x1="5" y1="16" x2="27" y2="16" />
    </g>
  ),
  loadbalancer: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="6" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="6" cy="24" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="16" cy="24" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="26" cy="24" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M16 9v4M16 13l-9 8M16 13l9 8M16 13v8" />
    </g>
  ),
  apigateway:   () => <ApiHex accent="gw" />,
  idp:          () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="currentColor" fillOpacity="0.2" />
      <path d="M11 16l4 4 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  secrets:      () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="14" width="20" height="14" rx="2" fill="currentColor" fillOpacity="0.2" />
      <path d="M10 14v-3a6 6 0 0 1 12 0v3" />
    </g>
  ),

  // Workflow / Temporal
  workflow:     () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="16" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="16" cy="8" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="24" cy="16" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="16" cy="24" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M11 16h10M16 11v10" strokeDasharray="2 2" />
    </g>
  ),
  statemachine: () => ICONS.workflow(),
  saga:         () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 22c4 0 4-12 8-12s4 12 8 12 4-12 8-12" fill="currentColor" fillOpacity="0.15" />
    </g>
  ),
  activity:     () => ICONS.bg_job(),
  signal:       () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="16" cy="22" r="2" fill="currentColor" />
      <path d="M11 18a7 7 0 0 1 10 0" />
      <path d="M7 14a13 13 0 0 1 18 0" />
    </g>
  ),
  eventbus:     () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="10" width="24" height="12" rx="2" fill="currentColor" fillOpacity="0.18" />
      <path d="M8 14v4M14 14v4M20 14v4M26 14v4" />
    </g>
  ),

  // Users / actors
  user:     () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="11" r="5" fill="currentColor" fillOpacity="0.2" />
      <path d="M5 28c1-6 6-9 11-9s10 3 11 9" fill="currentColor" fillOpacity="0.2" />
    </g>
  ),
  customer: () => ICONS.user(),
  admin:    () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="16" cy="10" r="4" fill="currentColor" fillOpacity="0.2" />
      <path d="M7 27c1-5 5-8 9-8s8 3 9 8" fill="currentColor" fillOpacity="0.2" />
      <path d="M22 5l1.5 2.5L26 8l-2 2 .5 3-2.5-1.5L19.5 13l.5-3-2-2 2.5-.5z" fill="currentColor" />
    </g>
  ),

  // Devices
  mobile:   () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="14" height="26" rx="3" fill="currentColor" fillOpacity="0.2" />
      <line x1="14" y1="25" x2="18" y2="25" strokeLinecap="round" />
    </g>
  ),
  phone:    () => ICONS.mobile(),
  ussd:     () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 4l-3 14h6z" fill="currentColor" fillOpacity="0.25" />
      <path d="M9 28h14M16 18v10" />
      <path d="M11 9c-1.5 1.5-1.5 4 0 5.5M21 9c1.5 1.5 1.5 4 0 5.5" strokeLinecap="round" />
      <path d="M7 6c-3 3-3 9 0 12M25 6c3 3 3 9 0 12" strokeLinecap="round" />
    </g>
  ),
  frontend: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="26" height="17" rx="2" fill="currentColor" fillOpacity="0.2" />
      <line x1="3" y1="10" x2="29" y2="10" />
      <circle cx="6" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.8" fill="currentColor" />
      <circle cx="11" cy="7.5" r="0.8" fill="currentColor" />
      <line x1="10" y1="27" x2="22" y2="27" strokeLinecap="round" strokeWidth="2" />
      <line x1="16" y1="22" x2="16" y2="27" strokeWidth="2" />
    </g>
  ),

  // Misc
  nifi: () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="10" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="23" cy="10" r="3" fill="currentColor" fillOpacity="0.2" />
      <circle cx="16" cy="22" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M9 13v3l7 6 7-6v-3" />
      <path d="M9 10h14" strokeDasharray="2 2" />
    </g>
  ),
  external:   () => <ApiHex accent="out" />,
  telemetry:  () => wrap(
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 24l6-8 5 4 6-10 7 12" fill="none" />
      <path d="M4 28h24" />
    </g>
  )
};

export function ComponentIcon({ type, color, size = 28 }) {
  const render = ICONS[type];
  if (!render) {
    // Fallback to a generic server box for unknown / custom types.
    return (
      <span style={{ display: 'inline-flex', width: size, height: size, color }}>
        <Server />
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, color }}>
      {render()}
    </span>
  );
}

export default ComponentIcon;
