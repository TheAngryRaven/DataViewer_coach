import { formatSpeed } from "./insights";
import type { ApexOffset, CornerConsistency, CornerDelta, CornerExit } from "./segments";

// The Stage-1 -> Stage-2 boundary (ARCHITECTURE addon2 §B.2, addon1 §A.7).
//
// We turn the raw per-corner metrics into *structured, attributed, confidence-
// tagged* records. This is the contract the free templated debrief renders AND
// the contract a future AI coach reasons over — the model phrases and prioritizes
// these records, it NEVER invents a number that isn't in `evidence`.
//
// Keep the record pure and unit-agnostic (no prose, no display units). Phrasing
// lives in `describeCornerInsight` so the free tier and an AI tier can both sit
// on top of the same structured record.

/**
 * Why a corner lost time. A deliberately small, honest set for now; the richer
 * causes in addon1 §A.7 (scrubbing, unused_grip, inconsistent_apex) need a
 * friction circle / cross-lap variance we don't compute yet.
 */
export type CornerRootCause =
  | "inconsistent_apex" // minimum corner speed swings lap-to-lap — repeat it before chasing pace
  | "low_min_speed" // carried less speed through the slow point
  | "corner_execution" // time lost but apex speed matched — entry/line/exit, unresolved at this fidelity
  | "none"; // within noise

/** Coarse, honest confidence. Driven by attribution clarity today; GPS/data quality (Stage 0) folds in later. */
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

/**
 * Attribute a single corner's time loss to a root cause with a confidence.
 * Arbitration is single-cause but ordered:
 *   1. high lap-to-lap V-Min variance -> `inconsistent_apex`. Consistency is the
 *      prerequisite to pace (REFERENCES.md: Speed Secrets, and the driver-authored
 *      smoothness canon), so when a corner genuinely swings, that's the message
 *      even if this lap was also slow.
 *   2. a clear apex-speed deficit -> `low_min_speed` (firm on exit-critical
 *      corners, where it compounds down the straight — momentum / exit priority).
 *   3. time lost with apex speed matching the reference -> `corner_execution`,
 *      stated honestly at low confidence rather than guessed.
 */
export function cornerInsight(
  delta: CornerDelta,
  exit: CornerExit | undefined,
  apex: ApexOffset | undefined,
  consistency: CornerConsistency | undefined,
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): CornerInsight {
  const minSpeedGapMps = delta.referenceMinSpeedMps - delta.subjectMinSpeedMps;
  const exitCritical = exit?.exitCritical ?? false;
  const apexOffsetM = apex?.confident ? apex.offsetM : null;
  const vMinStdevMps = consistency && consistency.sampleSize >= 2 ? consistency.vMinStdevMps : null;

  let rootCause: CornerRootCause;
  let confidence: InsightConfidence;
  if (delta.timeLostMs < thresholds.minTimeLostMs) {
    rootCause = "none";
    confidence = "high";
  } else if (vMinStdevMps !== null && vMinStdevMps >= thresholds.inconsistentVminStdevMps) {
    rootCause = "inconsistent_apex";
    // More laps -> a more trustworthy variance read.
    confidence = (consistency?.sampleSize ?? 0) >= 4 ? "high" : "medium";
  } else if (minSpeedGapMps >= thresholds.minSpeedGapMps) {
    rootCause = "low_min_speed";
    confidence = exitCritical ? "high" : "medium";
  } else {
    rootCause = "corner_execution";
    confidence = "low";
  }

  return {
    cornerIndex: delta.cornerIndex,
    apexDist: delta.apexDist,
    timeLostMs: delta.timeLostMs,
    rootCause,
    confidence,
    evidence: { minSpeedGapMps, exitCritical, apexOffsetM, vMinStdevMps },
  };
}

/**
 * Build attributed insights for every compared corner, ranked by time lost,
 * dropping the on-pace ones. Joins the per-corner deltas with exit and apex
 * context by corner index.
 */
export function buildCornerInsights(
  deltas: CornerDelta[],
  exits: CornerExit[],
  apex: ApexOffset[],
  consistency: CornerConsistency[],
  thresholds: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): CornerInsight[] {
  const exitByCorner = new Map(exits.map((e) => [e.cornerIndex, e]));
  const apexByCorner = new Map(apex.map((a) => [a.cornerIndex, a]));
  const consistencyByCorner = new Map(consistency.map((c) => [c.cornerIndex, c]));
  return deltas
    .map((delta) =>
      cornerInsight(
        delta,
        exitByCorner.get(delta.cornerIndex),
        apexByCorner.get(delta.cornerIndex),
        consistencyByCorner.get(delta.cornerIndex),
        thresholds,
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
