# Roadmap

Ideas and planned features for Archivise. Items are roughly ordered by expected user value, not difficulty. If you want to help, pick one, open an issue to claim it, then send a PR. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Core UX

- [ ] **Undo / redo** — a small history ring buffer in `useBuilder` (e.g. last 50 snapshots); `⌘Z` / `⌘⇧Z` wired up.
- [ ] **Drag-to-reorder** connections and components. Currently only ↑ ↓ buttons. Native HTML5 drag and drop is enough.
- [ ] **Bulk operations** — multi-select components with `shift+click`, then delete, recolor, or move into a custom group.
- [ ] **Keyboard shortcuts** — `1/2/3` for Build/Simulate/Diff, `⌘S` to force a save-toast, `⌘/` to focus the connection filter, `⌘K` for a command palette.
- [ ] **Accessibility audit** — screen-reader pass, focus order, `aria-live` for toasts, reduced-motion variant for the simulation highlight.

## Diagramming

- [ ] **Layout controls** — toggle `LR` ↔ `TB`; let users pin components into subgraphs beyond the automatic group-based ones.
- [ ] **Comments / annotations** on connections that surface as Mermaid tooltips and in the ADR.
- [ ] **Per-component shape override** (the data model already allows it; UI doesn't expose it yet).
- [ ] **Validation & lints** — orphan components, cycles, duplicate names, connections whose endpoints no longer exist.

## ADR

- [ ] **Render Mermaid blocks inside the ADR preview** using the existing `mermaid` dependency.
- [ ] **Richer fields** — *Alternatives considered*, *Related ADRs*, *Reviewer sign-off*. The structure in `utils/adr.js` is ready; only the form and the renderer need extending.
- [ ] **Export to PDF** or a standalone HTML bundle with the rendered Mermaid diagrams inlined as SVG, so ADRs can be attached to tickets and read offline.

## Sharing & persistence

- [ ] **Shareable URL** — gzip + base64 the architecture JSON into the URL hash; loading that URL restores the architecture without needing a file.
- [ ] **Multi-document workspace** — a sidebar of saved architectures with rename / duplicate / delete.
- [ ] **Import from common formats** — C4 DSL, PlantUML, or a subset of Mermaid flowcharts.

## Engineering

- [ ] **Automated tests** — Vitest + a handful of pure-function tests around `mergeEdges`, `buildMermaid`, `computeDiff`, and `generateAdrMarkdown`.
- [ ] **ESLint + Prettier** config with a minimal shared style.
- [ ] **GitHub Actions CI** — run `npm ci && npm run build` on every PR; deploy `dist/` to GitHub Pages on `main`.
- [ ] **Changelog** — adopt `CHANGELOG.md` once releases start.

## Non-goals

On purpose, Archivise will not:

- Add a backend, authentication, or account system.
- Make network calls at runtime.
- Bundle an AI model or an API-key-driven feature.
- Grow into a general-purpose drawing tool. It stays opinionated about component-and-connection systems.
