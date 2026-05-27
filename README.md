# Eye in the Sky

[![Lint](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/lint.yml)
[![Typecheck](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/typecheck.yml)
[![Test](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml/badge.svg)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/TheAngryRaven/DataViewer_coach/badges/coverage-badge.json)](https://github.com/TheAngryRaven/DataViewer_coach/actions/workflows/coverage.yml)

`@theangryraven/eye-in-the-sky` — an AI driver coach framework, packaged as a
plugin for [DataViewer](https://github.com/TheAngryRaven/DataViewer_coach).

> Status: early. The plugin contributes a deterministic, local, free **coaching
> dashboard** to the host's dedicated **Coach** tab: a session summary
> (laps/best/consistency/theoretical best/top speed + a plain-language takeaway),
> speed-trace and delta-time-vs-best charts, a "where you're losing time"
> per-corner breakdown, per-sector deltas, and braking/throttle notes. Richer
> reads degrade gracefully by detected channels (e.g. measured vs GPS-derived g).
> This is the Stage-1 (no-model) analysis core; the AI-powered Stage 2 — see
> [ARCHITECTURE.md](./ARCHITECTURE.md) and
> [ARCHITECTURE_addon2.md](./ARCHITECTURE_addon2.md) — is not yet implemented.
>
> Charts use [uPlot](https://github.com/leeoniya/uPlot); the panel is lazy-loaded
> so uPlot stays out of the host's initial bundle.

## What it does today

The plugin runs a **Stage-1**, fully deterministic, on-device analysis: no model,
no network. The host hands it a parsed session (a time-sampled GPS stream plus
detected laps), and `buildCoachingReport` (`analysis/report.ts`) composes the
pipeline below into one structured report that the dashboard renders as a thin
view. Nothing is shown that wasn't computed from the handed data — figures may
shift as the heuristics are tuned (the dashboard carries a "beta" badge).

### 1. The distance domain

Loggers sample in *time*, but laps can only be overlaid and compared in
*distance*. `analysis/distance.ts` is the interpreter:

- **Cumulative distance** is integrated from GPS *position* with the haversine
  great-circle formula (`cumulativeDistanceMeters`), giving an arc length in
  metres at every sample.
- Every lap is **resampled onto one shared distance grid** of 400 points
  (`GRID_POINTS`), sized from the *median* lap length so an out-lap or aborted
  lap doesn't distort the axis. Speed, elapsed time, and any optional channels
  (throttle/brake when present) are linearly interpolated onto that grid.
- **Delta-time** (`deltaTimeMs`) is the elapsed-time difference between two laps
  at equal track distance — the standard "Variance" read (MoTeC i2). Positive
  means the subject lap is behind the reference at that point on track.

The **reference** lap is the session's fastest; the **subject** is the lap under
inspection (defaults to the second-fastest, so there's always a meaningful
comparison before you pick one).

### 2. Corner detection

`analysis/corners.ts` segments the lap into corners in the distance domain, two
ways, both feeding a shared prominence-based segmenter so everything downstream
is method-agnostic:

- **Speed method** (default): prominent *valleys* in the speed trace. The apex is
  the **V-Min** point — the slowest point in the corner. Robust to GPS/heading
  noise.
- **Curvature method**: prominent *peaks* in |curvature|. The apex is the
  **geometric apex** (point of minimum radius). Grounded in track geometry but
  softer, since it depends on GPS path quality.

A valley/peak only counts as a corner if its **prominence** (depth relative to
the bounding peaks) clears a threshold — both a fraction of the signal's range
and an absolute floor (e.g. a 1.5 m/s minimum speed drop), so flat sections and
noise don't register. The signal is smoothed (moving average) before detection,
and flat-bottomed valleys collapse to their centre so they register once.

### 3. Apex calculations

This is the heart of the corner analysis (`analysis/curvature.ts`,
`analysis/segments.ts` → `apexOffsets`). Two distinct "apexes" are computed for
every corner and compared:

- **V-Min apex** — the driver's *actual* slowest point in the corner window
  (`argmin` of speed). This is what the driver did.
- **Geometric apex** — the *geometric* apex, the point of maximum |curvature|
  (minimum radius). This is what the track geometry suggests. Curvature is

  ```
  κ = d(heading) / d(distance)        [1/m]
  ```

  computed by central differences over the distance-resampled heading trace.
  Heading comes from the host's course-over-ground channel when present; when it
  doesn't, we fall back to the **bearing between successive GPS positions**
  (`bearingRad`, the initial great-circle bearing). The heading sequence is
  **unwrapped** (2π discontinuities removed) before differencing so the
  derivative is continuous, and curvature is smoothed before use.

- **Apex offset** — the signed distance between them:

  ```
  offsetM = dist(V-Min) − dist(geometric apex)
  ```

  - `offsetM > 0` → **late** apex: the driver slows *after* the geometric apex.
  - `offsetM < 0` → **early** apex: the driver slows *before* it.
  - `|offsetM| ≤ deadband` (2 m) → **on** the apex.

  Crucially this is **diagnostic, not prescriptive**: the time-optimal apex is
  *later* than the geometric apex on a corner leading onto a straight (slow-in /
  fast-out), so a "late" reading is often correct. See `REFERENCES.md`
  (Brouillard, _The Perfect Corner_; the minimum-curvature-vs-minimum-time
  literature).

- **Confidence flag** — the geometric apex is only meaningful where there's a
  real curvature peak. If |κ| at the peak is below a floor (`0.005 /m`), the
  offset is flagged not-confident and the dashboard hides it. This guards against
  reading an "apex" out of GPS noise on a near-straight. Offsets are computed at
  grid resolution (≈ lap length / 400 m); sub-grid parabolic refinement is left
  for later.

### 4. Per-corner reads

For each detected corner, the report adds (`analysis/segments.ts`,
`analysis/grip.ts`):

- **Time loss** (`cornerTimeLoss`) — delta-time integrated across the corner
  window, subject vs best. The "where you're losing time" list ranks corners by
  this, largest first.
- **Exit & exit-critical** (`cornerExits`) — exit speed, plus the length of the
  straight that follows. Exit speed matters most when a meaningful straight
  follows (≥ 60 m, provisional), because the gain compounds down its whole length
  (exit priority).
- **Braking point** (`brakingPoints`) — from longitudinal acceleration along the
  speed trace: where deceleration first crosses a threshold (2 m/s²) on the
  approach, peak deceleration, and how far the braking zone runs to the apex.
  Works on pure GPS.
- **Throttle re-application** (`throttleApplication`) — first point after the apex
  where the throttle channel crosses "on" (≥ 50%). Only when a throttle channel
  is present.
- **Lap-to-lap consistency** (`cornerConsistency`) — the standard deviation and
  spread of V-Min across *every* lap in the session. Reference-free, and the most
  reliable amateur signal: consistency is the prerequisite to pace.
- **Friction-circle grip** (`cornerGrip`) — lateral g is derived from GPS as
  `a_lat = v²·κ`, combined with longitudinal g from the speed trace, and compared
  to the lap's **demonstrated grip envelope** (a high percentile of combined g).
  This yields **scrubbing** (holding minimum speed over a wide arc under lateral
  load) and **unused grip** (apex well under the envelope — room to carry more
  speed). Both are **advisory** (capped at low confidence): GPS-derived g is
  coarser than a chassis accelerometer.

### 5. Attributed insights

`analysis/coaching.ts` joins those reads into a single **structured, attributed,
confidence-tagged record** per corner — the Stage-1 → Stage-2 contract. Each
corner's time loss is attributed to one ordered root cause:

1. `inconsistent_apex` — high lap-to-lap V-Min variance (fix repeatability first).
2. `scrubbing` / `unused_grip` / `low_min_speed` — an apex-speed deficit, refined
   by the friction circle.
3. `corner_execution` — time lost but apex speed matched the best (entry/line/exit,
   unresolved at this fidelity).
4. `none` — within the noise floor.

The record carries the supporting numbers as `evidence`; downstream rendering
(the free templated phrasing today, an AI coach later) reads those numbers and
**never invents one that isn't there**.

### 6. Data-quality gating

`analysis/quality.ts` assesses the GPS fix (median HDOP / satellite count) and the
logging rate, classifies the session **good / fair / poor**, and **caps** how
confident any insight may be (poor → low, fair → medium). Capability detection
(`analysis/channels.ts`) gates the richer reads: measured vs GPS-derived g,
throttle, brake, rpm — each used only when the data actually carries it.

### What the dashboard surfaces

The Coach tab renders: the session summary + takeaway, a speed-trace and a
delta-to-best chart, the attributed "where you're losing time" list (with
braking/throttle notes), an apex-line panel (V-Min vs geometric apex per corner),
a track map colouring each corner by attributed cause with apex/exit markers,
per-sector deltas, and a data-quality footer. A toggle switches corner detection
between the speed (V-Min) and curvature methods.

## Install

From the public npm registry (no registry config needed):

```
npm install @perchwerks/eye-in-the-sky
```

The same release is also mirrored to GitHub Packages (`npm.pkg.github.com`)
under the repo owner's scope, `@theangryraven/eye-in-the-sky`.

## Usage

The package default-exports a `DataViewerPlugin`. The host app loads it and calls
`setup(ctx)` during initialization; the plugin contributes its UI panel to the
host's `PANELS_POINT` registry point (Coach slot):

```ts
import plugin from "@perchwerks/eye-in-the-sky";

plugin.setup(ctx); // ctx provided by the DovesDataViewer host
```

Host integration types (`@/plugins/panels`, `@/types/racing`) are kept as local
compile-time stubs here so the package typechecks standalone; the host's real
modules resolve at runtime.

## Development

```
npm install            # install dev dependencies
npm run lint           # eslint (type-checked; bans `any`)
npm run typecheck      # tsc --noEmit
npm test               # vitest (watch mode)
npm run test:run       # vitest run (single pass)
npm run test:coverage  # run tests with a coverage report
```

The coverage badge is self-hosted: the `Coverage` workflow generates a
[shields.io endpoint](https://shields.io/endpoint) JSON and publishes it to the
`badges` branch — no third-party coverage service is involved.

## References

The analysis is grounded in established racing technique and telemetry practice,
not guesswork. See [REFERENCES.md](./REFERENCES.md) for the project's loose
citations and which sources back which metrics.

## License

[GPL-3.0-or-later](./LICENSE).
