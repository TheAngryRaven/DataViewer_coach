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

/** A sector boundary drawn across the track: a line segment between two points. */
export interface SectorLine {
  a: LatLon;
  b: LatLon;
}

export interface Course {
  name: string;
  lengthFt?: number;
  startFinishA: LatLon;
  startFinishB: LatLon;
  sector2?: SectorLine;
  sector3?: SectorLine;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Describes one parsed channel. `name` is the canonical channel id (the key used
 * in `GpsSample.extraFields`); `label`/`unit` are for display only.
 */
export interface FieldMapping {
  name: string;
  label: string;
  unit: string;
}

export interface ParsedData {
  samples: GpsSample[];
  /** Canonical channel id -> its display mapping. Keys match `extraFields` keys. */
  fieldMappings: Record<string, FieldMapping>;
  bounds: Bounds;
  duration: number; // ms
  startDate?: string;
  dovexMetadata?: Record<string, unknown>;
  parserStats?: Record<string, unknown>;
}
