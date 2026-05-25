import type { GpsSample, Lap, LatLon } from "@/types/racing";

// Distance-domain interpreter (ARCHITECTURE §4-5). Pure, deterministic geometry
// that turns the host's time-sampled GPS stream into a distance-indexed view, so
// laps can be overlaid and compared on a common axis. No UI, no model.
//
// Distance is derived from GPS *position* (great-circle steps). Integrating the
// speed channel is an alternative with different noise characteristics; we can
// add it behind the same interface later if position quality demands it.

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lat/lon points, in metres (haversine). */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Cumulative arc length along a sample run, in metres. Same length as the input,
 * starting at 0; monotonically non-decreasing (stationary points add 0).
 */
export function cumulativeDistanceMeters(samples: GpsSample[]): number[] {
  const out = new Array<number>(samples.length);
  let total = 0;
  for (let i = 0; i < samples.length; i++) {
    if (i > 0) total += haversineMeters(samples[i - 1], samples[i]);
    out[i] = total;
  }
  return out;
}

/**
 * Linear interpolation of `ys` at position `x`, where `xs` is sorted
 * non-decreasing. Clamps to the endpoints outside the range; safe across
 * zero-width segments (duplicate xs).
 */
export function interpolateAt(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return Number.NaN;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];

  // Largest index i with xs[i] <= x.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid - 1;
  }

  const span = xs[lo + 1] - xs[lo];
  if (span === 0) return ys[lo];
  const f = (x - xs[lo]) / span;
  return ys[lo] + f * (ys[lo + 1] - ys[lo]);
}

/** Resample `ys` (sampled at `xs`) onto each position in `grid`. */
export function resample(xs: number[], ys: number[], grid: number[]): number[] {
  return grid.map((x) => interpolateAt(xs, ys, x));
}

/** Evenly spaced distance axis of `points` samples spanning `[0, lengthMeters]`. */
export function distanceGrid(lengthMeters: number, points: number): number[] {
  if (points <= 1) return [0];
  const step = lengthMeters / (points - 1);
  return Array.from({ length: points }, (_, i) => i * step);
}

/** A single lap expressed on a distance axis. */
export interface LapProfile {
  lapNumber: number;
  lengthMeters: number;
  /** Distance axis (metres from lap start) the channels below are sampled on. */
  grid: number[];
  /** Speed (m/s) at each grid position. */
  speedMps: number[];
  /** Elapsed time (ms from lap start) at each grid position. */
  elapsedMs: number[];
  /** Optional extra channels (by canonical id) resampled onto the same grid. */
  channels: Record<string, number[]>;
}

/** Samples covered by a lap (endIndex inclusive). */
function lapSamples(samples: GpsSample[], lap: Lap): GpsSample[] {
  return samples.slice(lap.startIndex, lap.endIndex + 1);
}

/** Total GPS path length of a lap, in metres. */
export function lapLengthMeters(samples: GpsSample[], lap: Lap): number {
  const dist = cumulativeDistanceMeters(lapSamples(samples, lap));
  return dist.length > 0 ? dist[dist.length - 1] : 0;
}

/**
 * Build a lap's distance-domain profile by resampling speed and time onto `grid`.
 * Any `channelIds` (canonical `extraFields` keys) are resampled onto it too;
 * missing values resample as NaN so callers can detect gaps.
 */
export function buildLapProfile(
  samples: GpsSample[],
  lap: Lap,
  grid: number[],
  channelIds: string[] = [],
): LapProfile {
  const slice = lapSamples(samples, lap);
  const dist = cumulativeDistanceMeters(slice);
  const startMs = slice.length > 0 ? slice[0].t : lap.startTime;
  const speedYs = slice.map((s) => s.speedMps);
  const elapsedYs = slice.map((s) => s.t - startMs);
  const channels: Record<string, number[]> = {};
  for (const id of channelIds) {
    const ys = slice.map((s) => s.extraFields[id] ?? Number.NaN);
    channels[id] = resample(dist, ys, grid);
  }
  return {
    lapNumber: lap.lapNumber,
    lengthMeters: dist.length > 0 ? dist[dist.length - 1] : 0,
    grid,
    speedMps: resample(dist, speedYs, grid),
    elapsedMs: resample(dist, elapsedYs, grid),
    channels,
  };
}

/** The middle value of a copy-sorted list; NaN when empty. */
function medianOf(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Resample every lap onto one shared distance grid (sized from the median lap
 * length) so they can be overlaid and differenced. Returns the grid plus a
 * profile per lap; an empty lap list yields an empty grid and no profiles.
 */
export function buildComparableProfiles(
  samples: GpsSample[],
  laps: Lap[],
  points: number,
  channelIds: string[] = [],
): { grid: number[]; profiles: LapProfile[] } {
  if (laps.length === 0) return { grid: [], profiles: [] };
  const referenceLength = medianOf(laps.map((lap) => lapLengthMeters(samples, lap)));
  const grid = distanceGrid(referenceLength, points);
  return {
    grid,
    profiles: laps.map((lap) => buildLapProfile(samples, lap, grid, channelIds)),
  };
}

/**
 * Per-distance time delta of `lap` relative to `reference` (ms): positive means
 * `lap` is behind at that distance. Both profiles must share a grid; the result
 * is aligned to the reference grid length.
 */
export function deltaTimeMs(reference: LapProfile, lap: LapProfile): number[] {
  return reference.elapsedMs.map((refMs, i) => lap.elapsedMs[i] - refMs);
}

/** A lap's GPS path with the cumulative distance at each point — for mapping. */
export interface LapTrack {
  positions: LatLon[];
  distances: number[];
}

/** The lap's lat/lon path plus per-point cumulative distance (metres from lap start). */
export function lapTrack(samples: GpsSample[], lap: Lap): LapTrack {
  const slice = lapSamples(samples, lap);
  return {
    positions: slice.map((s) => ({ lat: s.lat, lon: s.lon })),
    distances: cumulativeDistanceMeters(slice),
  };
}

/** Interpolate the lat/lon position at a given distance along a lap track (clamped). */
export function positionAtDistance(track: LapTrack, distanceM: number): LatLon {
  const lats = track.positions.map((p) => p.lat);
  const lons = track.positions.map((p) => p.lon);
  return {
    lat: interpolateAt(track.distances, lats, distanceM),
    lon: interpolateAt(track.distances, lons, distanceM),
  };
}
