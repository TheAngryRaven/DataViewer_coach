// Compile-time stub of the host's racing types (DataViewer src/types/racing.ts).
// Minimal shapes covering only the fields this plugin reads — replace with the
// real host types when building against the host. Runtime resolves the host's.

export interface GpsSample {
  time: number; // seconds from session start
  lat: number;
  lon: number;
  speed: number; // metres per second
}

export interface ParsedData {
  samples: GpsSample[];
}

export interface Lap {
  lapNumber: number;
  lapTime: number; // seconds
}

export interface Course {
  name?: string;
}
