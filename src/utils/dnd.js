// Tiny drag-and-drop helpers for reorderable lists using HTML5 DnD.
// Callers pass an index and a reorder callback. Works for any list row.

export function makeDragHandlers({ index, onReorder, type = 'row' }) {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/archivise-' + type, String(index));
      // Set a transparent drag image for cleaner visuals on some browsers.
      e.currentTarget.classList.add('drag-source');
    },
    onDragEnd: (e) => {
      e.currentTarget.classList.remove('drag-source');
      document.querySelectorAll('.drag-over-top, .drag-over-bottom')
        .forEach((el) => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    },
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes('text/archivise-' + type)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      e.currentTarget.classList.toggle('drag-over-top', before);
      e.currentTarget.classList.toggle('drag-over-bottom', !before);
    },
    onDragLeave: (e) => {
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
    },
    onDrop: (e) => {
      const data = e.dataTransfer.getData('text/archivise-' + type);
      e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
      if (!data) return;
      const from = parseInt(data, 10);
      if (Number.isNaN(from) || from === index) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const to = before ? (from < index ? index - 1 : index) : (from < index ? index : index + 1);
      if (to === from) return;
      e.preventDefault();
      onReorder(from, to);
    }
  };
}
