import React, { useEffect, useState } from 'react';

export default function PromptDialog({
  open,
  title = 'Enter a value',
  message = '',
  defaultValue = '',
  placeholder = '',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  textarea = false,
  onConfirm,
  onCancel
}) {
  const [value, setValue] = useState(defaultValue || '');

  useEffect(() => {
    if (open) setValue(defaultValue || '');
  }, [open, defaultValue]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !textarea) {
      e.preventDefault();
      onConfirm?.(value);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
    if (textarea && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onConfirm?.(value);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
        </header>
        <div className="modal-body">
          {message.split('\n').map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
          {textarea ? (
            <textarea
              className="prompt-dialog-input"
              autoFocus
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <input
              className="prompt-dialog-input"
              autoFocus
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="primary-btn small" onClick={() => onConfirm?.(value)}>{submitLabel}</button>
        </footer>
      </div>
    </div>
  );
}
