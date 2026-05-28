# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-05-28

### Added

- Consume the host's **`activeSnapshot`** and **`sessionSetup`** plugin-panel
  fields (DovesDataViewer BETA PR #76). The coach now treats a loaded snapshot
  as the reference comparison lap: the snapshot's clean sample slice defines
  the distance grid, corners are detected on its speed trace, and the in-session
  laps are resampled onto that grid. Headline number is the lap-time delta
  between the in-session best and the snapshot baseline, and the comparison
  engine / lap time / track / course is surfaced in a "Compared against …" badge
  in the header (the engine may differ from what's running today, since
  snapshots are keyed on course + engine). When no snapshot is loaded the coach
  behaves exactly as before, falling back to the in-session fastest lap.
- A **setup diff** (`analysis/setupDiff.ts`) between the frozen
  `activeSnapshot.setup` and the live `sessionSetup`, surfaced in a "Setup
  changes since baseline" section ("Front-left PSI: 12 → 13 psi (+1)"). PSI,
  tire width/diameter, tire brand, and template custom fields are all compared;
  a unit-system or template change flags itself first so width/diameter deltas
  aren't read with the wrong unit. When the live setup is missing, the frozen
  baseline setup is still surfaced as context ("the baseline lap was run with
  X PSI").
- Mirrors for the new host contract: `VehicleSetup` (`plugins/setup.ts`) and
  `PluginSnapshot` (extended into `plugins/panels.ts`). Both new
  `PluginPanelProps` fields are typed `optional | null` so the plugin keeps
  working against older host builds that don't ship them.
- `buildSampleProfile` and `curvatureFromSamples` helpers — distance-domain
  primitives that work on a raw sample slice (no host `Lap` required), used to
  fold the snapshot into the existing analysis pipeline.

### Changed

- Expanded the README with a detailed **"What it does today"** walkthrough of the
  Stage-1 analysis pipeline — the distance domain, corner detection, the apex
  calculations (V-Min vs geometric/curvature apex, the signed apex offset and its
  confidence flag), the per-corner reads, attributed insights, and data-quality
  gating — so the documented behaviour matches what the plugin actually computes.

## [0.2.5] - 2026-05-26

### Added

- Structured per-corner **insight records** (`analysis/coaching.ts`) — the
  Stage-1 → Stage-2 contract (addon2 §B.2, addon1 §A.7). `buildCornerInsights`
  attributes each corner's time loss to a `rootCause` (`low_min_speed` /
  `corner_execution` / `none`) with a coarse `confidence`, carrying the
  supporting numbers as `evidence` (this first pass is strongest on
  exit-critical corners, where a minimum-speed deficit compounds onto the
  following straight). `describeCornerInsight` is the free-tier templated
  phrasing, kept separate from the record so an AI tier can reason over the same
  structured contract and only rephrase/prioritize — never invent a number.
  Surfaced in the dashboard's "Where you're losing time (attributed)" section.
- Widened the cause set with **`inconsistent_apex`** plus the consistency layer
  behind it: `cornerConsistency` (lap-to-lap V-Min stdev/spread per corner, over
  every lap on the shared grid; addon1 §A.4 layer 2 — reference-free). Attribution
  is now single-cause but ordered — high V-Min variance takes priority over a
  single-lap min-speed deficit, because consistency is the prerequisite to pace.
  Exposed as `report.consistency`.
- Two more causes from a **GPS-derived friction circle** (`analysis/grip.ts`):
  `scrubbing` (holding minimum speed over a wide arc under lateral load) and
  `unused_grip` (apex clearly under the demonstrated grip envelope). Lateral g is
  derived as `v²·κ`; both reads are **advisory** (capped at low confidence) and
  the dashboard says so — a chassis-mounted accelerometer would sharpen them, and
  many kart loggers mount the sensor on the steering, which isn't ideal here.
- **Stage-0 data quality** (`analysis/quality.ts`): assesses GPS fix (HDOP /
  satellites) and logging rate, and **caps insight confidence** accordingly
  (poor → low, fair → medium). Exposed as `report.quality` and shown in the
  dashboard footer.
- The track map now **colours each corner by its attributed cause** (low minimum
  speed / scrubbing / unused grip / inconsistent apex / execution), with the
  V-Min dot and numbered badge sharing the colour and **low-confidence/advisory
  reads drawn dashed**. The corner window is clickable (popup names the cause,
  confidence, and time lost), and a colour legend sits above the map.
- An "Experimental analysis · beta" badge in the Coach panel header.

## [0.2.4] - 2026-05-25

### Added

- `REFERENCES.md` — the project's "loose citations" list (racing-line/apex canon,
  lap-time-optimization literature, telemetry-analysis practice, and
  driver-authored references), plus a code→source table. A `CLAUDE.md` rule now
  requires new `analysis/` metrics/heuristics to cite a source there (no "vibes"
  thresholds; driver philosophy only from driver-authored books, no quotes).
