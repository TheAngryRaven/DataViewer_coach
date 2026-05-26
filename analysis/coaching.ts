import { formatSpeed } from "./insights";
import type { ApexOffset, CornerConsistency, CornerDelta, CornerExit } from "./segments";
import type { CornerGrip } from "./grip";

// The Stage-1 -> Stage-2 boundary (ARCHITECTURE addon2 §B.2, addon1 §A.7).
//
// We turn the raw per-corner metrics into *structured, attributed, confidence-
// tagged* records. This is the contract the free templated debrief renders AND
// the contract a future AI coach reasons over — the model phrases and prioritizes
// these records, it NEVER invents a number that isn't in `evidence`.
//
// Keep the record pure and unit-agnostic (no prose, no display units). Phrasing
// lives in `describeCornerInsight`.

/**
 * Why a corner lost time. `scrubbing`/`unused_grip` come from the GPS-derived
 * friction circle and are advisory (addon1 §A.4 layer 1, §A.6).
 */
export type CornerRootCause =
  | "inconsistent_apex" // minimum corner speed swings lap-to-lap — repeat it before chasing pace
  | "scrubbing" // sliding through the slow point — speed washed off under lateral load
  | "unused_grip" // under the grip limit at the apex — room to carry more speed
  | "low_min_speed" // carried less speed through the slow point (cause otherwise unresolved)
  | "corner_execution" // time lost but apex speed matched — entry/line/exit, unresolved at this fidelity
  | "none"; // within noise

/** Coarse, honest confidence. Capped by Stage-0 data quality; grip causes stay advisory. */
export type InsightConfidence = "high" | "medium" | "low";

export interface CornerInsight {
  cornerIndex: number;
  apexDist: number;
  /** Time lost vs the reference (best) lap across the corner window, ms (>0 = slower). */
  timeLostMs: number;
  rootCause: CornerRootCause;
  confidence: InsightConfidence;
  /** The numbers behind the attribution. Downstream (templates or model) reads these; it never adds to them. */
  evidence: {
    /** Reference minus subject apex speed (m/s); >0 = subject slower at the apex. */
    minSpeedGapMps: number;
    /** Does a straight follow this corner? (low min speed compounds when true). */
    exitCritical: boolean;
    /** V-Min vs geometric apex offset (m), or null when the geometric apex is ill-defined. */
    apexOffsetM: number | null;
    /** Lap-to-lap V-Min stdev (m/s), or null with fewer than two laps. */
    vMinStdevMps: number | null;
    /** Grip used at the apex (combined / demonstrated envelope), or null when no grip read. */
    envelopeUtil: number | null;
  };
}

export interface InsightThresholds {
  /** Below this, a corner is treated as on-pace (noise floor). Provisional heuristic — tune. */
  minTimeLostMs: number;
  /** Apex-speed deficit (m/s) that counts as "carrying less speed". Provisional heuristic — tune. */
  minSpeedGapMps: number;
  /** Lap-to-lap V-Min stdev (m/s) above which a corner reads as inconsistent. Provisional heuristic — tune. */
  inconsistentVminStdevMps: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  minTimeLostMs: 50,
  minSpeedGapMps: 0.3,
  inconsistentVminStdevMps: 0.7,
};

/** Everything known about one corner, joined from the various analyses. */
export interface CornerContext {
  delta: CornerDelta;
  exit?: CornerExit;
  apex?: ApexOffset;
  consistency?: CornerConsistency;
  grip?: CornerGrip;
}

const CONFIDENCE_RANK: Record<InsightConfidence, number> = { low: 0, medium: 1, high: 2 };

function capConfidence(value: InsightConfidence, cap: InsightConfidence): InsightConfidence {
  return CONFIDENCE_RANK[value] <= CONFIDENCE_RANK[cap] ? value : cap;
}

/**
 * Attribute a single corner's time loss to a root cause with a confidence.
 * Single-cause but ordered:
 *   1. high lap-to-lap V-Min variance -> `inconsistent_apex` (consistency is the
 *      prerequisite to pace — REFERENCES.md).
 *   2. an apex-speed deficit, refined by the friction circle -> `scrubbing`
 *      (sliding), `unused_grip` (room to push), else `low_min_speed`.
 *   3. time lost with apex speed matching the reference -> `corner_execution`.
 * `confidenceCap` (Stage-0 data quality) limits the result; grip causes are
 * advisory and never exceed "low".
 */
