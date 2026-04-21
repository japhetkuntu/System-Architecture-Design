import { useEffect } from 'react';

// Hook for global keyboard shortcuts.
// shortcuts: map of 'mod+z' style keys -> handler(event).
// Modifiers: mod (⌘ on mac, Ctrl otherwise), shift, alt.
// Bare keys: digits, letters, '/', 'Enter', 'Escape', etc.
export function useKeyboardShortcuts(shortcuts, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (e) => {
      // Don't intercept when typing in inputs/textareas/selects, except for Escape and Cmd/Ctrl shortcuts.
      const tag = (e.target?.tagName || '').toLowerCase();
      const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;

      if (isEditing && !mod && e.key !== 'Escape') return;

      const parts = [];
      if (mod) parts.push('mod');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      parts.push(key);
      const combo = parts.join('+');

      const fn = shortcuts[combo];
      if (typeof fn === 'function') {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, enabled]);
}
