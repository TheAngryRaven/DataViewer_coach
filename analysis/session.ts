import type { Lap, LapSectors, ParsedData } from "@/types/racing";
import { detectCapabilities, type SessionCapabilities } from "./channels";

// Thin internal adapter: host ParsedData/Lap/Course -> our own Session model.
// This is the Stage-0/1 "interpreter". For the lap-scalar debrief we only need
// lap times + speeds; the distance-domain view (analysis/distance.ts) grows the
// per-sample side separately.

/** A lap reduced to the fields the lap-scalar debrief consumes. */
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
  /** Which optional channels the data carries, for graceful capability gating. */
  capabilities: SessionCapabilities;
}

const NO_CAPABILITIES: SessionCapabilities = {
  hasG: false,
  measuredG: false,
  throttle: false,
  brake: false,
  rpm: false,
};

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
    capabilities: data ? detectCapabilities(data) : NO_CAPABILITIES,
  };
}
