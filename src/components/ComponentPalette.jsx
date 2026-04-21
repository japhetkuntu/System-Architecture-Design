import React, { useState } from 'react';
import { DEFAULT_TYPES } from '../hooks/useBuilder.js';

const SHAPES = [
  { v: 'rect', l: 'Rectangle' },
  { v: 'round', l: 'Rounded' },
  { v: 'stadium', l: 'Stadium' },
  { v: 'cyl', l: 'Cylinder' },
  { v: 'queue', l: 'Asymmetric' }
];

export default function ComponentPalette({ allTypes, customTypes, onAdd, onAddCustomType, onRemoveCustomType }) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [draft, setDraft] = useState({ label: '', icon: '🧩', color: '#475569', shape: 'rect' });

  const submit = () => {
    if (!draft.label.trim()) return;
    onAddCustomType(draft);
    setDraft({ label: '', icon: '🧩', color: '#475569', shape: 'rect' });
    setShowCustomForm(false);
  };

  const defaultKeys = Object.keys(DEFAULT_TYPES);
  const customKeys = Object.keys(customTypes || {});

  return (
    <section className="palette">
      <div className="palette-head">
        <h3 className="panel-title">Add a component</h3>
        <button
          type="button"
          className="link-btn"
          onClick={() => setShowCustomForm((v) => !v)}
        >
          {showCustomForm ? 'Cancel' : '+ Custom type'}
        </button>
      </div>
      <p className="panel-hint">Click any block to add it. You can rename and re-icon each one after.</p>

      {showCustomForm && (
        <div className="custom-type-form">
          <input
            type="text"
            placeholder="Type name (e.g. Lambda)"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            type="text"
            placeholder="Icon (emoji)"
            value={draft.icon}
            maxLength={4}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            className="emoji-input"
          />
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            title="Accent color"
          />
          <select
            value={draft.shape}
            onChange={(e) => setDraft({ ...draft, shape: e.target.value })}
          >
            {SHAPES.map((s) => (
              <option key={s.v} value={s.v}>{s.l}</option>
            ))}
          </select>
          <button type="button" className="primary-btn small" onClick={submit}>Save type</button>
        </div>
      )}

      <div className="palette-grid">
        {defaultKeys.map((key) => {
          const def = allTypes[key];
          return (
            <button
              key={key}
              type="button"
              className="palette-btn"
              style={{ borderTopColor: def.color }}
              onClick={() => onAdd(key)}
              title={`Add ${def.label}`}
            >
              <span className="palette-icon">{def.icon}</span>
              <span className="palette-label">{def.label}</span>
            </button>
          );
        })}
      </div>

      {customKeys.length > 0 && (
        <>
          <h4 className="palette-subhead">Your custom types</h4>
          <div className="palette-grid">
            {customKeys.map((key) => {
              const def = allTypes[key];
              return (
                <div key={key} className="palette-btn custom-wrap" style={{ borderTopColor: def.color }}>
                  <button
                    type="button"
                    className="palette-inner"
                    onClick={() => onAdd(key)}
                    title={`Add ${def.label}`}
                  >
                    <span className="palette-icon">{def.icon}</span>
                    <span className="palette-label">{def.label}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn tiny"
                    onClick={() => onRemoveCustomType(key)}
                    aria-label="Remove custom type"
                    title="Remove type"
                  >×</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
