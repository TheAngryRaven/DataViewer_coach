# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-24

### Added

- First real session-level debrief (Stage 1: deterministic, local, free — no
  model). The Coach panel now shows laps analysed (valid vs total), session-best
  lap, lap-time consistency (±1σ and spread), a stitched theoretical best when
  sector splits are present, session top speed (honouring the kph/mph
  preference), and one plain-language takeaway prioritising the single biggest
  gain. Computed in pure, unit-tested functions in `analysis/debrief.ts`.
- `analysis/session.ts` — a thin internal adapter (the Stage-0/1 "interpreter")
  mapping the host `ParsedData`/`Lap` snapshot to an internal `Session` model,
  with capability-detection of optional logger channels (`detectChannels`) so the
  read degrades gracefully to pure GPS.
- `formatLapTimeMs` and `formatSpeed` display helpers in `analysis/insights.ts`.
- `ARCHITECTURE_addon2.md` — the two-stage coaching model (free deterministic
  analysis core vs a paid, provider-funded AI stage), the setup-configuration
  advice subsystem (reasoning over `(setup, log)` A/B comparisons), and the
  execution/commercial model.

### Changed

- The coaching panel moved from the Labs tab to the host's new dedicated **Coach**
  tab (`PanelSlot.Coach`). The panel is now a thin view over the pure debrief
  functions and handles the no-session and no-laps states gracefully.
- Local compile-time stubs now mirror the real host contract exactly:
  `types/racing.ts` (`GpsSample`/`Lap`/`Course`/`ParsedData` with the host's
  millisecond and dual-unit speed fields), `plugins/panels.ts` (added
  `PanelSlot.Coach`), and `plugins/types.ts` (added the per-plugin async
  `PluginStore` on the setup context, reserved for later coaching memory).
- `ARCHITECTURE.md`: introduced the Stage 1 / Stage 2 split (§1, §3, §8, §9) and
  expanded §10 into "Foundations, risks & open questions" recording the reviewed
  gaps — data-quality/conditioning (Stage 0), lap-validity gating and track-state
  evolution, cross-session track/corner identity, causal attribution, validation
  fixtures, driver-model/pedagogy, streamable-vs-batch, and privacy.

### Fixed

- Insight helpers read the non-existent `lap.lapTime` (seconds) field on the host
  `Lap`, which rendered the panel's lap times blank/NaN at runtime. They now use
  `lap.lapTimeMs` and convert ms→s only for display, with a regression test.

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
- Added a `files` allowlist to `package.json` so the npm tarball ships only the
  host-consumed source (`index.ts`, `panel/`, `analysis/`) plus docs — no tests,
  CI configs, tooling, or the compile-time host-contract stubs.

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
