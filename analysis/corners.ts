import { movingAverage } from "./signal";

// Corner segmentation in the distance domain, offered two ways:
//
// - "speed": prominent valleys in the *speed* trace. The apex is the V-Min point
//   (the scored quantity, addon1 §A.2); robust to GPS/heading noise.
// - "curvature": prominent peaks in |curvature|. The apex is the *geometric*
//   apex (point of minimum radius, addon1 §A.3); grounded in track geometry but
//   softer (depends on GPS path quality).
//
// Both share one prominence-based segmenter and return the same `Corner` shape,
// so everything downstream (time loss, braking, throttle) is method-agnostic.

export type CornerMethod = "speed" | "curvature";

export interface Corner {
  /** 0-based ordinal along the lap. */
  index: number;
  /** Grid index where the corner window begins (entry: speed peak / low curvature). */
  startIdx: number;
  /** Grid index of the apex (V-Min for "speed", curvature peak for "curvature"). */
  apexIdx: number;
  /** Grid index where the corner window ends (exit: speed peak / low curvature). */
  endIdx: number;
  startDist: number;
  apexDist: number;
  endDist: number;
  /** Minimum speed within the window (m/s). */
  minSpeedMps: number;
}

interface SegmentOptions {
  smoothRadius: number;
  prominenceFrac: number;
  /** Minimum prominence in the signal's own units, so flat sections don't register. */
  minProminence: number;
}

export interface CornerOptions {
  smoothRadius: number;
  prominenceFrac: number;
  /** Minimum speed drop (m/s) for a valley to count as a corner. */
  minProminenceMps: number;
}

export interface CurvatureCornerOptions {
  smoothRadius: number;
  prominenceFrac: number;
  /** Minimum |curvature| rise (1/m) for a peak to count as a corner. */
  minProminencePerM: number;
}

export const DEFAULT_CORNER_OPTIONS: CornerOptions = {
  smoothRadius: 2,
  prominenceFrac: 0.12,
  minProminenceMps: 1.5,
};

export const DEFAULT_CURVATURE_OPTIONS: CurvatureCornerOptions = {
  smoothRadius: 3,
  prominenceFrac: 0.15,
  minProminencePerM: 0.005,
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

/**
 * Indices of local minima, collapsing equal-valued plateaus to their centre so a
 * flat valley registers once (not as two edge minima). A minimum requires a
 * strict descent before and a strict ascent after the plateau.
 */
function localMinima(values: number[]): number[] {
  const mins: number[] = [];
  const n = values.length;
  let i = 1;
  while (i < n - 1) {
    if (values[i] < values[i - 1]) {
      let j = i;
      while (j < n - 1 && values[j + 1] === values[i]) j++;
      if (j < n - 1 && values[j + 1] > values[i]) mins.push(Math.floor((i + j) / 2));
      i = j + 1;
    } else {
      i++;
    }
  }
  return mins;
}

interface Segment {
  startIdx: number;
  valleyIdx: number;
  endIdx: number;
}

/**
 * Find prominent valleys in `values`: each valley is bounded by the surrounding
 * peaks, and kept only when its prominence (the lower bounding peak minus the
 * valley) clears the threshold. To find peaks instead, pass the negated signal.
 */
function segmentByValleys(values: number[], options: SegmentOptions): Segment[] {
  const n = values.length;
  if (n < 3) return [];
  const smooth = movingAverage(values, options.smoothRadius);
  const range = Math.max(...smooth) - Math.min(...smooth);
  if (range <= 0) return [];
  const threshold = Math.max(options.prominenceFrac * range, options.minProminence);

  const valleys = localMinima(smooth);
  const segments: Segment[] = [];
  for (let k = 0; k < valleys.length; k++) {
    const v = valleys[k];
    const leftBound = k === 0 ? 0 : valleys[k - 1];
    const rightBound = k === valleys.length - 1 ? n - 1 : valleys[k + 1];
    const startIdx = argmaxInRange(smooth, leftBound, v);
    const endIdx = argmaxInRange(smooth, v, rightBound);
    if (startIdx >= endIdx) continue;
    const prominence = Math.min(smooth[startIdx], smooth[endIdx]) - smooth[v];
    if (prominence < threshold) continue;
    segments.push({ startIdx, valleyIdx: v, endIdx });
  }
  return segments;
}

/** Corners as prominent speed valleys; apex = V-Min. */
export function detectCornersBySpeed(
  grid: number[],
  speedMps: number[],
  options: CornerOptions = DEFAULT_CORNER_OPTIONS,
): Corner[] {
  if (grid.length !== speedMps.length) return [];
  const segments = segmentByValleys(speedMps, {
    smoothRadius: options.smoothRadius,
    prominenceFrac: options.prominenceFrac,
    minProminence: options.minProminenceMps,
  });
  return segments.map((segment, index) => {
    const apexIdx = argminInRange(speedMps, segment.startIdx, segment.endIdx);
    return {
      index,
      startIdx: segment.startIdx,
      apexIdx,
      endIdx: segment.endIdx,
      startDist: grid[segment.startIdx],
      apexDist: grid[apexIdx],
      endDist: grid[segment.endIdx],
      minSpeedMps: speedMps[apexIdx],
    };
  });
}

/** Corners as prominent |curvature| peaks; apex = geometric apex (curvature peak). */
export function detectCornersByCurvature(
  grid: number[],
  curvaturePerM: number[],
  speedMps: number[],
  options: CurvatureCornerOptions = DEFAULT_CURVATURE_OPTIONS,
): Corner[] {
  if (grid.length !== curvaturePerM.length || grid.length !== speedMps.length) return [];
  const absKappa = curvaturePerM.map(Math.abs);
  // Peaks of |kappa| are valleys of -|kappa|; reuse the valley segmenter.
  const segments = segmentByValleys(
    absKappa.map((v) => -v),
    {
      smoothRadius: options.smoothRadius,
      prominenceFrac: options.prominenceFrac,
      minProminence: options.minProminencePerM,
    },
  );
  return segments.map((segment, index) => {
    const apexIdx = argmaxInRange(absKappa, segment.startIdx, segment.endIdx);
    const minSpeedIdx = argminInRange(speedMps, segment.startIdx, segment.endIdx);
    return {
      index,
      startIdx: segment.startIdx,
      apexIdx,
      endIdx: segment.endIdx,
      startDist: grid[segment.startIdx],
      apexDist: grid[apexIdx],
      endDist: grid[segment.endIdx],
      minSpeedMps: speedMps[minSpeedIdx],
    };
  });
}
