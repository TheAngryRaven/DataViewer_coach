// Compile-time stub of the host's racing types (DataViewer src/types/racing.ts).
// These mirror the host contract exactly — the plugin reads them on every render.
// Replace with the real host types when building against the host; at runtime the
// host's modules resolve.

export interface GpsSample {
  t: number; // ms from session start
  lat: number;
  lon: number;
  speedMps: number;
  speedMph: number;
  speedKph: number;
  heading?: number;
  /** Optional logger channels keyed by name (e.g. lat_g, rpm). */
  extraFields: Record<string, number>;
}

/** Per-lap sector splits, in milliseconds. Present only when the course defines sectors. */
export interface LapSectors {
  s1?: number; // ms
  s2?: number; // ms
  s3?: number; // ms
}

export interface Lap {
  lapNumber: number;
  startTime: number; // ms
  endTime: number; // ms
  lapTimeMs: number; // ms
  maxSpeedMph: number;
  maxSpeedKph: number;
  minSpeedMph: number;
  minSpeedKph: number;
  startIndex: number; // index into ParsedData.samples
  endIndex: number; // index into ParsedData.samples
  sectors?: LapSectors;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Course {
  name: string;
  lengthFt?: number;
  startFinishA: LatLon;
  startFinishB: LatLon;
  sector2?: LatLon;
  sector3?: LatLon;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface ParsedData {
  samples: GpsSample[];
  /** Maps canonical channel names to the source column they were parsed from. */
  fieldMappings: Record<string, string>;
  bounds: Bounds;
  duration: number; // ms
  startDate?: string;
  dovexMetadata?: Record<string, unknown>;
  parserStats?: Record<string, unknown>;
}
