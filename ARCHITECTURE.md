# Architecture

Design notes for `@theangryraven/eye-in-the-sky`, the AI driver-coaching layer
shipped as a DataViewer plugin.

> Status: design / direction. This document is ahead of the code — it describes
> where we're heading, not what's built. Per `CLAUDE.md` we keep the actual
> implementation primitive and add abstractions only when a phase needs them.
> Treat the type sketches below as illustrative, not committed interfaces.

## 1. What we're building

A system that turns recorded driving telemetry into **actionable, plain-language
coaching** — "you're lifting too early into the hairpin, that's costing you
~0.2s a lap" — rather than just charts.

- **First data source:** DovesDataLogger.
- **First discipline:** karting (technique model and defaults are kart-specific;
  see §6).
- **First mode:** post-session debrief (analyze a completed session). Real-time
  in-session coaching is a later, harder mode and is explicitly out of scope for
  now, though the pipeline is designed not to preclude it.

**Two stages.** The system splits into a deterministic analysis core and an
optional AI layer on top:

- **Stage 1 — the analysis core (deterministic, local, free).** All the
  telemetry math: ingest, distance model, segmentation, metrics, deltas,
  consistency, and the technique evaluators (§4–§7). This runs in the plugin with
  no model calls and is useful on its own (the Labs panel already shows a Stage-1
  read). The "so much math" lives here, *off* the model.
- **Stage 2 — the AI coach (subscription, provider-funded backend).** A model
  reasons on top of Stage-1 outputs. Its highest-value job is **setup-configuration
  advice** — reasoning over `(setup, log)` pairs across runs, which is qualitative
  and knowledge-heavy in a way deterministic code can't match. See
  `ARCHITECTURE_addon2.md` for the two-stage rationale, the setup-advice subsystem,
  and the commercial/execution model.

## 2. How it plugs into DataViewer

The plugin entrypoint (`index.ts`) default-exports a `DataViewerPlugin` and
registers itself in `setup(ctx)`. Today it contributes a placeholder
`diagnostics` message. The coaching system grows behind that entrypoint: the
host hands us telemetry (or a path to it), we run the pipeline, and we contribute
results back through the registry. The host integration surface stays thin — all
the coaching logic lives in modules the plugin owns, so it can be tested in
isolation against recorded sessions without a running host.

## 3. Design principles

1. **Deterministic analysis, model on top.** Every number — time deltas,
   braking points, minimum corner speed — is computed in plain code. The model
   never sees raw telemetry arrays and never produces a figure it wasn't handed.
   A single fabricated "0.3s in turn 4" permanently destroys a coach's
   credibility. The model's job is qualitative: cluster, prioritize, explain, and
   — most distinctively — reason about *setup* (§8, addon B). It is a separate,
   paid second stage, not woven into the math.
2. **Distance domain, not time domain.** Laps are compared spatially along the
   track, so two laps line up point-for-point regardless of speed. This is the
   universal convention (MoTeC, FastF1, the commercial sim coaches).
3. **Heuristics first, ML later.** Reference comparison + physics-grounded
   thresholds covers most actionable coaching with zero training data. ML
   (clustering, anomaly detection, style classification) is deferred until there
   is a labeled lap corpus and the heuristic core exists.
4. **The reference is an interface, not the driver's best lap** (the "folklore
   trap"). Because an amateur's fastest lap can still be a poor lap, "what good
   looks like" is a pluggable concept with several strategies (see §7), grounded
   in the driver's own data — never in hardcoded folklore (ideal-apex tables, etc).
5. **Keep it primitive.** Build in phases (§9); each phase is independently
   useful. Don't introduce a config system, plugin abstraction, or ML dependency
   before a phase actually needs it.

## 4. The pipeline

```
DovesDataLogger export
  → [ingest]      parse to a normalized Session (channels + samples)
  → [resample]    build a per-lap, distance-indexed channel table
  → [segment]     detect laps, then corners/straights within a lap
  → [metrics]     per-corner derived metrics (braking pt, min speed, smoothness…)
  → [evaluate]    run reference + absolute evaluators → ranked insights w/ time cost
  → [coach]       LLM verbalizes the top 1–3 insights as grounded advice
  → contribute back to the DataViewer host
```

Stages 1–4 are pure data processing. Stage 5 produces a structured, ranked list
of facts. Only stage 6 involves the LLM, and only as a verbalizer.

