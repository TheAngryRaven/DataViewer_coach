import type { Lap } from "@/types/racing";

/** Format a lap time in seconds as `m:ss.mmm` (e.g. 83.456 -> "1:23.456"). */
export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, "0")}`;
}

/** The lap with the lowest lap time, or null if there are none. */
export function fastestLap(laps: Lap[]): Lap | null {
  let best: Lap | null = null;
  for (const lap of laps) {
    if (best === null || lap.lapTime < best.lapTime) best = lap;
  }
  return best;
}

/** Find a lap by its number, or null if not present / no lap selected. */
export function findLap(laps: Lap[], lapNumber: number | null): Lap | null {
  if (lapNumber === null) return null;
  return laps.find((lap) => lap.lapNumber === lapNumber) ?? null;
}

/**
 * Time delta (seconds) of the selected lap relative to the session best.
 * Positive = slower than best, 0 = is the best. Null when nothing to compare.
 */
export function deltaToFastest(
  laps: Lap[],
  lapNumber: number | null,
): number | null {
  const selected = findLap(laps, lapNumber);
  const best = fastestLap(laps);
  if (selected === null || best === null) return null;
  return selected.lapTime - best.lapTime;
}

/** Format a signed delta in seconds (e.g. 0.42 -> "+0.420s"). */
export function formatDelta(seconds: number): string {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${Math.abs(seconds).toFixed(3)}s`;
}
