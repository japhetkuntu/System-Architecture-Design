# Archivise

> **Click blocks. Wire them up. Ship a diagram, a simulation, a diff, and an ADR — instantly.**

Archivise is a form-based architecture diagramming tool that runs entirely in your browser. No AI, no API keys, no backend — just a fast, opinionated UI on top of [Mermaid](https://mermaid.js.org/).

It is built for engineers who want to sketch a system, compare it to an earlier version, walk through a request flow, and hand their team a real Architecture Decision Record — all without leaving a single tab.

---

## ✨ Highlights

- **Form-first builder** — pick component types from a palette (users, APIs, databases, queues, caches, search, external systems, or your own), name them, give them notes, icons, and colors. Drag rows to reorder. Multi-select and bulk-delete / bulk-recolor.
- **Smart connections** — a chip-arrow-chip UI with live preview, auto-suggested relationships (e.g. *API → Database* defaults to *writes to*), direction swap, duplicate, drag-reorder, per-edge 📝 annotations, and a parallel-edge warning.
- **Real Mermaid output** — styled `flowchart LR` / `TB` with optional subgraphs per domain. Download as **SVG**, **PNG**, raw **Mermaid code**, or the architecture as **JSON**.
- **Simulation mode** — step through the flow edge-by-edge; the active path lights up in the diagram and a narrative explains what's happening.
- **Baseline + diff** — capture a snapshot of "what exists today", keep editing, and see a color-coded diff diagram plus a categorized change list (added / removed / modified, field-level).
- **ADR generator** — polished Markdown Architecture Decision Record with context, decision, auto-inferred consequences, alternatives considered, related ADRs, reviewers, and before/after/diff Mermaid diagrams rendered inline. Export as `.md`, **self-contained HTML bundle**, or **Print / Save as PDF**.
- **Undo / redo** — full history with sane coalescing, so ⌘Z works even across keystrokes.
- **Architecture lints** — inline warnings for orphan nodes, duplicate names, empty labels, short cycles, and dangling connections.
- **Multi-doc workspace** — keep a library of architectures in your browser; name, rename, duplicate, delete, and switch between them.
- **Shareable links** — one click produces a URL that restores the exact architecture for anyone who opens it (gzip-compressed into the hash, no server).
- **Keyboard shortcuts** — ⌘Z / ⌘⇧Z (undo/redo), ⌘E (ADR), ⌘K (workspace), ⌘/ (share), ⌘S (save), `1` / `2` / `3` (build / simulate / diff), `Esc` (close).
- **Accessible** — keyboard reachable, focus-visible styles, `aria-live` toasts, `prefers-reduced-motion` honored.
- **Auto-saved** to `localStorage`, including your baseline. Import/export as JSON. Load a worked example in one click.
- **Zero backend** — the entire app is static and can be hosted on GitHub Pages, Netlify, Vercel, or opened from `dist/` directly.

---

## 🚀 Quick start

```bash
git clone https://github.com/<you>/archivise.git
cd archivise
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

To produce a static bundle:

```bash
npm run build       # emits dist/
npm run preview     # serve dist/ locally
```

> **Requirements:** Node 18+ and npm 9+.

---

## 🧭 A two-minute tour

1. **Click the ✨ Sample button** in the header to load a worked "Customer Onboarding" architecture.
2. In the right-hand panel, switch between **Diagram**, **Diff**, and **Code** tabs — the Mermaid updates live.
3. Press **🔍 Diff → Capture as baseline**. Now rename a component or delete a connection; the diff badge in the header increments and the Diff tab shows a color-coded overlay.
4. Press **▶ Simulate** to walk the request flow step by step.
5. Press **📝 Generate ADR**, fill in a number, status, and author, toggle **👁 Rendered / `</>` Raw Markdown** in the preview, and download as `README.md`.

That's the whole app.

---

## 🏗️ How it's built

```
src/
├── App.jsx                  # Top-level layout, modes, modals, toasts
├── main.jsx                 # React entry
├── hooks/
│   └── useBuilder.js        # All state, Mermaid generation, diff, baseline, persistence
├── components/
│   ├── ComponentPalette.jsx # Add components from preset + custom types
│   ├── ComponentList.jsx    # Edit name/icon/color/notes
│   ├── ConnectionList.jsx   # Chip-arrow-chip connection editor
│   ├── OutputTabs.jsx       # Diagram / Diff / Code tabs
│   ├── DiagramView.jsx      # Mermaid renderer + SVG/PNG download + sim highlight
│   ├── MermaidCode.jsx      # Raw code view + copy
│   ├── SimulationPanel.jsx  # Step controls and narrative
│   ├── DiffPanel.jsx        # Textual diff, baseline actions
│   ├── AdrDialog.jsx        # ADR generator with live rendered/raw preview
│   ├── ConfirmDialog.jsx    # Reusable destructive-action modal
│   └── WelcomeCard.jsx      # First-run onboarding
├── utils/
│   └── adr.js               # Pure Markdown ADR generator
└── styles/
    └── app.css              # Single hand-authored stylesheet
```

### Design principles

- **One source of truth.** All app state lives in the `useBuilder` hook. Components are thin and pass props down.
- **Pure functions where possible.** `mergeEdges`, `buildMermaid`, `computeDiff`, `buildDiffMermaid`, and `generateAdrMarkdown` are all pure and side-effect-free, which makes them trivial to test.
- **No hidden magic.** State is serialized to `localStorage` under three explicit keys: `archivise:state:v1`, `archivise:baseline:v1`, `archivise:welcome-dismissed:v1`.
- **No framework for what hand-written CSS does well.** Single `app.css`, custom properties for theming, no Tailwind / styled-components.
- **No AI.** Suggestions (like default relationship kinds) are small lookup tables, not models.

### Data model

```ts
type Component = {
  id: string;           // "c1", "c2", ...
  type: string;         // preset key ("api", "database"...) or "custom_*"
  name: string;
  notes?: string;
  icon?: string;        // overrides type default
  color?: string;       // overrides type default
};

type Connection = {
  id: string;
  fromId: string;
  toId: string;
  kind: 'calls' | 'publishes' | 'consumes' | 'reads' | 'writes'
      | 'integrates' | 'uses' | 'sends' | 'returns' | 'notifies';
  label?: string;       // free-text override
};

type Architecture = {
  version: 1;
  title: string;
  components: Component[];
  connections: Connection[];
  customTypes: Record<string, CustomTypeDef>;
  exportedAt: string;   // ISO
};
```

The export format is versioned — future breaking changes will bump `version` and a migration will be added in `importJson`.

---

## 🧪 Testing

Tests use [Vitest](https://vitest.dev/) with the jsdom environment. The pure logic — edge merging, diagram building, diffing, lints, ADR generation — is covered end-to-end.

```bash
npm test            # watch mode
npm run test:run    # one-shot
```

---

## 🗺️ Roadmap

See [ROADMAP.md](./ROADMAP.md) for the growing list of planned features. The short list:

- Undo / redo
- Drag-to-reorder connections and components
- Bulk operations on components
- Mermaid rendering inside the ADR preview
- Shareable URLs (state in hash)
- Keyboard shortcuts
- Layout controls (LR ↔ TB, subgraphs)
- Validation & lints (orphans, cycles, duplicate names)
- Multi-document workspace
- Richer ADR fields (alternatives considered, related ADRs, sign-off)
- PDF / HTML bundle export
- Automated tests

Any of these is a great first PR.

---

## 🤝 Contributing

Archivise welcomes contributions — see [CONTRIBUTING.md](./CONTRIBUTING.md) for the short version. The TL;DR:

1. Open an issue first for anything larger than a bugfix.
2. Keep PRs focused. One topic per PR.
3. `npm run build` must pass.
4. No new runtime dependencies without a very good reason. This project is deliberately small.

---

## 📜 License

[MIT](./LICENSE) — do anything you like, just keep the notice.

---

## 🙏 Acknowledgements

- [Mermaid](https://mermaid.js.org/) does all of the diagramming heavy lifting.
- [Vite](https://vitejs.dev/) and [React](https://react.dev/) run the UI.
- Component type icons are stock emoji, rendered by your OS.
