import React, { useEffect, useState } from 'react';
import { packShare } from '../utils/share.js';

export default function ShareDialog({ open, onClose, getArchitecture, saveToCloud, cloudEnabled }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(''); setCopied(false);
    (async () => {
      try {
        const token = await packShare(getArchitecture());
        const base = `${window.location.origin}${window.location.pathname}`;
        const full = `${base}#share=${token}`;
        setUrl(full);
        setSize(full.length);
      } catch (e) {
        setErr(e.message || 'Failed to build share link');
      }
    })();
  }, [open, getArchitecture]);

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
      const base = `${window.location.origin}${window.location.pathname}`;
      const cloudUrl = `${base}?id=${encodeURIComponent(id)}`;
      setUrl(cloudUrl);
      setSize(cloudUrl.length);
    } catch (e) {
      setErr(e.message || 'Failed to save to cloud');
    } finally {
      setSaving(false);
    }
  };

  const warn = size > 2000;

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
          {!cloudEnabled && (
            <div className="banner banner-warning">
              <span>⚠ Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your root .env.</span>
            </div>
          )}
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
                Length: {size.toLocaleString()} characters
                {warn && ' — some chat apps truncate very long URLs. Prefer exporting JSON for large architectures.'}
              </p>
            </>
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onClose}>Close</button>
          <div className="modal-foot-actions">
            {saveToCloud && (
              <button type="button" className="secondary-btn small" onClick={saveCloud} disabled={saving || !cloudEnabled}>
                {saving ? 'Saving…' : 'Save to cloud'}
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
