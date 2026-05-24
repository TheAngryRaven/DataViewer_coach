import { movingAverage } from "./signal";

// Corner segmentation in the distance domain. We segment on the *speed* trace
// (the architecture's scored quantity, addon1 §A.2): each corner is a prominent
// speed valley (V-Min) bounded by the surrounding speed peaks (braking start ->
// corner exit). This is robust to GPS/heading noise; curvature-based apex-
// *location* refinement (addon1 §A.3) is a later, diagnostic-only addition.

export interface Corner {
  /** 0-based ordinal along the lap. */
  index: number;
  /** Grid index where the corner window begins (preceding speed peak). */
  startIdx: number;
  /** Grid index of the minimum-speed point (V-Min). */
  apexIdx: number;
  /** Grid index where the corner window ends (following speed peak). */
  endIdx: number;
  startDist: number;
  apexDist: number;
  endDist: number;
  /** Speed at the apex (m/s). */
  minSpeedMps: number;
}

export interface CornerOptions {
  /** Moving-average radius applied to speed before detection. */
  smoothRadius: number;
  /** A valley counts as a corner when its prominence is at least this fraction of the speed range. */
  prominenceFrac: number;
  /** ...and at least this absolute drop (m/s), so flat sections don't register. */
  minProminenceMps: number;
}

export const DEFAULT_CORNER_OPTIONS: CornerOptions = {
  smoothRadius: 2,
  prominenceFrac: 0.12,
  minProminenceMps: 1.5,
};

function argmaxInRange(values: number[], lo: number, hi: number): number {
  let best = lo;
  for (let i = lo + 1; i <= hi; i++) if (values[i] > values[best]) best = i;
  return best;
}

function argminInRange(values: number[], lo: number, hi: number): number {
  let best = lo;
  for (let i = lo + 1; i <= hi; i++) if (values[i] < values[best]) best = i;
  return best;
}

function localMinima(values: number[]): number[] {
  const mins: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const downFromLeft = values[i] <= values[i - 1];
    const upToRight = values[i] <= values[i + 1];
    const strict = values[i] < values[i - 1] || values[i] < values[i + 1];
    if (downFromLeft && upToRight && strict) mins.push(i);
  }
  return mins;
}

/**
 * Detect corners on a distance-gridded speed trace. `grid` and `speedMps` must
 * be the same length and share an index space (e.g. a `LapProfile`).
 */
export function detectCorners(
  grid: number[],
  speedMps: number[],
  options: CornerOptions = DEFAULT_CORNER_OPTIONS,
): Corner[] {
  const n = speedMps.length;
  if (n < 3 || grid.length !== n) return [];

  const smooth = movingAverage(speedMps, options.smoothRadius);
  const range = Math.max(...smooth) - Math.min(...smooth);
  if (range <= 0) return [];
  const threshold = Math.max(options.prominenceFrac * range, options.minProminenceMps);

  const valleys = localMinima(smooth);
  const corners: Corner[] = [];

  for (let k = 0; k < valleys.length; k++) {
    const v = valleys[k];
    const leftBound = k === 0 ? 0 : valleys[k - 1];
    const rightBound = k === valleys.length - 1 ? n - 1 : valleys[k + 1];
    const startIdx = argmaxInRange(smooth, leftBound, v);
    const endIdx = argmaxInRange(smooth, v, rightBound);
    if (startIdx >= endIdx) continue;

    const prominence = Math.min(smooth[startIdx], smooth[endIdx]) - smooth[v];
    if (prominence < threshold) continue;

    const apexIdx = argminInRange(speedMps, startIdx, endIdx);
    corners.push({
      index: 0,
      startIdx,
      apexIdx,
      endIdx,
      startDist: grid[startIdx],
      apexDist: grid[apexIdx],
      endDist: grid[endIdx],
      minSpeedMps: speedMps[apexIdx],
    });
  }

  return corners.map((corner, index) => ({ ...corner, index }));
}
