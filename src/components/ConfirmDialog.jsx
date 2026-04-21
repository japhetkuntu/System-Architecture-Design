import React from 'react';

export default function ConfirmDialog({
  open, title = 'Are you sure?', message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive = false,
  onConfirm, onCancel
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-sm" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
        </header>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="link-btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={destructive ? 'danger-btn' : 'primary-btn small'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
