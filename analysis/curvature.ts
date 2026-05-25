import type { GpsSample, Lap, LatLon } from "@/types/racing";
import { cumulativeDistanceMeters, resample } from "./distance";

// Path curvature in the distance domain (ARCHITECTURE §5, addon1 §A.3). Curvature
// kappa = d(heading)/d(distance), so it peaks at the geometric apex (point of
// minimum radius). Heading comes from the host (course-over-ground, or its own
// position-derived bearing); we fall back to bearings between positions when a
// sample carries none. Curvature is softer than speed (it depends on GPS path
// quality), so it is smoothed before use and treated as advisory (addon1 §A.6).

const DEG2RAD = Math.PI / 180;

/** Initial bearing from `a` to `b`, in radians (-pi..pi; 0 = north, +pi/2 = east). */
export function bearingRad(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG2RAD;
  const lat2 = b.lat * DEG2RAD;
  const dLon = (b.lon - a.lon) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/** Remove 2*pi discontinuities so an angle sequence is continuous (for differencing). */
export function unwrapRadians(values: number[]): number[] {
  const out = [...values];
  for (let i = 1; i < out.length; i++) {
    let delta = out[i] - out[i - 1];
    while (delta > Math.PI) {
      out[i] -= 2 * Math.PI;
      delta = out[i] - out[i - 1];
    }
    while (delta < -Math.PI) {
      out[i] += 2 * Math.PI;
      delta = out[i] - out[i - 1];
    }
  }
  return out;
}

/** Per-sample heading (radians): the source heading when present, else position bearings. */
export function sampleHeadingsRad(samples: GpsSample[]): number[] {
  const n = samples.length;
  if (n === 0) return [];
  if (samples[0].heading !== undefined) {
    return samples.map((s) => (s.heading ?? 0) * DEG2RAD);
  }
  if (n === 1) return [0];
  return samples.map((s, i) =>
    i === 0 ? bearingRad(samples[0], samples[1]) : bearingRad(samples[i - 1], samples[i]),
  );
}

/**
 * Signed curvature (1/m) along a heading trace sampled at `distance` (metres):
 * central differences interior, one-sided at the ends. Sign encodes turn
 * direction; corner detection uses the magnitude.
 */
export function curvatureFromHeading(headingRad: number[], distance: number[]): number[] {
  const n = headingRad.length;
  if (n < 2 || distance.length !== n) return new Array<number>(n).fill(0);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = i === 0 ? 0 : i - 1;
    const hi = i === n - 1 ? n - 1 : i + 1;
    const ds = distance[hi] - distance[lo];
    out[i] = ds > 0 ? (headingRad[hi] - headingRad[lo]) / ds : 0;
  }
  return out;
}

/** Curvature (1/m) for a lap, resampled onto `grid`; zeros when too short to compute. */
export function curvatureForLap(samples: GpsSample[], lap: Lap, grid: number[]): number[] {
  const slice = samples.slice(lap.startIndex, lap.endIndex + 1);
  if (slice.length < 3) return grid.map(() => 0);
  const distance = cumulativeDistanceMeters(slice);
  const heading = unwrapRadians(sampleHeadingsRad(slice));
  return resample(distance, curvatureFromHeading(heading, distance), grid);
}
