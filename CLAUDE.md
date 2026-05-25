# CLAUDE.md

Notes for working in this repository.

## What this is

`@theangryraven/eye-in-the-sky` is an AI driver coach framework, shipped as a
DataViewer plugin. It is published to the GitHub Packages npm registry. Treat it
as a professional project: changes ship with tests and pass CI.

This is an early scaffold. Keep things primitive until the core takes shape — do
not introduce abstractions, config, or dependencies ahead of need.

## Layout

- `index.ts` — plugin entrypoint. Default-exports a `DataViewerPlugin`.
- `plugins/types.ts` — local stub of the host plugin interfaces. Replace with the
  real DataViewer types once this builds against the host.
- `tests/` — Vitest specs (`*.test.ts`).
- `vitest.config.ts` — test + v8 coverage config; maps the `@/` alias to the repo root.
- `CHANGELOG.md` — Keep a Changelog format; see below.

## Conventions

- TypeScript-only project. `strict` is mandatory (`tsconfig.json`); `any` is
  banned by lint (`@typescript-eslint/no-explicit-any` plus type-checked rules
  in `eslint.config.js`). Avoid `any` — reach for proper types or `unknown`.
- The `@/` import alias resolves to the repo root (see `tsconfig.json` and
  `vitest.config.ts`). Keep both in sync.
- Type-only files (e.g. `plugins/types.ts`) are excluded from coverage.

## References & citations

Analysis code encodes real racing/engineering knowledge, not vibes. When you add
or change a metric, heuristic, or threshold in `analysis/`:

- Ground it with a **loose citation** in `REFERENCES.md` (author + work + what it
  supports — no page numbers, DOIs, or ISBNs; keep it loose, but never vaguer
  than naming the author and title). Reuse an existing entry where one fits.
- Point to it in a short code comment near the logic (e.g. `// exit priority —
  see REFERENCES.md (Going Faster!)`).
- No "vibes" thresholds: a magic number should trace to a source, or be clearly
  labelled in a comment as a provisional heuristic to tune.
- Driver philosophy may be cited **only from books a driver actually authored**
  (Stewart, Lauda, Clark, Prost, …). Never drop in driver "quotes" — most are
  apocryphal and read as cheesy.

## Commands

```
npm install            # dev dependencies
npm run lint           # eslint (type-checked; bans `any`)
npm run typecheck      # tsc --noEmit
npm test               # vitest (watch)
npm run test:run       # vitest run (single pass)
npm run test:coverage  # vitest run --coverage
```

## CI

Each pipeline is a separate workflow under `.github/workflows/`, mirroring
DovesDataViewer: `lint.yml`, `typecheck.yml`, `test.yml`, `coverage.yml`, plus
`publish.yml` (on `v*` tags). They run on every push to `master` and on pull
requests.

Coverage is self-hosted (no external service): `coverage.yml` runs the suite
behind a line-coverage gate (`vitest.config.ts` thresholds, currently 1% —
ratchet up as coverage grows), posts a per-PR summary comment, and on `master`
publishes a shields.io endpoint JSON to the `badges` branch via
`scripts/coverage-badge.mjs`. The README coverage badge reads that JSON.

## Changelog

A changelog is mandatory. Every user-facing change must add an entry under the
`[Unreleased]` section of `CHANGELOG.md` (Keep a Changelog format:
Added/Changed/Fixed/Removed). On release, rename `[Unreleased]` to the new
version and start a fresh `[Unreleased]` section.

## Before pushing

Run `npm run lint`, `npm run typecheck`, and `npm run test:run`, and update
`CHANGELOG.md`.

## Out of scope for Claude

Do not add a CODE_OF_CONDUCT file.
