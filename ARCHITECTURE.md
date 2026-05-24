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

## 2. How it plugs into DataViewer

The plugin entrypoint (`index.ts`) default-exports a `DataViewerPlugin` and
registers itself in `setup(ctx)`. Today it contributes a placeholder
`diagnostics` message. The coaching system grows behind that entrypoint: the
host hands us telemetry (or a path to it), we run the pipeline, and we contribute
results back through the registry. The host integration surface stays thin — all
the coaching logic lives in modules the plugin owns, so it can be tested in
isolation against recorded sessions without a running host.

## 3. Design principles

1. **Deterministic analysis, LLM as verbalizer.** Every number — time deltas,
   braking points, minimum corner speed — is computed in plain code. The LLM
   never sees raw telemetry arrays and never produces a figure it wasn't handed.
   A single fabricated "0.3s in turn 4" permanently destroys a coach's
   credibility. The model's job is to cluster, prioritize, and explain. (See §8.)
2. **Distance domain, not time domain.** Laps are compared spatially along the
   track, so two laps line up point-for-point regardless of speed. This is the
   universal convention (MoTeC, FastF1, the commercial sim coaches).
3. **Heuristics first, ML later.** Reference comparison + physics-grounded
   thresholds covers most actionable coaching with zero training data. ML
   (clustering, anomaly detection, style classification) is deferred until there
   is a labeled lap corpus and the heuristic core exists.
4. **The reference is an interface, not the driver's best lap.** Because an
   amateur's fastest lap can still be a poor lap, "what good looks like" is a
   pluggable concept with several strategies (see §7).
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

## 8. The coaching (LLM) layer

Input: a ranked list of structured insights (each with a corner, a quantified
time/skill cost, and a root cause). Output: the top 1–3 pieces of advice in
plain language. Principles:

- **One theme at a time.** Cluster correlated faults ("you brake early in every
  slow corner") into a single root cause rather than emitting twelve disjoint
  notes. Rank by time lost; say the most impactful thing first.
- **Grounded by construction.** The model may only reference metrics it was
  given. Instruction: never invent numbers; if a metric isn't provided, don't
  cite it.
- **Claude API shape:** tool-use so the model *queries* metrics rather than
  ingesting raw telemetry; **structured JSON output** so every tip traces back to
  a metric field (`{ corner, timeLost, rootCause, instruction }`); **prompt
  caching** on the static track knowledge + coaching rules + tool schemas, with
  the volatile per-lap data sent after the cached prefix.

The model is deliberately the *last and thinnest* stage. Everything it says is
backed by a number computed upstream.

## 9. Build roadmap

Each phase is independently useful and shippable.

1. **Ingest + distance model + lap/corner detection.** DovesDataLogger adapter →
   `Session` → distance-resampled laps → auto-detected corners. Deliverable: a
   clean, queryable per-lap data model. No AI.
2. **Self-relative analysis.** Theoretical-best (micro-sector) and personal-best
   deltas; per-corner time loss; consistency metrics. Deliverable: "where you're
   losing time and where you're inconsistent." No AI.
3. **Absolute technique metrics.** g-g/friction-circle usage, smoothness,
   inferred throttle/brake application, momentum/min-corner-speed evaluators.
   Deliverable: technique feedback that doesn't depend on a good reference.
4. **Coaching layer.** Claude verbalization of the ranked insights from phases
   2–3. Deliverable: plain-language debrief.
5. **Later:** external/crowd reference (cloud), real-time mode, ML evaluators
   (lap clustering, anomaly detection, style classification) once a labeled
   corpus exists.

## 10. Open questions

- DovesDataLogger's exact export format and channel set (pins the phase-1
  adapter).
- Track identification: learn start-finish + layout from data, or require a track
  definition? Karting venues are numerous and often unmapped.
- How corner detection thresholds transfer across kart classes and track scales.
- Where the line sits between "engine-health anomaly" and "driver coaching" for
  RPM/temp channels.
- Confidence presentation: how to surface that inferred (throttle) metrics are
  softer than measured ones.

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
