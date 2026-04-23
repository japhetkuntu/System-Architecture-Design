import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath
} from 'reactflow';
import 'reactflow/dist/style.css';
import ComponentIcon from '../utils/componentIcons.jsx';
import PromptDialog from './PromptDialog.jsx';

/**
 * Interactive, draw.io-style canvas backed by React Flow.
 *
 * Inputs:
 *   - components: each may carry an optional { position: { x, y } } that we
 *     persist when the user drags. If absent, we auto-grid them so first
 *     load looks tidy.
 *   - connections: rendered as edges; users can also draw new edges by
 *     dragging from a node's handle to another node.
 *
 * Interactions:
 *   - Drag a tile from ComponentPalette (sets dataTransfer
 *     'application/x-archivise-type') and drop it anywhere → addComponent
 *     with the drop position in flow coordinates.
 *   - Drag from the right-side dot (source handle) to another node's left
 *     dot (target handle) → addConnection({ fromId, toId, kind: 'calls' }).
 *   - Click a node / edge → existing inspector panels via onSelectComponent
 *     / onSelectConnection.
 *   - Drag a node → live position updates (setComponentPosition, no undo
 *     entry per pixel); on dragstop we keep the final position.
 *   - Delete key on a selected node/edge → remove (undo-able).
 */