## 5. Data model

The internal representation everything hangs off is a **distance-resampled,
per-lap channel table** (FastF1's design). Sketch:

```ts
// Illustrative — not a committed interface.
interface Sample {
  t: number;        // seconds from session start
  lat: number;      // GPS
  lon: number;
  speed: number;    // m/s, from GPS (or fused)
  ax: number;       // longitudinal g (accel/brake)
  ay: number;       // lateral g (cornering)
  rpm?: number;     // engine, when present
  temps?: Record<string, number>; // e.g. cht, egt, water — when present
}

interface Lap {
  index: number;
  laptime: number;
  samples: Sample[];          // raw, time-ordered
  distance: Float64Array;     // cumulative distance per sample
  // resampled onto a common distance grid for cross-lap comparison:
  grid: { distance: Float64Array; [channel: string]: Float64Array };
}

interface Session {
  source: "doves-datalogger";
  track?: TrackRef;           // resolved/learned start-finish + corner layout
  laps: Lap[];
}
```

Key derived channels computed during resample: **cumulative distance**
(integrate speed or GPS path length) and **curvature** (κ = 1/R from the GPS
path, smoothed). Lap detection is start/finish-line crossing geometry — the same
approach as DovesLapTimer, which we can reuse rather than reinvent.

### Ingest adapter

Each source gets a thin adapter that maps its export into `Session`.
DovesDataLogger is the first; its exact channel names and file format are TBD and
will be pinned against real output. A CSV/GPX adapter is a cheap second source
that also covers TrackAddict/RaceChrono exports for testing. Keep adapters
isolated so the analysis core never knows where data came from.

## 6. Karting tailoring

Karting changes both the signals and the technique model:

- **Momentum driving.** Most kart classes have weak or rear-only brakes and no
  gearbox (excluding shifter/KZ). The dominant skill is *carrying minimum corner
  speed* and not scrubbing, not "braking points." Coaching weights
  **minimum-corner-speed, smoothness, and line** over brake-release timing.
- **Inferred throttle/brake.** DovesDataLogger likely has no throttle/brake
  position channel, so application is inferred from longitudinal-g and the RPM
  derivative. Flag inferred metrics as lower-confidence than measured ones.
- **Short laps, many of them.** Kart sessions are dozens of short laps. That's a
  rich consistency dataset — lap-to-lap variance is one of the most reliable
  amateur-coaching signals and needs no "good" reference (see §7).
- **Sharp IMU signal.** No suspension + direct chassis means the accelerometer is
  spiky; filtering/smoothing matters before curvature and g-g analysis.
- **Engine channels are secondary.** RPM and temps (CHT/EGT/water) are mostly
  session-validity and engine-health signals (bogging on exit, over-rev,
  jetting), not primary driver coaching. Use them to qualify laps and flag
  anomalies, not to generate technique advice.
- **g-g / friction circle** is especially useful here: lateral vs longitudinal g
  reveals unused grip and abrupt inputs using only the IMU, which karts have.

## 7. The reference-lap problem

The core risk the user flagged: **an amateur's fastest lap may still be full of
mistakes**, so coaching purely relative to "your best" just chases a bad target.
We address this with layered evaluators, combined per session:

1. **Absolute / technique evaluators (no reference).** Physics- and
   karting-best-practice heuristics that flag poor driving regardless of any
   comparison: not reaching sustained full throttle, lateral-g without forward
   progress (scrubbing), abrupt input transitions (jagged g-g trace), lifting
   mid-corner, inconsistent lines. These work for a complete beginner with no
   good lap to their name.
2. **Consistency evaluators (self-relative, no "good" needed).** Lap-to-lap
   variance of braking/turn-in points, minimum corner speed, and line. For
   amateurs, consistency is frequently the biggest available gain and is
   measurable without judging absolute quality.
3. **Self-best evaluators.** Compare against the driver's **theoretical best** —
   stitched from their fastest *micro-sectors*, not a single lap — which is a
   stronger, still-achievable target than their best full lap. Personal-best full
   lap is the simplest first cut.
4. **External reference evaluators (future, cloud).** A faster driver's or
   coach's lap. This is the real answer to "is my best actually any good," and
   it's where crowd-sourcing comes in. **Stubbed now behind the reference
   interface; filled in alongside the cloud work.**

```ts
// Illustrative.
interface ReferenceSource {
  // Returns a per-corner reference profile for a track, or null if none yet.
  referenceFor(track: TrackRef, session: Session): CornerProfile[] | null;
}
// Implementations: TheoreticalBest (now), PersonalBest (now),
// ExpertLap / CrowdBest (stub now → cloud later).
```

Coaching for an amateur should lean on evaluators (1) and (2) early, layer in (3)
as they improve, and (4) once cloud references exist. The evaluator set is
additive — adding the cloud reference later does not require reworking the
pipeline.

## 8. The coaching (AI) layer — Stage 2

The paid second stage. It consumes Stage-1's ranked structured insights (each
with a corner, a quantified time/skill cost, and a root cause) plus — where the
model earns its subscription — **kart setup metadata**. Two jobs:

