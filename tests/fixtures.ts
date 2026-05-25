import type { FieldMapping, GpsSample, ParsedData } from "@/types/racing";

// Shared synthetic-data builders for the analysis tests. Not a test file itself
// (no `.test.ts`), so Vitest does not collect it as a suite.

export function gpsSample(
  t: number,
  lat: number,
  lon: number,
  speedMps: number,
  extraFields: Record<string, number> = {},
): GpsSample {
  return { t, lat, lon, speedMps, speedMph: 0, speedKph: 0, extraFields };
}

/** A ParsedData carrying the given canonical channel ids (in fieldMappings) and a single sample. */
export function parsedData(
  channelIds: string[],
  firstSampleExtraFields: Record<string, number>,
): ParsedData {
  const fieldMappings: Record<string, FieldMapping> = {};
  for (const id of channelIds) fieldMappings[id] = { name: id, label: id, unit: "" };
  return {
    samples: [gpsSample(0, 0, 0, 0, firstSampleExtraFields)],
    fieldMappings,
    bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
    duration: 0,
  };
}
