import React, { useEffect, useState } from 'react';
import { packShare } from '../utils/share.js';

export default function ShareDialog({ open, onClose, getArchitecture, saveToCloud, cloudEnabled }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  // 'full' = open in editor · 'management' = open in stakeholder dashboard only
  const [audience, setAudience] = useState('full');
  // Source: 'inline' = self-contained encoded link · 'cloud' = saved cloud file id
  const [source, setSource] = useState('inline');
  const [cloudId, setCloudId] = useState('');
  const [token, setToken] = useState('');

  // Build the final URL applying the audience suffix and source.
  const buildUrl = (tok, cid, aud) => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const u = new URL(base);
    if (cid) u.searchParams.set('id', cid);
    if (aud === 'management') u.searchParams.set('view', 'management');
    return u.toString() + (tok && !cid ? `#share=${tok}` : '');
  };

  // Whenever the dialog opens, encode the architecture once.
  useEffect(() => {
    if (!open) return;
    setErr(''); setCopied(false); setSource('inline'); setCloudId(''); setToken('');
    (async () => {
      try {
        const t = await packShare(getArchitecture());
        setToken(t);
        const next = buildUrl(t, '', audience);
        setUrl(next); setSize(next.length);
      } catch (e) {
        setErr(e.message || 'Failed to build share link');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getArchitecture]);

  // Re-derive the URL when the user toggles audience / source.
  useEffect(() => {
    if (!open || err) return;
    const next = source === 'cloud' && cloudId
      ? buildUrl('', cloudId, audience)
      : buildUrl(token, '', audience);
    setUrl(next); setSize(next.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, source, cloudId, token]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  const saveCloud = async () => {
    if (!saveToCloud) return;
    setErr('');
    setSaving(true);
    try {
      const id = await saveToCloud();
      setCloudId(id);
      setSource('cloud');
    } catch (e) {
      setErr(e.message || 'Failed to save to cloud');
    } finally {
      setSaving(false);
    }
  };

  const warn = size > 2000 && source === 'inline';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" role="dialog" aria-label="Share link" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>🔗 Shareable link</h2>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Anyone with this link opens the architecture in their browser — no file needed.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          {err && <div className="banner banner-error"><span>⚠ {err}</span></div>}
          {!cloudEnabled && source === 'cloud' && (
            <div className="banner banner-warning">
              <span>⚠ Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your root .env.</span>
            </div>
          )}

          <fieldset className="share-audience">
            <legend>Who is this link for?</legend>
            <label className={`share-audience-opt ${audience === 'full' ? 'is-active' : ''}`}>
              <input type="radio" name="share-audience" value="full" checked={audience === 'full'} onChange={() => setAudience('full')} />
              <div>
                <strong>🛠 Engineering / full editor</strong>
                <span className="muted">Opens the complete Archivise workspace — diagram, components, simulate, diff, ADR.</span>
              </div>
            </label>
            <label className={`share-audience-opt ${audience === 'management' ? 'is-active' : ''}`}>
              <input type="radio" name="share-audience" value="management" checked={audience === 'management'} onChange={() => setAudience('management')} />
              <div>
                <strong>🎯 Management view only</strong>
                <span className="muted">Read-only stakeholder dashboard: journey, capabilities, risks, scenarios. No editor.</span>
              </div>
            </label>
          </fieldset>

          {!err && (
            <>
              <textarea
                readOnly
                value={url}
                className="share-url"
                aria-label="Shareable URL"
                onFocus={(e) => e.target.select()}
              />
              <p className="muted" style={{ fontSize: 12 }}>
                {source === 'cloud' ? 'Cloud link · ' : 'Inline link · '}
                {size.toLocaleString()} characters
                {warn && ' — some chat apps truncate very long URLs. Use “Save to cloud” for a short link.'}
              </p>
            </>
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onClose}>Close</button>
          <div className="modal-foot-actions">
            {saveToCloud && (
              <button type="button" className="secondary-btn small" onClick={saveCloud} disabled={saving || !cloudEnabled}>
                {saving ? 'Saving…' : source === 'cloud' ? '☁ Re-save to cloud' : '☁ Save to cloud'}
              </button>
            )}
            <button type="button" className="primary-btn small" onClick={copy} disabled={!url}>
              {copied ? '✓ Copied!' : '📋 Copy link'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