export default function CanvasView(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

const NODE_W = 180;
const NODE_H = 64;
const GRID_GAP_X = 220;
const GRID_GAP_Y = 110;

function autoPosition(index) {
  const cols = 4;
  return { x: 60 + (index % cols) * GRID_GAP_X, y: 60 + Math.floor(index / cols) * GRID_GAP_Y };
}

function CanvasInner({
  components,
  connections,
  allTypes,
  highlightStep,             // { fromId, toId, edgeIndex, connId } | null
  layoutDir,                 // 'LR' | 'TB' — watched so canvas re-arranges on change
  useSubgraphs,              // boolean — watched so canvas regroups on toggle
  onAddComponent,            // (type, { position, name? }) => id
  onUpdateComponent,         // (id, patch) => void  — used for inline label/notes edit
  onSetComponentPosition,    // (id, { x, y }) => void
  onAddConnection,           // ({ fromId, toId, kind, label }) => void
  onUpdateConnection,        // (id, patch) => void  — used for reconnect + label edit
  onReorderConnection,       // (fromIdx, toIdx) => void  — renumber a step
  onRemoveComponent,         // (id) => void
  onRemoveConnection,        // (id) => void
  onSelectComponent,         // (id) => void
  onSelectConnection,        // (id) => void
  selectedComponentIds,      // Set<string> | null
  onAutoLayout,              // () => void  — toolbar action
  onResetPositions           // () => void  — toolbar action
}) {
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [prompt, setPrompt] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [reassignConfig, setReassignConfig] = useState(null);

  const nodeTypes = useMemo(() => ({ component: ComponentNode }), []);
  const edgeTypes = useMemo(() => ({ multilabel: MultiLabelEdge }), []);

  // Editor for one specific connection-step badge. Accepts a "step: label"
  // string — lets the user retype both the simulation step number and the
  // label in one go. Bare numbers update only the step; bare text updates
  // only the label.
  const editStep = useCallback((it) => {
    const def = `${it.step}: ${it.label || ''}`;
    setPrompt({
      title: 'Edit connector',
      message: 'Enter a new step number and label for this connector.\nUse "<step>: <label>" format. Leave the label blank to fall back to the relationship type.',
      defaultValue: def,
      placeholder: '1: calls',
      submitLabel: 'Save',
      cancelLabel: 'Cancel',
      onConfirm: (next) => {
        const value = next?.trim();
        if (value == null) return;
        const m = value.match(/^\s*(\d+)\s*[:.·]\s*(.*)$/);
        let newLabel;
        let newStep = null;
        if (m) {
          newStep = parseInt(m[1], 10);
          newLabel = m[2].trim();
        } else {
          newLabel = value;
        }
        if (newLabel !== (it.label || '')) {
          onUpdateConnection?.(it.connId, { label: newLabel });
        }
        if (newStep != null && onReorderConnection) {
          const fromIdx = it.step - 1;
          const toIdx = Math.max(0, Math.min(connections.length - 1, newStep - 1));
          if (fromIdx !== toIdx) onReorderConnection(fromIdx, toIdx);
        }
        setPrompt(null);
      },
      onCancel: () => setPrompt(null)
    });
  }, [onUpdateConnection, onReorderConnection, connections.length]);

  const removeStep = useCallback((connId) => {
    onRemoveConnection?.(connId);
  }, [onRemoveConnection]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ type: 'node', id: node.id, x: event.clientX, y: event.clientY, label: node.data.label });
  }, []);
  const openEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ type: 'edge', id: edge.id, x: event.clientX, y: event.clientY, data: edge.data });
  }, []);
  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    closeContextMenu();
  }, [closeContextMenu]);

  const deleteNode = useCallback((id) => {
    closeContextMenu();
    onRemoveComponent?.(id);
  }, [closeContextMenu, onRemoveComponent]);

  const deleteEdgeGroup = useCallback((edgeData) => {
    closeContextMenu();
    if (!edgeData?.items?.length) return;
    edgeData.items.forEach((item) => onRemoveConnection?.(item.connId));
  }, [closeContextMenu, onRemoveConnection]);

  const startReassignEdge = useCallback((field, edgeData) => {
    closeContextMenu();
    if (!edgeData?.items?.length) return;
    const connId = edgeData.items[0].connId;
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    setReassignConfig({ connId, field, selectedId: conn[field] });
  }, [closeContextMenu, connections]);

  const reassignCandidates = useMemo(() => {
    if (!reassignConfig) return [];
    const conn = connections.find((c) => c.id === reassignConfig.connId);
    if (!conn) return [];
    const otherField = reassignConfig.field === 'fromId' ? 'toId' : 'fromId';
    return components.filter((c) => c.id !== conn[otherField]);
  }, [components, connections, reassignConfig]);

  const submitReassign = useCallback(() => {
    if (!reassignConfig?.selectedId) return;
    const conn = connections.find((c) => c.id === reassignConfig.connId);
    if (!conn) return;
    const otherField = reassignConfig.field === 'fromId' ? 'toId' : 'fromId';
    if (conn[otherField] === reassignConfig.selectedId) return;
    onUpdateConnection?.(reassignConfig.connId, { [reassignConfig.field]: reassignConfig.selectedId });
    setReassignConfig(null);
  }, [connections, onUpdateConnection, reassignConfig]);

  const nodes = useMemo(() => {
    const activeFrom = highlightStep?.fromId;
    const activeTo = highlightStep?.toId;
    return components.map((c, i) => {
      const def = allTypes[c.type] || { icon: '🧩', color: '#475569', label: c.type };
      return {
        id: c.id,
        type: 'component',
        position: c.position || autoPosition(i),
        data: {
          label: c.name,
          notes: c.notes || '',
          accent: c.color || def.color,
          typeLabel: def.label,
          typeKey: c.type,
          onRename: (name) => onUpdateComponent?.(c.id, { name }),
          onEditNotes: (notes) => onUpdateComponent?.(c.id, { notes }),
          activeRole: c.id === activeFrom ? 'source' : c.id === activeTo ? 'target' : null
        },
        selected: selectedComponentIds?.has(c.id) || false,
        width: NODE_W,
        height: NODE_H
      };
    });
  }, [components, allTypes, selectedComponentIds, onUpdateComponent, highlightStep]);

  // Group raw connections by (fromId,toId) so multiple connections sharing
  // the same node-pair render as a single visual edge with stacked label
  // badges — dramatically cuts down on overlapping lines and lets each
  // label keep its own simulation step number.
  const edgeItemsById = useRef(new Map());
  const edges = useMemo(() => {
    const groups = new Map();
    const order = [];
    connections.forEach((e, idx) => {
      const key = `${e.fromId}=>${e.toId}`;
      if (!groups.has(key)) {
        groups.set(key, { fromId: e.fromId, toId: e.toId, items: [] });
        order.push(key);
      }
      groups.get(key).items.push({
        connId: e.id,
        step: idx + 1,           // 1-based for the user
        label: e.label || '',
        kind: e.kind,
        color: edgeColor(e.kind),
        animated: ANIMATED_KINDS.has(e.kind),
        active: highlightStep?.connId === e.id
      });
    });
    // Refresh the lookup so `onReconnect` / `onEdgesChange` can map a
    // grouped edge id back to the raw connections it represents.
    const lookup = new Map();
    const built = order.map((key) => {
      const g = groups.get(key);
      const anyActive = g.items.some((i) => i.active);
      const dominantColor = (g.items.find((i) => i.active) || g.items[0]).color;
      const edgeId = `pair_${key}`;
      lookup.set(edgeId, g.items);
      return {
        id: edgeId,
        source: g.fromId,
        target: g.toId,
        type: 'multilabel',
        animated: anyActive || g.items.some((i) => i.animated),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: dominantColor,
          width: 18,
          height: 18
        },
        style: {
          stroke: dominantColor,
          strokeWidth: anyActive ? 3 : 1.6,
          opacity: highlightStep && !anyActive ? 0.35 : 1
        },
        data: {
          items: g.items,
          activeConnId: highlightStep?.connId || null,
          dimmed: highlightStep && !anyActive,
          onEditItem: editStep,
          onRemoveItem: removeStep
        }
      };
    });
    edgeItemsById.current = lookup;
    return built;
  }, [connections, highlightStep, editStep, removeStep]);

  const onNodesChange = useCallback((changes) => {
    changes.forEach((ch) => {
      if (ch.type === 'position' && ch.position && !ch.dragging) {
        // Final drop position — persist (still no undo entry per move).
        onSetComponentPosition(ch.id, ch.position);
      } else if (ch.type === 'position' && ch.position && ch.dragging) {
        // Live drag — keep state in sync so the node doesn't snap back.
        onSetComponentPosition(ch.id, ch.position);
      } else if (ch.type === 'remove') {
        onRemoveComponent(ch.id);
      }
    });
  }, [onSetComponentPosition, onRemoveComponent]);

  const onEdgesChange = useCallback((changes) => {
    changes.forEach((ch) => {
      if (ch.type === 'remove') {
        // ch.id is a *grouped* edge id (`pair_<from>=><to>`). Resolve it
        // back to the underlying raw connections and delete each.
        const items = edgeItemsById.current.get(ch.id);
        if (items?.length) items.forEach((it) => onRemoveConnection(it.connId));
      }
    });
  }, [onRemoveConnection]);

  const onConnect = useCallback((conn) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    onAddConnection({
      fromId: conn.source,
      toId: conn.target,
      kind: 'calls',
      label: ''
    });
  }, [onAddConnection]);

  // Edge reconnection — lets the user drag either end of an existing edge
  // to a different node. Because edges are visually grouped by node-pair,
  // `oldEdge.id` is the group id (`pair_<from>=><to>`), so we resolve it
  // back to the raw underlying connections and patch each of them.
  const reconnectDone = useRef(true);
  const onReconnectStart = useCallback(() => { reconnectDone.current = false; }, []);
  const onReconnect = useCallback((oldEdge, newConn) => {
    reconnectDone.current = true;
    if (!newConn.source || !newConn.target) return;
    if (!onUpdateConnection) return;
    const items = edgeItemsById.current.get(oldEdge.id) || [];
    if (!items.length) return;
    // Determine which endpoint actually changed so we only patch that field
    // (preserves the other endpoint exactly as the user had it).
    const sourceChanged = newConn.source !== oldEdge.source;
    const targetChanged = newConn.target !== oldEdge.target;
    items.forEach((it) => {
      const patch = {};
      if (sourceChanged) patch.fromId = newConn.source;
      if (targetChanged) patch.toId = newConn.target;
      // If neither flag is set (very unusual), reassign both to be safe.
      if (!sourceChanged && !targetChanged) {
        patch.fromId = newConn.source;
        patch.toId = newConn.target;
      }
      onUpdateConnection(it.connId, patch);
    });
  }, [onUpdateConnection]);
  const onReconnectEnd = useCallback((_evt, edge) => {
    // If the user dropped the edge end into empty space, treat that as a
    // delete of every raw connection in the group.
    if (!reconnectDone.current) {
      const items = edgeItemsById.current.get(edge.id) || [];
      items.forEach((it) => onRemoveConnection(it.connId));
    }
    reconnectDone.current = true;
  }, [onRemoveConnection]);

  // Auto-layout any node that doesn't have a saved position yet (e.g. just
  // dropped from the palette). This makes the Mermaid-style dagre layout
  // the default — the user only sees a manual grid if they drag a node.
  useEffect(() => {
    if (components.length < 2) return;
    const missing = components.filter((c) => !c.position).length;
    if (missing > 0 && onAutoLayout) {
      onAutoLayout();
    }
    // We intentionally only watch component count + identity so we don't
    // re-trigger on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components.length, components.map((c) => c.id).join('|')]);

  // Re-run the layout when the user toggles direction (LR/TB) or domain
  // grouping. Without this the LayoutControls buttons would only affect the
  // exported Mermaid code, not the canvas the user is staring at.
  const layoutSettingsKey = `${layoutDir || 'LR'}|${useSubgraphs ? '1' : '0'}`;
  const initialLayoutKey = useRef(layoutSettingsKey);
  useEffect(() => {
    if (layoutSettingsKey === initialLayoutKey.current) return;
    initialLayoutKey.current = layoutSettingsKey;
    if (components.length >= 2 && onAutoLayout) onAutoLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSettingsKey]);

  const onDragOver = useCallback((event) => {
    if (!event.dataTransfer.types.includes('application/x-archivise-type')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((event) => {
    const type = event.dataTransfer.getData('application/x-archivise-type');
    if (!type || !allTypes[type]) return;
    event.preventDefault();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // Center the node around the drop point.
    onAddComponent(type, { position: { x: position.x - NODE_W / 2, y: position.y - NODE_H / 2 } });
  }, [allTypes, screenToFlowPosition, onAddComponent]);

  const onNodeClick = useCallback((_evt, node) => {
    onSelectComponent?.(node.id);
  }, [onSelectComponent]);

  const onEdgeClick = useCallback((_evt, edge) => {
    onSelectConnection?.(edge.id);
  }, [onSelectConnection]);

  // Double-click on the edge body (not on a badge) is a no-op now — each
  // label badge has its own dedicated dblclick handler that knows which
  // raw connection it represents.
  const onEdgeDoubleClick = useCallback(() => {}, []);

  // Empty-state hint
  const showEmptyHint = components.length === 0;

  return (
    <div ref={wrapperRef} className="canvas-wrap" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="canvas-toolbar">
        <button type="button" className="primary-btn small"
          onClick={onAutoLayout}
          disabled={components.length === 0}
          title="Auto-arrange all nodes left-to-right by their dependencies">✨ Auto-arrange</button>
        <button type="button" className="secondary-btn"
          onClick={onResetPositions}
          disabled={components.length === 0}
          title="Forget custom positions and re-grid">↻ Reset layout</button>
        <span className="canvas-toolbar-hint muted">Drag tiles → drop here. Drag from a node's edge to connect. Drag a link's endpoint onto another node to reassign it. Double-click a node name or edge label to rename.</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={onReconnectEnd}
        onNodeClick={onNodeClick}
        onNodeContextMenu={openNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={openEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onEdgeDoubleClick={onEdgeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'multilabel', reconnectable: true }}
        edgesFocusable
        elementsSelectable
        deleteKeyCode={['Backspace', 'Delete']}
        connectionRadius={28}
      >
        <Background gap={16} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {showEmptyHint && (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <h3>Drop components here</h3>
            <p>Drag any tile from the palette on the left onto this canvas, then drag from a node's right edge to another node to connect them.</p>
          </div>
        </div>
      )}
      {contextMenu && (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.type === 'node' && (
            <>
              <button type="button" onClick={() => deleteNode(contextMenu.id)}>Delete component</button>
              <button type="button" disabled title="Drag the node to reposition it">Move component</button>
            </>
          )}
          {contextMenu.type === 'edge' && (
            <>
              <button type="button" onClick={() => deleteEdgeGroup(contextMenu.data)}>Delete link group</button>
              <button type="button" onClick={() => startReassignEdge('fromId', contextMenu.data)}>Reassign source…</button>
              <button type="button" onClick={() => startReassignEdge('toId', contextMenu.data)}>Reassign target…</button>
              <button type="button" disabled title="Tip: just grab the link's endpoint and drop it on another node">Tip: drag an endpoint to reassign</button>
            </>
          )}
        </div>
      )}
      {reassignConfig && (
        <div className="modal-backdrop" onClick={() => setReassignConfig(null)}>
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Reassign connection" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>Reassign connection</h2>
            </header>
            <div className="modal-body">
              <p>Select a new {reassignConfig.field === 'fromId' ? 'source' : 'target'} component for this connection.</p>
              <select
                autoFocus
                value={reassignConfig.selectedId}
                onChange={(e) => setReassignConfig((prev) => prev ? { ...prev, selectedId: e.target.value } : prev)}
                style={{ width: '100%', minWidth: 180, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                {reassignCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.id}</option>
                ))}
              </select>
            </div>
            <footer className="modal-foot">
              <button type="button" className="link-btn" onClick={() => setReassignConfig(null)}>Cancel</button>
              <button type="button" className="primary-btn small" onClick={submitReassign}>Save</button>
            </footer>
          </div>
        </div>
      )}
      <PromptDialog
        open={!!prompt}
        title={prompt?.title}
        message={prompt?.message}
        defaultValue={prompt?.defaultValue}
        placeholder={prompt?.placeholder}
        submitLabel={prompt?.submitLabel}
        cancelLabel={prompt?.cancelLabel}
        textarea={prompt?.textarea}
        onConfirm={prompt?.onConfirm}
        onCancel={prompt?.onCancel}
      />
    </div>
  );
}

const ANIMATED_KINDS = new Set(['publishes', 'emits', 'notifies', 'fans-out', 'consumes', 'triggers', 'orchestrates']);

function edgeColor(kind) {
  if (!kind) return '#64748b';
  if (kind === 'compensates' || kind === 'times-out-to') return '#dc2626';
  if (kind === 'orchestrates' || kind === 'triggers' || kind === 'awaits') return '#0aa06e';
  if (kind === 'publishes' || kind === 'emits' || kind === 'notifies' || kind === 'fans-out' || kind === 'consumes') return '#7c3aed';
  return '#475569';
}

function ComponentNode({ data, selected }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(data.label);
  const [editingNote, setEditingNote] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState(data.notes || '');
  React.useEffect(() => { if (!editing) setDraft(data.label); }, [data.label, editing]);
  React.useEffect(() => { if (!editingNote) setNoteDraft(data.notes || ''); }, [data.notes, editingNote]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== data.label) data.onRename?.(next);
    else setDraft(data.label);
  };

  const commitNote = () => {
    setEditingNote(false);
    const next = noteDraft.trim();
    if (next !== (data.notes || '')) data.onEditNotes?.(next);
  };

  const roleClass = data.activeRole === 'source'
    ? 'is-active-source'
    : data.activeRole === 'target'
      ? 'is-active-target'
      : '';

  return (
    <div className={`rf-node ${selected ? 'is-selected' : ''} ${roleClass}`}
      style={{ borderTopColor: data.accent, width: NODE_W }}
      title={data.typeLabel}
    >
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <div className="rf-node-row">
        <span className="rf-node-glyph" style={{ color: data.accent }}>
          <ComponentIcon type={data.typeKey} color={data.accent} size={28} />
        </span>
        <div className="rf-node-text">
          {editing ? (
            <input
              className="rf-node-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                else if (e.key === 'Escape') { setDraft(data.label); setEditing(false); }
                e.stopPropagation();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <strong
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              title="Double-click to rename"
            >{data.label}</strong>
          )}
          <small>{data.typeLabel}</small>
          {editingNote ? (
            <textarea
              className="rf-node-note-input nodrag"
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={commitNote}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitNote(); }
                else if (e.key === 'Escape') { setNoteDraft(data.notes || ''); setEditingNote(false); }
                e.stopPropagation();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Add a note… (⌘/Ctrl + Enter to save)"
            />
          ) : data.notes ? (
            <span className="rf-node-note"
              title="Double-click to edit note"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingNote(true); }}
            >{data.notes}</span>
          ) : (
            <span className="rf-node-note placeholder"
              title="Double-click to add a note"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingNote(true); }}
            >+ add note</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  );
}

// Custom edge: one path between a node pair, with N stacked label badges.
// Each badge represents a single raw connection and shows its simulation
// step number; double-click a badge to edit "step: label".
function MultiLabelEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, markerEnd, style
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    borderRadius: 16
  });
  const items = data?.items || [];
  const activeConnId = data?.activeConnId;
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd}
        style={style}
        className={data?.dimmed ? 'rf-edge-dimmed' : ''}
      />
      <EdgeLabelRenderer>
        <div
          className="rf-edge-badges nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all'
          }}
        >
          {items.map((it) => {
            const isActive = activeConnId === it.connId;
            return (
              <button
                key={it.connId}
                type="button"
                className={`rf-edge-badge ${isActive ? 'active' : ''}`}
                style={{ borderColor: it.color, color: it.color }}
                onDoubleClick={(e) => { e.stopPropagation(); data.onEditItem?.(it); }}
                onClick={(e) => e.stopPropagation()}
                title={`Step ${it.step} · ${it.label || it.kind}\nDouble-click to edit step number and label.`}
              >
                <span className="rf-edge-step" style={{ background: it.color }}>{it.step}</span>
                <span className="rf-edge-label">{it.label || it.kind}</span>
              </button>
            );
          })}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
