import type { Course, Lap, ParsedData } from "@/types/racing";
import type { PluginSnapshot } from "@/plugins/panels";
import type { VehicleSetup } from "@/plugins/setup";
import { fastestLap } from "./insights";
import { buildSession } from "./session";
import { buildDebrief, type SessionDebrief } from "./debrief";
import { detectCapabilities, type SessionCapabilities } from "./channels";
import { longitudinalAccel, sampleRateHz } from "./signal";
import {
  buildLapProfile,
  buildSampleProfile,
  cumulativeDistanceMeters,
  deltaTimeMs,
  distanceGrid,
  type LapProfile,
} from "./distance";
import { buildComparableProfiles } from "./distance";
import {
  DEFAULT_CORNER_OPTIONS,
  DEFAULT_CURVATURE_OPTIONS,
  detectCornersByCurvature,
  detectCornersBySpeed,
  type Corner,
  type CornerMethod,
} from "./corners";
import { curvatureForLap, curvatureFromSamples } from "./curvature";
import {
  cornerGrip,
  combinedAccelMps2,
  gripEnvelopeMps2,
  lateralAccelMps2,
  type CornerGrip,
} from "./grip";
import { assessQuality, type DataQuality } from "./quality";
import {
  apexOffsets,
  brakingPoints,
  cornerConsistency,
  cornerExits,
  cornerTimeLoss,
  rankByTimeLost,
  sectorDeltas,
  throttleApplication,
  type ApexOffset,
  type BrakingPoint,
  type CornerConsistency,
  type CornerDelta,
  type CornerExit,
  type SectorDelta,
  type ThrottlePoint,
} from "./segments";
import { buildCornerInsights, type CornerInsight } from "./coaching";
import { diffSetups, type SetupChange } from "./setupDiff";

// Composes the Stage-1 analysis modules into one structured report for the
// dashboard. The panel stays a thin view over this; everything here is pure and
// deterministic, gated on the data's real capabilities.

/** Distance-grid resolution for cross-lap profiles (points per lap). */
export const GRID_POINTS = 400;
/** How many corners to surface in the "where you're losing time" list. */
export const TIME_LOSS_LIMIT = 3;
/**
 * Sentinel lapNumber for the reference profile when it comes from a loaded
 * snapshot rather than an in-session lap. Negative so it can't collide with a
 * real lap number; the dashboard checks `referenceSource` to label the trace.
 */
export const SNAPSHOT_LAP_NUMBER = -1;

/** Where the comparison reference came from. */
export type ReferenceSource = "best-lap" | "snapshot";

/** Lightweight metadata about a loaded snapshot, for the dashboard header. */
export interface SnapshotReference {
  engine: string;
  lapTimeMs: number;
  trackName: string;
  courseName: string;
}

export interface CoachingReport {
  debrief: SessionDebrief;
  capabilities: SessionCapabilities;
  sampleRateHz: number;
  useKph: boolean;
  cornerMethod: CornerMethod;
  bestLapNumber: number | null;
  subjectLapNumber: number | null;
  sectorDeltas: SectorDelta[];
  grid: number[];
  profiles: LapProfile[];
  referenceProfile: LapProfile | null;
  subjectProfile: LapProfile | null;
  /** Subject-vs-reference time delta along the grid (ms; >0 = subject behind). */
  deltaMs: number[];
  corners: Corner[];
  cornerDeltas: CornerDelta[];
  topTimeLoss: CornerDelta[];
  /** Attributed, confidence-tagged per-corner insights — the Stage-2 input contract. */
  insights: CornerInsight[];
  /** V-Min vs geometric apex per corner (early/late/on); diagnostic. */
  apex: ApexOffset[];
  /** Lap-to-lap V-Min variance per corner (the consistency layer). */
  consistency: CornerConsistency[];
  /** GPS-derived friction-circle read per corner (scrubbing / unused grip); advisory. */
  grip: CornerGrip[];
  /** Stage-0 GPS data quality, and the confidence cap it implies. */
  quality: DataQuality;
  /** Exit speed + whether a straight follows (exit priority), per corner. */
  exits: CornerExit[];
  braking: BrakingPoint[];
  throttle: ThrottlePoint[];
  /** What's serving as the reference profile: in-session best, or a loaded snapshot. */
  referenceSource: ReferenceSource;
  /** Set when `referenceSource === "snapshot"`. */
  snapshotReference: SnapshotReference | null;
  /** Lap-time of the in-session fastest lap (ms), or null when there is none. */
  inSessionBestLapTimeMs: number | null;
  /** `inSessionBestLapTimeMs - snapshotReference.lapTimeMs` (ms); null when either side is missing. */
  baselineDeltaMs: number | null;
  /** Frozen setup from the snapshot (context: "the baseline lap was run with X PSI"). */
  baselineSetup: VehicleSetup | null;
  /** Changes from `baselineSetup` to the live session setup; empty when either side is missing. */
  setupChanges: SetupChange[];
}

