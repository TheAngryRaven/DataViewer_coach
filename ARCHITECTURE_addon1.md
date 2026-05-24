# Architecture Addendum A — Apex & Minimum-Speed Evaluation

Companion to `ARCHITECTURE.md` for `@theangryraven/eye-in-the-sky`. Read after §7
(the reference-lap problem) — this is a worked example of *one evaluator family*
expressed through that framework, not a separate subsystem.

> Status: design / direction, same caveat as the parent doc. The type sketches
> reuse the parent's illustrative interfaces (`Lap`, `grid`, `CornerProfile`,
> `ReferenceSource`) and are likewise not committed. This describes the apex
> evaluators planned for phases 2–3 (§9).

## A.1 Where this fits

The apex work lives entirely in the **[metrics]** and **[evaluate]** stages of the
§4 pipeline. It produces structured insights in the same `{ corner, timeLost,
rootCause, instruction }` shape the coaching layer (§8) consumes, and it draws its
"what good looks like" through the §7 `ReferenceSource` interface — it does not
introduce a parallel notion of a reference. It respects the §3 principles:
deterministic (the LLM never locates an apex or computes a delta), distance-domain
(everything below is indexed on the resampled `grid`, never on time), and
karting-first (§6).

## A.2 Two quantities, treated differently

Per corner we deal with two things, and conflating them is the classic mistake:

- **Minimum corner speed (V-Min) — the headline metric, and it gets scored.** For
  the kart classes we target first (§6), carrying minimum speed *is* the dominant
  skill, and a V-Min deficit propagates down the entire following straight. This is
  where the time is.
- **Apex *location* — diagnostic only, never scored on its own.** Where the slow
  point falls relative to the corner geometry is a *cause* we use to explain a
  V-Min or exit deficit, not a fault in itself. A driver who apexes "late" but
  carries equal-or-better speed than the reference made a valid line choice, not a
  mistake. Penalizing location absolutely is exactly the folklore trap §3.4 and §7
  are built to avoid.

So: V-Min speed feeds scoring and time cost; apex location feeds root-cause and
coaching prose.

## A.3 Locating the apex in the distance domain

Because laps are already resampled onto a common distance `grid` (§5), both points
below land in the same coordinate and are directly comparable across laps and
against a `CornerProfile` reference.