- Per-corner **exit read** (`cornerExits`): exit speed and whether a meaningful
  straight follows ("exit-critical"), grounded in exit priority. Surfaced on the
  track map as exit dots (green when a straight follows, grey otherwise) and in
  the corner popups (exit speed + following-straight length).

## [0.2.3] - 2026-05-25

### Fixed

- Track map crashed the Coach panel ("Invalid LatLng object: (undefined,
  undefined)") when a course had sector boundaries. The host's `sector2`/
  `sector3` are **line segments** (`{ a, b }`), not single points, so the old
  point-marker code read `undefined` lat/lon. They're now drawn as polylines
  (matching start/finish), and the local `Course` stub types them as `SectorLine`.

## [0.2.2] - 2026-05-25

### Fixed

- Widened the `react`/`react-dom` peer range to `^18.3 || ^19.0.0`. 0.2.1
  required `^19.0.0`, which broke `npm install` (ERESOLVE) on hosts running
  React 18.3.x; nothing in the dashboard actually needs React 19.

## [0.2.1] - 2026-05-25

### Added

- **Track map** on the Coach dashboard (Leaflet): draws the best lap's race line
  straight from GPS samples and overlays the detected corner windows, the V-Min
  (slowest) point and the geometric apex (curvature peak) per corner, with the
  offset between them and a click popup naming each corner. Start/finish and
  sector boundaries are drawn from `course`. An optional online tile background
  (CARTO dark / Esri satellite) can be toggled on; the map is fully offline
  without it.
- `lapTrack` / `positionAtDistance` in `analysis/distance.ts` — map a lap's GPS
  path and interpolate the lat/lon at any distance along it.

### Changed

- `leaflet`, `react`, and `react-dom` are declared as `peerDependencies` so the
  plugin reuses the host's single Leaflet/React instance (Leaflet is imported raw
  and driven imperatively; its CSS is imported inside the lazy panel module).

## [0.2.0] - 2026-05-25

### Added

- Stage-1 coaching **dashboard** on the Coach tab (still deterministic, local,
  free — no model, no network). Speed-trace and delta-time-vs-best charts
  (uPlot), a "biggest time loss vs your best lap" breakdown, per-sector deltas,
  and per-corner braking/throttle notes, over a session summary. Composed by the
  pure `analysis/report.ts` builder; the panel is a thin view.
- `analysis/distance.ts` — the distance-domain interpreter (ARCHITECTURE §4-5):
  cumulative arc length (haversine), resampling onto a shared distance grid,
  per-lap profiles (speed, elapsed time, and optional resampled channels), and
  per-distance lap-to-lap time delta.
- `analysis/corners.ts` — corner segmentation in the distance domain, two ways:
  **speed** (prominent speed valleys; apex = V-Min, robust to GPS noise) and
  **curvature** (prominent |curvature| peaks; apex = the geometric apex). Both
  share one prominence-based segmenter and return the same shape, so the
  downstream reads are method-agnostic. The dashboard exposes a toggle.
- `analysis/curvature.ts` — path curvature in the distance domain: bearings,
  heading unwrapping, and kappa = d(heading)/d(distance), using the host's
  heading (or position-derived bearings as a fallback). Advisory per addon1 §A.6.
- Per-corner **apex offset** (addon1 §A.3): the signed distance between the
  driver's V-Min point and the geometric apex (curvature peak), classified
  early / late / on, with a confidence flag when the geometric apex is
  ill-defined. Diagnostic only; surfaced in the dashboard and computed for both
  segmentation methods. Foundation for later line/apex visualizations.
- `analysis/segments.ts` — per-sector deltas, per-corner time loss vs the best
  lap, a time-loss ranking, and braking-point (Tier-1, speed-derived) and
  throttle-application (Tier-2, gated on a `throttle` channel) reads.
- `analysis/channels.ts` — capability detection over the host's canonical channel
  ids, distinguishing **measured** g (`accel_*` / `*_native`) from GPS-derived
  `lat_g`/`lon_g`, plus throttle/brake/rpm presence — the gate for richer reads.
- `analysis/signal.ts` — sample-rate-from-timestamps, moving average, and a
  longitudinal-acceleration helper.
- uPlot added as a runtime dependency, imported only inside the lazy panel module
  so it never enters the host's initial bundle.

### Changed

- The Coach panel is now **lazy-loaded** (`React.lazy`) and **chromeless** (new
  `PluginPanel.chromeless` flag), so it owns a full-bleed dashboard layout and
  keeps uPlot off the host's first load.
- Local stubs track the host contract: `FieldMapping` (`{ name, label, unit }`)
  with `ParsedData.fieldMappings` keyed by canonical channel id, and the
  `chromeless` panel flag.

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