export interface ReportInput {
  data: ParsedData | null;
  laps: Lap[];
  selectedLapNumber: number | null;
  course: Course | null;
  useKph: boolean;
  /** Corner-segmentation method; defaults to "speed". */
  cornerMethod?: CornerMethod;
  /** The live session setup (real-time counterpart to a snapshot's frozen setup). */
  sessionSetup?: VehicleSetup | null;
  /** Loaded snapshot to compare against; when present it overrides the in-session reference lap. */
  activeSnapshot?: PluginSnapshot | null;
}

/** Second-fastest lap number, so there's always something to compare to the best. */
function secondFastestLapNumber(laps: Lap[], bestLapNumber: number | null): number | null {
  const others = laps.filter((lap) => lap.lapNumber !== bestLapNumber);
  return fastestLap(others)?.lapNumber ?? null;
}

/** Total path length of a sample slice (metres), used to size the snapshot grid. */
function sampleSliceLengthMeters(samples: { lat: number; lon: number }[]): number {
  if (samples.length < 2) return 0;
  // cumulativeDistanceMeters takes GpsSample[] but only reads lat/lon, so casting is safe.
  const dist = cumulativeDistanceMeters(samples as Parameters<typeof cumulativeDistanceMeters>[0]);
  return dist[dist.length - 1];
}