- **Setup-configuration advice (the flagship AI use).** Reason over `(setup, log)`
  pairs across runs to explain what a setup change did to the telemetry and what
  to try next. This is qualitative, combinatorial, domain-knowledge-heavy
  cause-and-effect — exactly what deterministic code can't do and a model can.
  This is the primary justification for the AI tier; see `ARCHITECTURE_addon2.md`.
- **Telemetry-coaching prose (optional polish).** Verbalizing per-corner insights:
  one theme at a time (cluster correlated faults; rank by time lost; say the most
  impactful thing first). Because the insights are already structured, this prose
  is *templatable in Stage 1 without a model* — the AI is an upgrade here, not a
  requirement.

Principles (both jobs):

- **Grounded by construction.** The model may only reference metrics it was
  given. Never invent numbers; if a metric isn't provided, don't cite it.
- **Claude API shape:** tool-use so the model *queries* metrics rather than
  ingesting raw telemetry; **structured output** so every claim traces to a metric
  or setup field; **prompt caching** on the static track knowledge, setup schema,
  and coaching rules, with the volatile per-run data sent after the cached prefix.

The model is deliberately the *last and thinnest* stage. Everything it says is
backed by a number computed upstream or a setup value the user entered.

## 9. Build roadmap

Each phase is independently useful and shippable.

**Stage 1 — analysis core (deterministic, free).** Note phase 0 below: the data
is only as good as its conditioning (see §10).

0. **Data quality & conditioning.** GPS/IMU filtering, sensor fusion, a stable
   distance axis, accelerometer gravity/orientation calibration, projection to a
   metric frame, and lap-validity gating. Caps the accuracy of everything above.
1. **Ingest + distance model + lap/corner detection.** DovesDataLogger adapter →
   `Session` → distance-resampled laps → auto-detected corners. Deliverable: a
   clean, queryable per-lap data model.
2. **Self-relative analysis.** Theoretical-best (micro-sector) and personal-best
   deltas; per-corner time loss; consistency metrics. Deliverable: "where you're
   losing time and where you're inconsistent."
3. **Absolute technique metrics.** g-g/friction-circle usage, smoothness,
   inferred throttle/brake application, momentum/min-corner-speed evaluators
   (apex/V-Min: see `ARCHITECTURE_addon1.md`). Deliverable: technique feedback
   that doesn't depend on a good reference. Optional: templated prose (no model).

**Stage 2 — AI coach (subscription, provider-funded; addon B).**

4. **Setup capture + setup-vs-log advice.** A way to record kart setup per run,
   then a model that reasons over `(setup, log)` pairs to advise setup direction.
   The flagship paid feature. Requires the Stage-2 backend (keys server-side,
   entitlement gating, result caching).
5. **AI telemetry debrief.** Model-authored synthesis/prioritization of the
   Stage-1 insights, as an upgrade over the templated prose.

**Later:** external/crowd reference (cloud), real-time mode, ML evaluators (lap
clustering, anomaly detection, style classification) once a labeled corpus exists.

## 10. Foundations, risks & open questions

Discoveries from review. The design is sophisticated about *what* to compute; the
load-bearing risks are in the foundations beneath it and the system around it.
Grouped by how much else depends on them.

### Tier 1 — foundational (cap everything above them)

