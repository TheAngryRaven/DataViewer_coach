import type { Lap, LapSectors, ParsedData } from "@/types/racing";

// Thin internal adapter: host ParsedData/Lap/Course -> our own Session model.
// This is the Stage-0/1 "interpreter". For the first debrief we only need lap
// times + speeds, so it stays minimal; richer views (cumulative distance, a
// distance-resampled per-lap grid for cross-lap comparison) grow here later.

/** Optional logger channels we capability-detect and degrade gracefully without. */
export const OPTIONAL_CHANNELS = [
  "lat_g",
  "long_g",
  "rpm",
  "throttle",
  "brake",
  "steering",
] as const;

export type OptionalChannel = (typeof OPTIONAL_CHANNELS)[number];

/** A lap reduced to the fields the Stage-1 debrief consumes. */
export interface SessionLap {
  lapNumber: number;
  lapTimeMs: number;
  maxSpeedMph: number;
  maxSpeedKph: number;
  sectors?: LapSectors;
}

export interface Session {
  laps: SessionLap[];
  topSpeedMph: number;
  topSpeedKph: number;
  /** Optional channels present beyond pure GPS — for graceful capability gating. */
  channels: OptionalChannel[];
}

/**
 * Scan the parsed data for optional channels beyond GPS, looking at both the
 * parser's field mappings and the per-sample `extraFields`. Pure GPS yields [].
 */
export function detectChannels(data: ParsedData): OptionalChannel[] {
  const present = new Set<string>();
  for (const key of Object.keys(data.fieldMappings)) present.add(key.toLowerCase());
  const first = data.samples[0];
  if (first) {
    for (const key of Object.keys(first.extraFields)) present.add(key.toLowerCase());
  }
  return OPTIONAL_CHANNELS.filter((channel) => present.has(channel));
}

/** Build the internal Session from the host snapshot the panel was handed. */
export function buildSession(data: ParsedData | null, laps: Lap[]): Session {
  const sessionLaps: SessionLap[] = laps.map((lap) => ({
    lapNumber: lap.lapNumber,
    lapTimeMs: lap.lapTimeMs,
    maxSpeedMph: lap.maxSpeedMph,
    maxSpeedKph: lap.maxSpeedKph,
    ...(lap.sectors ? { sectors: lap.sectors } : {}),
  }));

  let topSpeedMph = 0;
  let topSpeedKph = 0;
  for (const lap of laps) {
    if (lap.maxSpeedMph > topSpeedMph) topSpeedMph = lap.maxSpeedMph;
    if (lap.maxSpeedKph > topSpeedKph) topSpeedKph = lap.maxSpeedKph;
  }

  return {
    laps: sessionLaps,
    topSpeedMph,
    topSpeedKph,
    channels: data ? detectChannels(data) : [],
  };
}
