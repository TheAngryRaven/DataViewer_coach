import type { Course, Lap, ParsedData } from "@/types/racing";
import { fastestLap } from "./insights";
import { buildSession } from "./session";
import { buildDebrief, type SessionDebrief } from "./debrief";
import { detectCapabilities, type SessionCapabilities } from "./channels";
import { sampleRateHz } from "./signal";
import {
  buildComparableProfiles,
  deltaTimeMs,
  type LapProfile,
} from "./distance";
import {
  DEFAULT_CORNER_OPTIONS,
  DEFAULT_CURVATURE_OPTIONS,
  detectCornersByCurvature,
  detectCornersBySpeed,
  type Corner,
  type CornerMethod,
} from "./corners";
import { curvatureForLap } from "./curvature";
import {
  brakingPoints,
  cornerTimeLoss,
  rankByTimeLost,
  sectorDeltas,
  throttleApplication,
  type BrakingPoint,
  type CornerDelta,
  type SectorDelta,
  type ThrottlePoint,
} from "./segments";

// Composes the Stage-1 analysis modules into one structured report for the
// dashboard. The panel stays a thin view over this; everything here is pure and
// deterministic, gated on the data's real capabilities.

/** Distance-grid resolution for cross-lap profiles (points per lap). */
export const GRID_POINTS = 400;
/** How many corners to surface in the "where you're losing time" list. */
export const TIME_LOSS_LIMIT = 3;

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
  braking: BrakingPoint[];
  throttle: ThrottlePoint[];
}

export interface ReportInput {
  data: ParsedData | null;
  laps: Lap[];
  selectedLapNumber: number | null;
  course: Course | null;
  useKph: boolean;
  /** Corner-segmentation method; defaults to "speed". */
  cornerMethod?: CornerMethod;
}

/** Second-fastest lap number, so there's always something to compare to the best. */
function secondFastestLapNumber(laps: Lap[], bestLapNumber: number | null): number | null {
  const others = laps.filter((lap) => lap.lapNumber !== bestLapNumber);
  return fastestLap(others)?.lapNumber ?? null;
}

export function buildCoachingReport(input: ReportInput): CoachingReport {
  const { data, laps, selectedLapNumber, useKph } = input;
  const cornerMethod: CornerMethod = input.cornerMethod ?? "speed";
  const session = buildSession(data, laps);
  const debrief = buildDebrief(session);
  const capabilities = data ? detectCapabilities(data) : session.capabilities;
  const bestLapNumber = fastestLap(laps)?.lapNumber ?? null;

  // Subject = the lap under inspection; default to the second-best so there's a
  // meaningful comparison even before the user selects one.
  const subjectLapNumber =
    selectedLapNumber !== null && laps.some((lap) => lap.lapNumber === selectedLapNumber)
      ? selectedLapNumber
      : secondFastestLapNumber(laps, bestLapNumber);

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
    braking: [],
    throttle: [],
  };

  if (data === null || laps.length === 0 || bestLapNumber === null) return empty;

  const channelIds = (["throttle", "brake"] as const).filter((id) => capabilities[id]);
  const { grid, profiles } = buildComparableProfiles(data.samples, laps, GRID_POINTS, [
    ...channelIds,
  ]);
  const referenceProfile = profiles.find((p) => p.lapNumber === bestLapNumber) ?? null;
  const subjectProfile = profiles.find((p) => p.lapNumber === subjectLapNumber) ?? null;
  if (referenceProfile === null) return { ...empty, grid, profiles };

  const bestLap = laps.find((lap) => lap.lapNumber === bestLapNumber);
  const corners =
    cornerMethod === "curvature" && bestLap
      ? detectCornersByCurvature(
          grid,
          curvatureForLap(data.samples, bestLap, grid),
          referenceProfile.speedMps,
          DEFAULT_CURVATURE_OPTIONS,
        )
      : detectCornersBySpeed(grid, referenceProfile.speedMps, DEFAULT_CORNER_OPTIONS);
  const comparing = subjectProfile !== null && subjectProfile.lapNumber !== bestLapNumber;
  const cornerDeltas = comparing ? cornerTimeLoss(referenceProfile, subjectProfile, corners) : [];

  // Braking/throttle read the lap under inspection (the subject, else the best).
  const inspect = subjectProfile ?? referenceProfile;

  return {
    ...empty,
    sampleRateHz: sampleRateHz(data.samples),
    sectorDeltas:
      comparing && subjectLapNumber !== null
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
    braking: brakingPoints(inspect, corners),
    throttle: capabilities.throttle ? throttleApplication(inspect, corners) : [],
  };
}