export function cornerInsight(
  context: CornerContext,
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
  confidenceCap: InsightConfidence = "high",
): CornerInsight {
  const { delta, exit, apex, consistency, grip } = context;
  const minSpeedGapMps = delta.referenceMinSpeedMps - delta.subjectMinSpeedMps;
  const exitCritical = exit?.exitCritical ?? false;
  const apexOffsetM = apex?.confident ? apex.offsetM : null;
  const vMinStdevMps = consistency && consistency.sampleSize >= 2 ? consistency.vMinStdevMps : null;
  const envelopeUtil = grip ? grip.envelopeUtil : null;

  let rootCause: CornerRootCause;
  let confidence: InsightConfidence;
  if (delta.timeLostMs < thresholds.minTimeLostMs) {
    rootCause = "none";
    confidence = "high";
  } else if (vMinStdevMps !== null && vMinStdevMps >= thresholds.inconsistentVminStdevMps) {
    rootCause = "inconsistent_apex";
    confidence = (consistency?.sampleSize ?? 0) >= 4 ? "high" : "medium";
  } else if (minSpeedGapMps >= thresholds.minSpeedGapMps) {
    if (grip?.scrubbing) {
      rootCause = "scrubbing";
      confidence = "low"; // GPS-derived friction circle — advisory
    } else if (grip?.unusedGrip) {
      rootCause = "unused_grip";
      confidence = "low"; // GPS-derived friction circle — advisory
    } else {
      rootCause = "low_min_speed";
      confidence = exitCritical ? "high" : "medium";
    }
  } else {
    rootCause = "corner_execution";
    confidence = "low";
  }

  return {
    cornerIndex: delta.cornerIndex,
    apexDist: delta.apexDist,
    timeLostMs: delta.timeLostMs,
    rootCause,
    confidence: capConfidence(confidence, confidenceCap),
    evidence: { minSpeedGapMps, exitCritical, apexOffsetM, vMinStdevMps, envelopeUtil },
  };
}

/**
 * Build attributed insights for every compared corner, ranked by time lost,
 * dropping the on-pace ones. Joins per-corner delta/exit/apex/consistency/grip
 * by corner index; `confidenceCap` comes from Stage-0 data quality.
 */
export function buildCornerInsights(
  deltas: CornerDelta[],
  exits: CornerExit[],
  apex: ApexOffset[],
  consistency: CornerConsistency[],
  grip: CornerGrip[],
  confidenceCap: InsightConfidence = "high",
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): CornerInsight[] {
  const exitByCorner = new Map(exits.map((e) => [e.cornerIndex, e]));
  const apexByCorner = new Map(apex.map((a) => [a.cornerIndex, a]));
  const consistencyByCorner = new Map(consistency.map((c) => [c.cornerIndex, c]));
  const gripByCorner = new Map(grip.map((g) => [g.cornerIndex, g]));
  return deltas
    .map((delta) =>
      cornerInsight(
        {
          delta,
          exit: exitByCorner.get(delta.cornerIndex),
          apex: apexByCorner.get(delta.cornerIndex),
          consistency: consistencyByCorner.get(delta.cornerIndex),
          grip: gripByCorner.get(delta.cornerIndex),
        },
        thresholds,
        confidenceCap,
      ),
    )
    .filter((insight) => insight.rootCause !== "none")
    .sort((a, b) => b.timeLostMs - a.timeLostMs);
}

const MPS_TO_KPH = 3.6;
const MPS_TO_MPH = 2.2369362920544;

/**
 * Free-tier templated phrasing of an insight record. Reads only the record's own
 * fields — adds no new numbers. An AI tier would replace this with richer
 * prose/prioritization over the exact same record.
 */
export function describeCornerInsight(insight: CornerInsight, useKph: boolean): string {
  const corner = insight.cornerIndex + 1;
  const secs = (insight.timeLostMs / 1000).toFixed(2);
  const gap = formatSpeed(
    insight.evidence.minSpeedGapMps * MPS_TO_MPH,
    insight.evidence.minSpeedGapMps * MPS_TO_KPH,
    useKph,
  );
  switch (insight.rootCause) {
    case "inconsistent_apex": {
      const swing = formatSpeed(
        (insight.evidence.vMinStdevMps ?? 0) * MPS_TO_MPH,
        (insight.evidence.vMinStdevMps ?? 0) * MPS_TO_KPH,
        useKph,
      );
      return `Corner ${corner}: losing ~${secs}s — your minimum speed here swings about ${swing} (1 sigma) lap to lap. Repeating the same line and speed is the bigger gain than chasing more pace.`;
    }
    case "scrubbing":
      return `Corner ${corner}: losing ~${secs}s — scrubbing speed through the slow point (sliding under lateral load rather than rolling through). Likely too much steering/early apex. [GPS-derived, advisory]`;
    case "unused_grip":
      return `Corner ${corner}: losing ~${secs}s — apex looks under the grip limit (~${Math.round((insight.evidence.envelopeUtil ?? 0) * 100)}% of demonstrated), so there's room to carry more speed. [GPS-derived, advisory]`;
    case "low_min_speed":
      return insight.evidence.exitCritical
        ? `Corner ${corner}: losing ~${secs}s — about ${gap} less at the apex onto a straight, so it compounds down the following straight.`
        : `Corner ${corner}: losing ~${secs}s — about ${gap} less minimum speed than your best.`;
    case "corner_execution":
      return `Corner ${corner}: losing ~${secs}s with apex speed matching your best — the loss is in entry/line/exit (needs more channels to pin down).`;
    case "none":
      return `Corner ${corner}: on your best pace.`;
  }
}
