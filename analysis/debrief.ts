import { fastestLap, formatLapTimeMs } from "./insights";
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
  /** One plain-language line: the single most useful takeaway. */
  takeaway: string;
}

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

/** Pick the single most useful plain-language takeaway from the computed signals. */
export function takeaway(
  best: SessionLap | null,
  validCount: number,
  stats: ConsistencyStats | null,
): string {
  if (best === null) return "No complete laps to analyse yet.";
  const bestStr = formatLapTimeMs(best.lapTimeMs);

  if (stats === null || validCount < 2) {
    return `One clean lap so far (best ${bestStr}) — bank a few more to read your consistency.`;
  }

  const gapMs = stats.meanMs - best.lapTimeMs;
  if (gapMs >= MEANINGFUL_GAP_MS) {
    const gapStr = (gapMs / 1000).toFixed(1);
    return `Your pace is there — best lap ${bestStr} — but you're losing ~${gapStr}s per lap to inconsistency; tightening that up is your biggest gain.`;
  }

  const stdevStr = (stats.stdevMs / 1000).toFixed(2);
  return `Tight session — laps within ±${stdevStr}s of each other. Pace, not consistency, is where the time is now.`;
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
