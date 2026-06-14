import { fastestLap } from "./insights";
import type { Session, SessionLap } from "./session";

// Pure, deterministic, local Stage-1 debrief. No model, no network. Everything
// here is computed from the data the host handed us; nothing is fabricated.

/** A lap is treated as valid (clean) when it is not a slow outlier (out/in/aborted lap). */
export const VALID_LAP_MEDIAN_FACTOR = 1.4;

/** Below this average gap to your own best, a session reads as "tight" rather than inconsistent. */
const MEANINGFUL_GAP_MS = 250;

export interface ConsistencyStats {
  /** Mean lap time of the valid laps (ms). */
  meanMs: number;
  /** Sample standard deviation of valid lap times (ms). */
  stdevMs: number;
  /** Max - min of valid lap times (ms). */
  spreadMs: number;
  /** Number of valid laps the stats were computed over. */
  sampleSize: number;
}

export interface SessionDebrief {
  lapsAnalysed: number;
  validLaps: number;
  best: { lapNumber: number; lapTimeMs: number } | null;
  consistency: ConsistencyStats | null;
  /** Stitched best-sector target (ms), or null when the data carries no sectors. */
  theoreticalBestMs: number | null;
  topSpeedMph: number | null;
  topSpeedKph: number | null;
  /** The single most useful takeaway as a message descriptor; the panel phrases
   *  + translates it (raw ms values stay unit/language-agnostic here). */
  takeaway: TakeawayMessage;
}

/**
 * The single most useful takeaway, as a discriminated message descriptor. The
 * prose template lives in the `coach` i18n namespace (`takeaway.<key>`); the
 * panel formats the raw ms values and translates. Keeping this structured (not a
 * baked English string) is what lets the takeaway be localized + AI-rephrased.
 */
export type TakeawayMessage =
  | { key: "noLaps" }
  | { key: "oneLap"; bestMs: number }
  | { key: "inconsistent"; bestMs: number; gapMs: number }
  | { key: "tight"; stdevMs: number };

/** Median of a non-empty list; NaN for an empty one. */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Cheap validity gate: drop slow outliers (out/in/aborted laps) so they don't
 * pollute the consistency read. A lap is valid when within VALID_LAP_MEDIAN_FACTOR
 * of the median lap time. With a single lap, that lap is valid by definition.
 */
export function validSessionLaps(laps: SessionLap[]): SessionLap[] {
  if (laps.length <= 1) return [...laps];
  const cutoff = median(laps.map((lap) => lap.lapTimeMs)) * VALID_LAP_MEDIAN_FACTOR;
  return laps.filter((lap) => lap.lapTimeMs <= cutoff);
}

/** Consistency stats over the given lap times (ms); null with fewer than two laps. */
export function consistency(timesMs: number[]): ConsistencyStats | null {
  if (timesMs.length < 2) return null;
  const meanMs = timesMs.reduce((sum, t) => sum + t, 0) / timesMs.length;
  const variance =
    timesMs.reduce((sum, t) => sum + (t - meanMs) ** 2, 0) / (timesMs.length - 1);
  return {
    meanMs,
    stdevMs: Math.sqrt(variance),
    spreadMs: Math.max(...timesMs) - Math.min(...timesMs),
    sampleSize: timesMs.length,
  };
}

/**
 * Theoretical best: sum of the fastest time recorded in each sector across the
 * session (a stitched target). Null unless the laps carry sector splits.
 */
export function theoreticalBestMs(laps: SessionLap[]): number | null {
  const keys = ["s1", "s2", "s3"] as const;
  let total = 0;
  let found = false;
  for (const key of keys) {
    let best: number | null = null;
    for (const lap of laps) {
      const value = lap.sectors?.[key];
      if (value !== undefined && (best === null || value < best)) best = value;
    }
    if (best !== null) {
      total += best;
      found = true;
    }
  }
  return found ? total : null;
}

/** Pick the single most useful takeaway from the computed signals (as a message
 *  descriptor — phrasing/formatting is the panel's job). */
export function takeaway(
  best: SessionLap | null,
  validCount: number,
  stats: ConsistencyStats | null,
): TakeawayMessage {
  if (best === null) return { key: "noLaps" };

  if (stats === null || validCount < 2) {
    return { key: "oneLap", bestMs: best.lapTimeMs };
  }

  const gapMs = stats.meanMs - best.lapTimeMs;
  if (gapMs >= MEANINGFUL_GAP_MS) {
    return { key: "inconsistent", bestMs: best.lapTimeMs, gapMs };
  }

  return { key: "tight", stdevMs: stats.stdevMs };
}

/** Compute the full session-level debrief from the internal Session. */
export function buildDebrief(session: Session): SessionDebrief {
  const { laps } = session;
  const valid = validSessionLaps(laps);
  const best = fastestLap(laps);
  const stats = consistency(valid.map((lap) => lap.lapTimeMs));

  return {
    lapsAnalysed: laps.length,
    validLaps: valid.length,
    best: best ? { lapNumber: best.lapNumber, lapTimeMs: best.lapTimeMs } : null,
    consistency: stats,
    theoreticalBestMs: theoreticalBestMs(laps),
    topSpeedMph: laps.length > 0 ? session.topSpeedMph : null,
    topSpeedKph: laps.length > 0 ? session.topSpeedKph : null,
    takeaway: takeaway(best, valid.length, stats),
  };
}
