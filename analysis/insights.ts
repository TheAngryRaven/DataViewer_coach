import { formatDecimal } from "@/lib/i18n/format";

/** Format a lap time in seconds as `m:ss.mmm` (e.g. 83.456 -> "1:23.456"). The
 *  seconds' decimal separator follows `locale` (e.g. "1:23,456" in fr/de). */
export function formatLapTime(seconds: number, locale = "en"): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${formatDecimal(remainder, locale, 3).padStart(6, "0")}`;
}

/**
 * Format a lap time given in milliseconds (the host's unit) as `m:ss.mmm`.
 * The host `Lap` carries `lapTimeMs`; converting here is the single ms->s seam.
 */
export function formatLapTimeMs(ms: number, locale = "en"): string {
  return formatLapTime(ms / 1000, locale);
}

/** Format a speed pair as the user's chosen unit, e.g. "62.1 mph" / "100.0 km/h".
 *  The number follows `locale`; the unit (a separate axis) is appended verbatim. */
export function formatSpeed(mph: number, kph: number, useKph: boolean, locale = "en"): string {
  return useKph ? `${formatDecimal(kph, locale, 1)} km/h` : `${formatDecimal(mph, locale, 1)} mph`;
}

/** The lap with the lowest lap time, or null if there are none. */
export function fastestLap<T extends { lapTimeMs: number }>(laps: T[]): T | null {
  let best: T | null = null;
  for (const lap of laps) {
    if (best === null || lap.lapTimeMs < best.lapTimeMs) best = lap;
  }
  return best;
}
