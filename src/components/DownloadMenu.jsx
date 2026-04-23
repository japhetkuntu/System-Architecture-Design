import React, { useEffect, useRef, useState } from 'react';

// Tiny accessible dropdown menu used by toolbars to expose multiple
// download/export options under a single button. Closes on outside click
// and Escape.
export default function DownloadMenu({ label, actions, disabled, className = 'secondary-btn' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="download-menu" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((v) => !v)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
        {label} ▾
      </button>
      {open && (
        <div className="download-menu-popover" role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              className="download-menu-item"
              onClick={() => { setOpen(false); a.onClick(); }}
            >{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