- **Data quality & signal conditioning (the missing Stage 0).** §4–§7 assume a
  clean distance `grid` and a usable curvature channel just appear. On a consumer
  karting logger they won't:
  - GPS at ~10–25 Hz over 30–60 s laps gives a fast corner only a handful of
    samples; curvature (κ = 1/R) from raw GPS is very noisy.
  - The **distance axis** is unspecified — integrate GPS speed (drifts) vs path
    length (jitters)? That choice silently sets delta-time and apex-offset accuracy.
  - The IMU needs **gravity compensation + orientation calibration**, and on
    undulating tracks **gradient contaminates longitudinal-g** (and thus inferred
    braking and the friction circle).
  - Curvature/distance must be computed in a **projected metric frame** (local
    tangent plane / UTM), not raw lat-lon.
  This deserves to be a first-class stage (phase 0), not an assumption.
- **Lap-validity gating & track-state evolution.** References are only as good as
  the laps feeding them. Filter out-/in-laps, offs, spins, tows/traffic, and
  engine bogs (RPM/temp can flag these) *before* computing any best/theoretical
  best. Note theoretical-best stitched from micro-sectors can be **physically
  un-drivable** (incompatible lines → a demotivating Frankenstein target) and needs
  a sanity bound. Grip also **evolves within a session** (cold→hot tyres, rubber-in,
  fuel burn) — comparing an early lap to a late one is unfair; normalize for it.
- **Track & corner identity across sessions.** Listed before as a mere open
  question, but it's a prerequisite for consistency-across-sessions, trends, and
  "you fixed T1, now T7 is the loss." Requires track registration (align GPS frames
  across days/devices) and stable corner identity (a marginal kink must map the
  same run to run).

### Tier 2 — the system around the analysis

- **Causal attribution method (addon A.5 assumes it).** Splitting a corner delta
  into V-Min vs line vs braking is the *hardest* step and the one coaching
  credibility rests on — and the causes are correlated (early brake → low entry →
  low V-Min → bad exit). Mis-attributing confidently is worse than saying less.
  No method is specified yet.
- **Validation / ground truth + real-telemetry fixtures.** For a project that
  "ships with tests," the analysis core has none beyond formatting helpers. We need
  a corpus of real DovesDataLogger sessions with known characteristics and golden
  outputs, and ideally back-testing (does following advice correlate with
  improvement?).
- **Execution & commercial model — now decided (see addon B).** Provider-funded
  inference behind a backend (keys server-side, never client), AI features
  subscription-gated, Stage-1 analysis free and local, results cached to control
  per-run cost. Recorded here so it stops being an open risk.

### Tier 3 — note now, build later

- **Driver model / coaching memory & pedagogy.** Persist skill level, what the
  driver was already told and whether they acted on it, and progression.
  Time-lost ranking alone isn't pedagogy — a beginner's biggest loss is often
  un-actionable; fundamentals should gate fine-tuning.
- **Streamable vs batch.** "Doesn't preclude real-time" is asserted, not designed:
  parabolic V-Min fits, micro-sector stitching, and cross-lap variance are all
  post-hoc. Mark which computations could be incremental if real-time matters.
- **Privacy & data ownership.** Crowd/cloud references mean uploading driver
  telemetry (and setup) — consent, anonymization, ownership.

### Still genuinely open

- DovesDataLogger's exact export format and channel set (pins the phase-1 adapter).
- Track identification: learn start-finish + layout from data, or require a track
  definition? Karting venues are numerous and often unmapped.
- How corner-detection thresholds transfer across kart classes and track scales.
- Where the line sits between "engine-health anomaly" and "driver coaching" for
  RPM/temp channels.
- Confidence presentation (partly addressed by addon A.6): surfacing that inferred
  (throttle) and curvature-derived metrics are softer than measured ones.
- Where setup data comes from and its per-class schema (see addon B).

## References

Prior art and methods that informed this design:

- RaceCapture / RaceAnalyzer (Autosport Labs, GPL-3) — closest open-source analog
  for GPS+IMU+OBD data.
- FastF1 — the distance-domain per-lap data model and delta-time approach.
- DovesLapTimer — start/finish-line crossing + layout detection geometry to reuse.
- Coach Dave Delta, Track Titan, Trophi.ai — commercial AI sim-racing coaches;
  the per-corner, reference-relative, ranked-advice UX to target.
- Friction-circle / g-g analysis (Mark Donohue's trail-braking work and modern
  write-ups) — IMU-only technique assessment.
