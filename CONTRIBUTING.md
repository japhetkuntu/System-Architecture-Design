# Contributing to Archivise

Thanks for your interest! This project stays small and focused on purpose, so a quick read of these guidelines will make your PR land faster.

## Ground rules

- **Open an issue before large work.** Anything beyond a bug fix or a small polish is easier to land when we've agreed on the shape first. A one-paragraph proposal is plenty.
- **One topic per PR.** A PR that refactors CSS *and* adds a feature *and* tweaks the ADR is three PRs that would each review in minutes.
- **No new runtime dependencies without a strong reason.** Archivise is deliberately small (React + Mermaid). Dev dependencies for tooling (Vitest, eslint, prettier) are fine to discuss.
- **No AI / network calls at runtime.** The app stays offline and key-free by design.
- **Preserve the localStorage schema.** `archivise:state:v1`, `archivise:baseline:v1`, and `archivise:welcome-dismissed:v1`. If you must break it, bump the version suffix and add a migration.
- **Export format is versioned.** If `Architecture.version` needs to change, add a migration in `importJson`.

## Local setup

```bash
git clone https://github.com/<you>/archivise.git
cd archivise
npm install
npm run dev
```

Before you push:

```bash
npm run build
```

A green build is the minimum bar. If tests land in the repo, run them too.

## Code style

- **React function components** with hooks. No class components.
- **Pure functions for anything that transforms state → derived data.** Keep them in `src/hooks/useBuilder.js` or `src/utils/`. They should be trivially testable.
- **Single `app.css`.** Use CSS custom properties (`--bg`, `--panel`, `--border`, `--text`, `--muted`, `--accent`, `--code-bg`, `--mono`) already defined in `:root` rather than hardcoded values.
- **Accessibility:** every interactive element needs a label (`aria-label` or visible text). Focus rings must remain visible.
- **Keep things keyboard-reachable.** If you add a new interaction, it must work from the keyboard.
- **Comments:** prefer self-describing code. When a comment is warranted (e.g. explaining *why* an escape-hatch exists), write a short one.

## What we especially welcome

- Items from [ROADMAP.md](./ROADMAP.md) — the roadmap *is* the issue list.
- Bug reports with a minimal reproduction (a saved `.archivise.json` attached to the issue is perfect).
- Screenshots / screen-recordings for UX changes.
- Tests. See the Testing section of the README.

## What we'll usually push back on

- Large refactors without a prior issue.
- Adding heavy UI libraries (Material UI, Chakra, Tailwind).
- Adding a backend, auth, telemetry, or any network requirement.
- Rewriting the CSS system.

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. Tag (`git tag vX.Y.Z && git push --tags`).
3. GitHub Actions (if configured) builds and publishes the static site.

## Code of Conduct

Be kind. Assume good faith. Disagree on the code, not the person. If something feels off, open an issue or email the maintainer.

---

Happy hacking.
