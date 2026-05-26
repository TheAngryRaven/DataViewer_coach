import type { ParsedData } from "@/types/racing";

// Stage-0 data quality (ARCHITECTURE §10). Insight confidence can be no better
// than the data underneath it, so we assess the GPS fix and the logging rate and
// cap confidence accordingly. HDOP/satellite thresholds follow standard GNSS
// guidance; the rate band follows logger practice (see REFERENCES.md).

export type QualityLevel = "good" | "fair" | "poor";

export interface DataQuality {
  sampleRateHz: number;
  /** Median horizontal dilution of precision, or null when the channel is absent. */
  hdop: number | null;
  /** Median satellite count, or null when the channel is absent. */
  satellites: number | null;
  level: QualityLevel;
  /** The lowest confidence label insights may use given this quality (a cap). */
  confidenceCap: "high" | "medium" | "low";
}

function medianChannel(data: ParsedData, id: string): number | null {
  const values: number[] = [];
  for (const sample of data.samples) {
    const value = sample.extraFields[id];
    if (value !== undefined && Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

/**
 * Assess GPS data quality and the confidence cap it implies.
 *
 * - poor: low rate, weak fix (high HDOP), or few satellites -> insights stay advisory.
 * - good: high rate and a strong fix (or no quality channels that contradict it).
 * - fair: everything in between.
 *
 * Missing HDOP/satellite channels are treated as "not contradicting" — rate alone
 * can still pull quality down, but absent fix metrics don't force "poor".
 */
export function assessQuality(data: ParsedData, sampleRateHz: number): DataQuality {
  const hdop = medianChannel(data, "hdop");
  const satellites = medianChannel(data, "satellites");

  const poor =
    sampleRateHz < 8 || (hdop !== null && hdop > 5) || (satellites !== null && satellites < 5);
  const good =
    !poor &&
    sampleRateHz >= 18 &&
    (hdop === null || hdop <= 2) &&
    (satellites === null || satellites >= 8);

  const level: QualityLevel = poor ? "poor" : good ? "good" : "fair";
  const confidenceCap = level === "poor" ? "low" : level === "fair" ? "medium" : "high";
  return { sampleRateHz, hdop, satellites, level, confidenceCap };
}
