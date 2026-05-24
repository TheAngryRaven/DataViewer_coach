# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.3] - 2026-05-24

### Added

- Labs UI panel: the plugin now contributes an "AI Coaching" panel to the host's
  Labs tab (`PANELS_POINT`, slot `labs`) instead of a placeholder diagnostics
  string. The panel shows a first coaching read from the session snapshot — lap
  count, session-best lap, and the selected lap's delta to the best — with an
  empty state when no session is loaded. Targets the DovesDataViewer host's
  panel framework (currently on its beta branch).
- Local compile-time stubs `plugins/panels.ts` and `types/racing.ts` mirroring
  the host panel contract (`PANELS_POINT`, `PanelSlot`, `PluginPanel`,
  `PluginPanelProps`) and racing types (`ParsedData`/`Lap`/`Course`/`GpsSample`).
- Pure, tested insight helpers in `analysis/insights.ts` (fastest lap, delta to
  best, lap-time/delta formatting) extracted from the panel for DOM-free tests.
- `ARCHITECTURE.md` documenting the coaching-system design: the deterministic
  analysis / LLM-verbalizer pipeline, distance-domain lap model, karting
  tailoring, and the layered reference-lap strategy (absolute, consistency,
  self-best, and stubbed external/crowd references).

### Changed

- `react`, `@types/react`, and `lucide-react` added as dev-only dependencies
  (compile-time; the host bundle provides them at runtime). TypeScript now emits
  the automatic JSX runtime and ESLint lints `.tsx`.

## [0.0.2] - 2026-05-24

### Changed

- Publish workflow now releases to the public npm registry (via `NPM_TOKEN`) in
  addition to GitHub Packages on `v*` tags. Removed `publishConfig.registry`
  so each publish job targets its own registry. The npm release is published
  as `@perchwerks/eye-in-the-sky` (the job rewrites the scope at publish time);
  GitHub Packages keeps `@theangryraven/eye-in-the-sky` to match the repo owner.

### Added

- Plugin scaffold: `index.ts` entrypoint default-exporting a `DataViewerPlugin`
  that contributes a placeholder `diagnostics` message, with a local
  `plugins/types.ts` stub of the host interfaces.
- Tooling: Vitest with v8 coverage and a smoke test; strict TypeScript;
  type-checked ESLint that bans `any`.
- CI pipelines (`lint`, `typecheck`, `test`, `coverage`) and a tag-triggered
  `publish` workflow for GitHub Packages.
- Self-hosted coverage badge published to the `badges` branch.
- GPL-3.0-or-later license, README, and project notes.