export function buildCoachingReport(input: ReportInput): CoachingReport {
  const { data, laps, selectedLapNumber, useKph } = input;
  const cornerMethod: CornerMethod = input.cornerMethod ?? "speed";
  const sessionSetup = input.sessionSetup ?? null;
  const activeSnapshot = input.activeSnapshot ?? null;
  const session = buildSession(data, laps);
  const debrief = buildDebrief(session);
  const capabilities = data ? detectCapabilities(data) : session.capabilities;
  const bestLapNumber = fastestLap(laps)?.lapNumber ?? null;
  const inSessionBestLapTimeMs =
    laps.find((lap) => lap.lapNumber === bestLapNumber)?.lapTimeMs ?? null;

  // A snapshot is usable as a reference only if it has enough samples to form
  // a path (≥ 3 for curvature; cheaper guard below covers the basic case).
  const usableSnapshot =
    activeSnapshot && activeSnapshot.samples.length >= 3 ? activeSnapshot : null;
  const referenceSource: ReferenceSource = usableSnapshot ? "snapshot" : "best-lap";
  const snapshotReference: SnapshotReference | null = usableSnapshot
    ? {
        engine: usableSnapshot.engine,
        lapTimeMs: usableSnapshot.lapTimeMs,
        trackName: usableSnapshot.trackName,
        courseName: usableSnapshot.courseName,
      }
    : null;
  const baselineSetup = usableSnapshot?.setup ?? null;
  const baselineDeltaMs =
    snapshotReference !== null && inSessionBestLapTimeMs !== null
      ? inSessionBestLapTimeMs - snapshotReference.lapTimeMs
      : null;
  const setupChanges =
    baselineSetup !== null && sessionSetup !== null
      ? diffSetups(baselineSetup, sessionSetup)
      : [];

  // Subject = the lap under inspection. When comparing against a snapshot the
  // best in-session lap *is* a valid subject (it's not the reference); when
  // comparing against the in-session best, fall back to second-best so there's
  // always something to compare to.
  let subjectLapNumber: number | null;
  if (selectedLapNumber !== null && laps.some((lap) => lap.lapNumber === selectedLapNumber)) {
    subjectLapNumber = selectedLapNumber;
  } else if (usableSnapshot) {
    subjectLapNumber = bestLapNumber;
  } else {
    subjectLapNumber = secondFastestLapNumber(laps, bestLapNumber);
  }

  const empty: CoachingReport = {
    debrief,
    capabilities,
    sampleRateHz: 0,
    useKph,
    cornerMethod,
    bestLapNumber,
    subjectLapNumber,
    sectorDeltas: [],
    grid: [],
    profiles: [],
    referenceProfile: null,
    subjectProfile: null,
    deltaMs: [],
    corners: [],
    cornerDeltas: [],
    topTimeLoss: [],
    insights: [],
    apex: [],
    consistency: [],
    grip: [],
    quality: { sampleRateHz: 0, hdop: null, satellites: null, level: "poor", confidenceCap: "low" },
    exits: [],
    braking: [],
    throttle: [],
    referenceSource,
    snapshotReference,
    inSessionBestLapTimeMs,
    baselineDeltaMs,
    baselineSetup,
    setupChanges,
  };

  // Without in-session data we can't build any profile, but the snapshot
  // metadata, baseline setup, and basic session debrief are still useful.
  if (data === null || laps.length === 0) return empty;
  // Best-lap reference needs a best lap; snapshot reference does not.
  if (!usableSnapshot && bestLapNumber === null) return empty;

  const channelIds = (["throttle", "brake"] as const).filter((id) => capabilities[id]);

  // Reference geometry: the snapshot's arc length (when present) or the
  // median in-session lap length. All profiles share that grid.
  let grid: number[];
  let profiles: LapProfile[];
  let referenceProfile: LapProfile | null;
  let referenceCurvature: number[];
  let referenceSamples: { samples: typeof data.samples; startMs: number };

  if (usableSnapshot) {
    const snapLengthM = sampleSliceLengthMeters(usableSnapshot.samples);
    grid = distanceGrid(snapLengthM, GRID_POINTS);
    referenceProfile = buildSampleProfile(usableSnapshot.samples, {
      lapNumber: SNAPSHOT_LAP_NUMBER,
      grid,
      channelIds: [...channelIds],
    });
    profiles = laps.map((lap) => buildLapProfile(data.samples, lap, grid, [...channelIds]));
    referenceCurvature = curvatureFromSamples(usableSnapshot.samples, grid);
    referenceSamples = {
      samples: usableSnapshot.samples,
      startMs: usableSnapshot.samples[0]?.t ?? 0,
    };
  } else {
    const built = buildComparableProfiles(data.samples, laps, GRID_POINTS, [...channelIds]);
    grid = built.grid;
    profiles = built.profiles;
    referenceProfile = profiles.find((p) => p.lapNumber === bestLapNumber) ?? null;
    if (referenceProfile === null) return { ...empty, grid, profiles };
    const bestLap = laps.find((lap) => lap.lapNumber === bestLapNumber);
    referenceCurvature = bestLap
      ? curvatureForLap(data.samples, bestLap, grid)
      : grid.map(() => 0);
    referenceSamples = { samples: data.samples, startMs: 0 };
  }

  const subjectProfile = profiles.find((p) => p.lapNumber === subjectLapNumber) ?? null;
  const corners =
    cornerMethod === "curvature"
      ? detectCornersByCurvature(grid, referenceCurvature, referenceProfile.speedMps, DEFAULT_CURVATURE_OPTIONS)
      : detectCornersBySpeed(grid, referenceProfile.speedMps, DEFAULT_CORNER_OPTIONS);
  // Snapshot reference: the subject is never the reference, so any subject is comparable.
  // Best-lap reference: skip self-vs-self comparison.
  const comparing =
    subjectProfile !== null &&
    (referenceSource === "snapshot" || subjectProfile.lapNumber !== bestLapNumber);
  const cornerDeltas = comparing ? cornerTimeLoss(referenceProfile, subjectProfile, corners) : [];

  // Braking/throttle read the lap under inspection (the subject, else the reference).
  const inspect = subjectProfile ?? referenceProfile;
  const apex = apexOffsets(corners, grid, referenceProfile.speedMps, referenceCurvature);
  const exits = cornerExits(grid, referenceProfile.speedMps, corners);
  // V-Min variance uses every in-session lap on the shared grid (snapshot excluded).
  const consistency = cornerConsistency(profiles, corners);

  // Friction circle on the lap under inspection (GPS-derived lateral g = v^2*kappa).
  let inspectCurvature: number[];
  if (inspect === referenceProfile) {
    inspectCurvature = referenceCurvature;
  } else {
    const inspectLap = laps.find((lap) => lap.lapNumber === inspect.lapNumber);
    inspectCurvature = inspectLap
      ? curvatureForLap(data.samples, inspectLap, grid)
      : referenceCurvature;
  }
  const latAccel = lateralAccelMps2(inspect.speedMps, inspectCurvature);
  const longAccel = longitudinalAccel(inspect.speedMps, inspect.elapsedMs);
  const envelope = gripEnvelopeMps2(combinedAccelMps2(latAccel, longAccel));
  const grip = cornerGrip(corners, grid, inspect.speedMps, latAccel, longAccel, envelope);

  // Stage-0 quality caps how confident any insight can be. The reference samples
  // drive the quality read (it's the lap whose geometry we trust); for an
  // in-session reference that's data.samples, for a snapshot it's the snapshot's
  // own samples — either way, the parsed-data metadata (HDOP/sats) comes from
  // the live session.
  const quality = assessQuality(data, sampleRateHz(referenceSamples.samples));

  return {
    ...empty,
    sampleRateHz: sampleRateHz(referenceSamples.samples),
    // Sector deltas read off host lap times; only meaningful in the
    // in-session best-vs-other case. A snapshot lap has no host-side sectors.
    sectorDeltas:
      referenceSource === "best-lap" &&
      comparing &&
      subjectLapNumber !== null &&
      bestLapNumber !== null
        ? sectorDeltas(laps, bestLapNumber, subjectLapNumber)
        : [],
    grid,
    profiles,
    referenceProfile,
    subjectProfile,
    deltaMs: comparing ? deltaTimeMs(referenceProfile, subjectProfile) : [],
    corners,
    cornerDeltas,
    topTimeLoss: rankByTimeLost(cornerDeltas, TIME_LOSS_LIMIT),
    insights: comparing
      ? buildCornerInsights(cornerDeltas, exits, apex, consistency, grip, quality.confidenceCap)
      : [],
    apex,
    consistency,
    grip,
    quality,
    exits,
    braking: brakingPoints(inspect, corners),
    throttle: capabilities.throttle ? throttleApplication(inspect, corners) : [],
  };
}
