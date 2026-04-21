// URL-hash sharing helpers.
// Packs an architecture JSON into a URL-safe base64 (with gzip when available),
// producing a shareable link. Safe round-trip: encode/decode are inverses.

function toUrlSafeBase64(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromUrlSafeBase64(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

// Produces a string like "v1g:<base64>" (gzip) or "v1p:<base64>" (plain).
export async function packShare(obj) {
  const json = JSON.stringify(obj);
  const gz = await gzip(json);
  if (gz) return `v1g.${toUrlSafeBase64(gz)}`;
  const te = new TextEncoder();
  return `v1p.${toUrlSafeBase64(te.encode(json))}`;
}

export async function unpackShare(token) {
  if (!token) return null;
  const [head, body] = token.split('.');
  if (!head || !body) throw new Error('Invalid share token');
  const bytes = fromUrlSafeBase64(body);
  let json;
  if (head === 'v1g') {
    json = await gunzip(bytes);
    if (!json) throw new Error('Gzip not supported in this browser');
  } else if (head === 'v1p') {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('Unknown share token version');
  }
  return JSON.parse(json);
}

export function readShareFromLocation() {
  if (typeof window === 'undefined') return null;
  // Support both ?share=... and #share=...
  const qs = new URLSearchParams(window.location.search);
  const q = qs.get('share');
  if (q) return q;
  const hash = window.location.hash || '';
  const match = hash.match(/share=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearShareInLocation() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  if (url.hash.startsWith('#share=')) url.hash = '';
  window.history.replaceState({}, '', url.toString());
}
