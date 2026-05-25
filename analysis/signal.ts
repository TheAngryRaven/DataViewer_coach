import type { GpsSample } from "@/types/racing";

// Small, reusable signal helpers for the deterministic analysis. Loggers vary in
// rate and are noisy, so we measure the rate from timestamps rather than assume
// one, and smooth before differentiating.

/**
 * Effective sample rate (Hz) from the median inter-sample interval. Robust to
 * occasional gaps/dupes; returns 0 when it can't be determined.
 */
export function sampleRateHz(samples: GpsSample[]): number {
  if (samples.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 0) deltas.push(dt);
  }
  if (deltas.length === 0) return 0;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianMs =
    deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
  return medianMs > 0 ? 1000 / medianMs : 0;
}

/** Centered moving average over a window of `2*radius+1` samples (edge-clamped). */
export function movingAverage(values: number[], radius: number): number[] {
  if (radius <= 0 || values.length === 0) return [...values];
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length - 1, i + radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += values[j];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

/**
 * Longitudinal acceleration (m/s^2) along a speed trace sampled at `timeMs`
 * (elapsed milliseconds). Central differences interior, one-sided at the ends;
 * negative = braking. Returns zeros for fewer than two points.
 */
export function longitudinalAccel(speedMps: number[], timeMs: number[]): number[] {
  const n = speedMps.length;
  if (n < 2) return new Array<number>(n).fill(0);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = i === 0 ? 0 : i - 1;
    const hi = i === n - 1 ? n - 1 : i + 1;
    const dtSec = (timeMs[hi] - timeMs[lo]) / 1000;
    out[i] = dtSec > 0 ? (speedMps[hi] - speedMps[lo]) / dtSec : 0;
  }
  return out;
}
