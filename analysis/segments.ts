import type { Lap } from "@/types/racing";
import { deltaTimeMs, type LapProfile } from "./distance";
import type { Corner } from "./corners";
import { longitudinalAccel } from "./signal";

// Per-segment coaching reads: where the time goes, sector by sector and corner by
// corner, versus the driver's own best lap. All deterministic; nothing is shown
// that wasn't computed from the handed data.

const SECTOR_KEYS = ["s1", "s2", "s3"] as const;
type SectorKey = (typeof SECTOR_KEYS)[number];

export interface SectorDelta {
  sector: SectorKey;
  subjectMs: number;
  referenceMs: number;
  deltaMs: number;
}

/** Per-sector time delta of the subject lap vs the reference (best) lap, when both carry splits. */
export function sectorDeltas(
  laps: Lap[],
  referenceLapNumber: number,
  subjectLapNumber: number,
): SectorDelta[] {
  const reference = laps.find((lap) => lap.lapNumber === referenceLapNumber);
  const subject = laps.find((lap) => lap.lapNumber === subjectLapNumber);
  if (!reference?.sectors || !subject?.sectors) return [];

  const out: SectorDelta[] = [];
  for (const sector of SECTOR_KEYS) {
    const referenceMs = reference.sectors[sector];
    const subjectMs = subject.sectors[sector];
    if (referenceMs !== undefined && subjectMs !== undefined) {
      out.push({ sector, subjectMs, referenceMs, deltaMs: subjectMs - referenceMs });
    }
  }
  return out;
}

export interface CornerDelta {
  cornerIndex: number;
  startDist: number;
  apexDist: number;
  endDist: number;
  /** Time the subject lost within this corner window vs the reference (ms; >0 = slower). */
  timeLostMs: number;
  subjectMinSpeedMps: number;
  referenceMinSpeedMps: number;
}

function minOver(values: number[], lo: number, hi: number): number {
  let min = values[lo];
  for (let i = lo + 1; i <= hi; i++) if (values[i] < min) min = values[i];
  return min;
}

/**
 * Per-corner time loss of the subject lap vs the reference (best) lap, using the
 * distance-domain delta-time integrated across each corner window. Corners are
 * the windows detected on the reference lap, applied to both (they share a grid).
 */
export function cornerTimeLoss(
  reference: LapProfile,
  subject: LapProfile,
  corners: Corner[],
): CornerDelta[] {
  const delta = deltaTimeMs(reference, subject);
  return corners.map((corner) => ({
    cornerIndex: corner.index,
    startDist: corner.startDist,
    apexDist: corner.apexDist,
    endDist: corner.endDist,
    timeLostMs: delta[corner.endIdx] - delta[corner.startIdx],
    subjectMinSpeedMps: minOver(subject.speedMps, corner.startIdx, corner.endIdx),
    referenceMinSpeedMps: minOver(reference.speedMps, corner.startIdx, corner.endIdx),
  }));
}

/** Corners ranked by time lost (largest first), keeping only genuine losses. */
export function rankByTimeLost(deltas: CornerDelta[], limit: number): CornerDelta[] {
  return deltas
    .filter((delta) => delta.timeLostMs > 0)
    .sort((a, b) => b.timeLostMs - a.timeLostMs)
    .slice(0, limit);
}

export interface BrakingPoint {
  cornerIndex: number;
  /** Distance where braking begins, or null if no clear braking zone precedes the apex. */
  brakeDist: number | null;
  /** Most negative longitudinal acceleration in the approach (m/s^2). */
  peakDecelMps2: number;
  /** Distance braked from onset to apex, or null when no onset was found. */
  brakingDistanceM: number | null;
}

/**
 * Braking analysis per corner, derived from the speed trace (Tier-1: works on
 * pure GPS). `decelThresholdMps2` is the deceleration magnitude that marks the
 * braking onset.
 */
export function brakingPoints(
  profile: LapProfile,
  corners: Corner[],
  decelThresholdMps2 = 2,
): BrakingPoint[] {
  const accel = longitudinalAccel(profile.speedMps, profile.elapsedMs);
  return corners.map((corner) => {
    let brakeIdx: number | null = null;
    let peak = 0;
    for (let i = corner.startIdx; i <= corner.apexIdx; i++) {
      if (accel[i] < peak) peak = accel[i];
      if (brakeIdx === null && accel[i] <= -decelThresholdMps2) brakeIdx = i;
    }
    return {
      cornerIndex: corner.index,
      brakeDist: brakeIdx === null ? null : profile.grid[brakeIdx],
      peakDecelMps2: peak,
      brakingDistanceM: brakeIdx === null ? null : corner.apexDist - profile.grid[brakeIdx],
    };
  });
}

export interface ThrottlePoint {
  cornerIndex: number;
  /** Distance where throttle is reapplied after the apex, or null if not detected. */
  throttleDist: number | null;
}

/**
 * Throttle re-application per corner (Tier-2: requires a `throttle` channel
 * resampled onto the profile). `onThreshold` is the throttle value (channel
 * units, typically 0-100%) counted as "on".
 */
export function throttleApplication(
  profile: LapProfile,
  corners: Corner[],
  onThreshold = 50,
): ThrottlePoint[] {
  const throttle = profile.channels.throttle;
  return corners.map((corner) => {
    let throttleDist: number | null = null;
    if (throttle) {
      for (let i = corner.apexIdx; i <= corner.endIdx; i++) {
        if (!Number.isNaN(throttle[i]) && throttle[i] >= onThreshold) {
          throttleDist = profile.grid[i];
          break;
        }
      }
    }
    return { cornerIndex: corner.index, throttleDist };
  });
}