- **V-Min (the driver's chosen slow point):** `argmin(speed)` over the corner's
  distance window. The grid spacing quantizes this, so refine it with a 3-point
  parabolic (quadratic) vertex fit on `speed` vs `distance` around the minimum
  sample — sub-grid precision on both location and speed, with guards (skip if the
  minimum is at a window edge or the parabola opens the wrong way). This matters
  more at logger sample rates than at sim rates; it's cheap and it's the one purely
  mechanical bit worth getting exact.
- **Geometric apex (what the *track* asks for):** `argmax(curvature)` — the point
  of minimum radius — using the smoothed `κ = 1/R` channel we already build in §5.
  This grounds "where the apex is" in measured geometry, with **no hardcoded
  ideal-apex table** and **no dependence on a good reference lap**.

The diagnostic signal is the offset between them:

```ts
// Illustrative.
const apexOffset = distAt(vMin) - distAt(curvaturePeak); // metres along track
// apexOffset > 0  → driver slows *after* the geometric apex (late apex)
// apexOffset < 0  → driver slows *before* it (early apex)
```

For a corner onto a long straight, a late apex (`apexOffset > 0`) is usually
*correct*, so the evaluator reads this offset in context, it does not punish it.

## A.4 The apex evaluators, mapped onto §7's layers

The apex family is additive across the same four reference layers as the rest of
the system:

1. **Absolute / technique (no reference).** Two reference-free signals: (a) **grip
   at the apex** from the g-g / friction circle (§6) — combined g near the apex
   well below the kart's demonstrated envelope means there's unused grip to carry
   more speed, regardless of any lap to compare to; (b) **scrubbing** — lateral g
   with little forward progress through the slow point. These work for a beginner
   with no good lap to their name.
2. **Consistency (self-relative, no "good" needed).** Lap-to-lap variance of V-Min
   *speed* and V-Min *location* per corner. On a dozens-of-short-laps kart session
   (§6) this is one of the most reliable and most actionable signals, and it needs
   no reference at all.
3. **Self-best.** V-Min speed gap versus the §7 **theoretical-best** profile
   (stitched from fastest micro-sectors), with personal-best full lap as the
   simpler first cut. This is the layer that carries a real time cost (A.5).
4. **External / crowd reference (future).** Same gap computation, a better target —
   filled in behind `ReferenceSource` alongside the cloud work, no pipeline change.

The reference layers (3) and (4) consume a per-corner profile:

```ts
// Illustrative — a slice of the §7 CornerProfile relevant to this evaluator.
interface CornerApexRef {
  corner: string;
  vminSpeed: number;     // m/s at the reference's slow point
  vminDist: number;      // grid distance of it (for line/offset context only)
}
```

## A.5 Time cost

We do **not** invent a bespoke momentum formula here. The corner's time cost is the
distance-domain delta-time already integrated against the reference in
[metrics]/[evaluate] (the FastF1-style approach in §3.2). The apex evaluator's job
is **causal attribution**: deciding how much of a corner-window delta is explained
by a V-Min-speed deficit versus line versus braking, so the ranked insight names
the right root cause. The momentum point from §6 is *why* the V-Min deficit
typically dominates the following-straight portion of that delta — which is the
justification for weighting apex speed heavily in karting, not a separate
calculation.

## A.6 Confidence

V-Min speed is derived from GPS speed — measured, high confidence. Apex *location*
and the geometric apex depend on curvature, which depends on GPS path quality and
smoothing, so the location/offset signal is softer and the consistency-of-location
metric softer still. Surface that gap per §10's confidence question: speed-based
apex insights are firm; line/offset insights are advisory.

## A.7 Output contract

The evaluators emit structured records, never prose, in the §8 insight shape. One
per scored corner, carrying the attribution fields the coach needs to stay grounded:

```ts
// Illustrative.
interface ApexInsight {
  corner: string;
  timeLost: number;          // s, attributed share of the corner-window delta
  rootCause: "low_min_speed" | "scrubbing" | "unused_grip" | "inconsistent_apex";
  vminSpeed: number;
  refVminSpeed: number | null;   // null when only absolute/consistency layers fired
  apexOffset: number;            // A.3, signed; context for prose, not a score
  vminSpeedStdev?: number;       // consistency layer
  confidence: number;
  instruction?: string;          // filled by the coach layer, not here
}
```

The §8 coaching layer decides messaging: it only mentions apex *location* when the
offset is meaningful **and** co-occurs with a speed or exit deficit — otherwise the
line was fine and saying so just adds noise.

## A.8 Non-goals / guardrails

- No hardcoded ideal-apex-percentage table keyed on corner type. Geometry comes
  from the curvature channel; speed targets come from `ReferenceSource`.
- Never penalize a line that matches or beats the reference V-Min speed, however
  unusual its apex location.
- The LLM never locates an apex, computes an offset, or estimates a time loss — it
  only verbalizes the records above (§3.1, §8).
- Keep it primitive (§3.5): V-Min refinement and the curvature peak are metric-stage
  functions; the four layers are small evaluators that switch on/off with the
  available reference. No new abstraction beyond the existing `ReferenceSource`.

## A.9 Prior art worth pinning (open)

Tie into the parent's References section. Specifically for apex/min-speed method,
worth verifying against real sources before committing thresholds:

- The minimum-curvature vs minimum-time racing-line distinction (optimal-line
  literature) — clarifies why the geometric apex (κ peak) and the speed-optimal
  slow point legitimately differ, which is the whole basis of A.3.
- MoTeC's "theoretical best" / fastest-sector stitching — the §7 layer-3 target
  construction.
- How the commercial coaches (Track Titan, Trophi.ai, Coach Dave) present
  per-corner min-speed deltas — UX target for the A.7 output.
