import type { Corner } from "./corners";

// Friction-circle / grip analysis (addon1 §A.4 layer 1). Lateral acceleration is
// derived from GPS as a_lat = v^2 * |kappa| (basic vehicle dynamics), combined
// with the longitudinal accel we already get from the speed trace. This is
// ADVISORY: GPS-derived g is coarser than a real accelerometer, and even logged
// g is often steering/dash-mounted (e.g. MyChron), not chassis-fixed, so treat
// these reads as directional, not absolute (see REFERENCES.md).

/** Lateral acceleration (m/s^2) from GPS path: a_lat = v^2 * |kappa|. */
export function lateralAccelMps2(speedMps: number[], curvaturePerM: number[]): number[] {
  return speedMps.map((v, i) => v * v * Math.abs(curvaturePerM[i] ?? 0));
}

/** Combined acceleration magnitude (m/s^2) from lateral and longitudinal components. */
export function combinedAccelMps2(latAccel: number[], longAccel: number[]): number[] {
  return latAccel.map((lat, i) => Math.hypot(lat, longAccel[i] ?? 0));
}

/**
 * Demonstrated grip envelope (m/s^2): a high percentile of combined accel, so a
 * single noisy spike doesn't define the limit. This is the car's shown ceiling
 * on the analysed lap, the reference for "unused grip".
 */
export function gripEnvelopeMps2(combinedAccel: number[], percentile = 0.95): number {
  const finite = combinedAccel.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(percentile * (sorted.length - 1))));
  return sorted[idx];
}

export interface CornerGrip {
  cornerIndex: number;
  apexLatAccelMps2: number;
  apexCombinedAccelMps2: number;
  /** apexCombined / envelope (0..~1); how much of the demonstrated grip is used at the apex. */
  envelopeUtil: number;
  /** Clearly under the grip limit at the apex — room to carry more speed. */
  unusedGrip: boolean;
  /** Holding minimum speed over a wide arc under lateral load — scrubbing speed. */
  scrubbing: boolean;
}

export interface GripOptions {
  envelopePercentile: number;
  /** At/below this envelope utilisation, the apex reads as having unused grip. Provisional heuristic — tune. */
  unusedGripUtil: number;
  /** Must be cornering at least this hard (m/s^2) to talk about grip/scrubbing. Provisional heuristic — tune. */
  minLatAccelMps2: number;
  /** Speed within this of V-Min counts as "in the slow region" (m/s). Provisional heuristic — tune. */
  scrubSpeedTolMps: number;
  /** Slow region longer than this fraction of the corner window reads as scrubbing. Provisional heuristic — tune. */
  scrubArcFrac: number;
}

export const DEFAULT_GRIP_OPTIONS: GripOptions = {
  envelopePercentile: 0.95,
  unusedGripUtil: 0.85,
  minLatAccelMps2: 5,
  scrubSpeedTolMps: 1,
  scrubArcFrac: 0.35,
};

function argMinIndex(values: number[], lo: number, hi: number): number {
  let best = lo;
  for (let i = lo + 1; i <= hi; i++) if (values[i] < values[best]) best = i;
  return best;
}

/**
 * Per-corner grip read on the supplied lap's channels. The apex is the lap's own
 * V-Min within the window, so the grip numbers match the lap whose speed is given.
 */
export function cornerGrip(
  corners: Corner[],
  grid: number[],
  speedMps: number[],
  latAccel: number[],
  longAccel: number[],
  envelopeMps2: number,
  options: GripOptions = DEFAULT_GRIP_OPTIONS,
): CornerGrip[] {
  return corners.map((corner) => {
    const apex = argMinIndex(speedMps, corner.startIdx, corner.endIdx);
    const apexLat = latAccel[apex];
    const apexCombined = Math.hypot(apexLat, longAccel[apex]);
    const envelopeUtil = envelopeMps2 > 0 ? apexCombined / envelopeMps2 : 0;
    const cornering = apexLat >= options.minLatAccelMps2;

    const vmin = speedMps[apex];
    let lo = apex;
    let hi = apex;
    while (lo > corner.startIdx && speedMps[lo - 1] <= vmin + options.scrubSpeedTolMps) lo--;
    while (hi < corner.endIdx && speedMps[hi + 1] <= vmin + options.scrubSpeedTolMps) hi++;
    const cornerLenM = grid[corner.endIdx] - grid[corner.startIdx];
    const arcFrac = cornerLenM > 0 ? (grid[hi] - grid[lo]) / cornerLenM : 0;

    const scrubbing = cornering && arcFrac >= options.scrubArcFrac;
    const unusedGrip = cornering && !scrubbing && envelopeUtil <= options.unusedGripUtil;
    return {
      cornerIndex: corner.index,
      apexLatAccelMps2: apexLat,
      apexCombinedAccelMps2: apexCombined,
      envelopeUtil,
      unusedGrip,
      scrubbing,
    };
  });
}
