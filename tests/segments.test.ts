import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import type { LapProfile } from "../analysis/distance";
import type { Corner } from "../analysis/corners";
import type { CornerDelta } from "../analysis/segments";
import {
  brakingPoints,
  cornerTimeLoss,
  rankByTimeLost,
  sectorDeltas,
  throttleApplication,
} from "../analysis/segments";

function lapWithSectors(lapNumber: number, s1: number, s2: number, s3: number): Lap {
  return {
    lapNumber,
    startTime: 0,
    endTime: 0,
    lapTimeMs: s1 + s2 + s3,
    maxSpeedMph: 0,
    maxSpeedKph: 0,
    minSpeedMph: 0,
    minSpeedKph: 0,
    startIndex: 0,
    endIndex: 0,
    sectors: { s1, s2, s3 },
  };
}

function profile(
  lapNumber: number,
  grid: number[],
  speedMps: number[],
  elapsedMs: number[],
  channels: Record<string, number[]> = {},
): LapProfile {
  return { lapNumber, lengthMeters: grid[grid.length - 1], grid, speedMps, elapsedMs, channels };
}

function corner(index: number, startIdx: number, apexIdx: number, endIdx: number, grid: number[]): Corner {
  return {
    index,
    startIdx,
    apexIdx,
    endIdx,
    startDist: grid[startIdx],
    apexDist: grid[apexIdx],
    endDist: grid[endIdx],
    minSpeedMps: 0,
  };
}

describe("sectorDeltas", () => {
  const laps = [lapWithSectors(2, 20000, 21000, 21000), lapWithSectors(3, 20500, 21000, 21800)];

  it("computes per-sector deltas of subject vs reference", () => {
    const deltas = sectorDeltas(laps, 2, 3);
    expect(deltas).toEqual([
      { sector: "s1", subjectMs: 20500, referenceMs: 20000, deltaMs: 500 },
      { sector: "s2", subjectMs: 21000, referenceMs: 21000, deltaMs: 0 },
      { sector: "s3", subjectMs: 21800, referenceMs: 21000, deltaMs: 800 },
    ]);
  });

  it("is empty when a lap or its sectors are missing", () => {
    expect(sectorDeltas(laps, 2, 99)).toEqual([]);
    const noSectors: Lap = { ...laps[0], lapNumber: 5, sectors: undefined };
    expect(sectorDeltas([noSectors, laps[1]], 5, 3)).toEqual([]);
  });
});

describe("cornerTimeLoss", () => {
  const grid = [0, 10, 20, 30, 40];
  const reference = profile(2, grid, [30, 20, 12, 20, 30], [0, 1000, 2000, 3000, 4000]);
  const subject = profile(3, grid, [30, 18, 10, 18, 30], [0, 1100, 2100, 3400, 4400]);

  it("integrates delta-time across each corner window", () => {
    const deltas = cornerTimeLoss(reference, subject, [corner(0, 1, 2, 3, grid)]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].timeLostMs).toBe(300); // delta[3]-delta[1] = 400-100
    expect(deltas[0].subjectMinSpeedMps).toBe(10);
    expect(deltas[0].referenceMinSpeedMps).toBe(12);
  });
});

describe("rankByTimeLost", () => {
  const make = (cornerIndex: number, timeLostMs: number): CornerDelta => ({
    cornerIndex,
    startDist: 0,
    apexDist: 0,
    endDist: 0,
    timeLostMs,
    subjectMinSpeedMps: 0,
    referenceMinSpeedMps: 0,
  });

  it("keeps only losses, largest first, up to the limit", () => {
    const ranked = rankByTimeLost([make(0, 120), make(1, -50), make(2, 400), make(3, 30)], 2);
    expect(ranked.map((d) => d.cornerIndex)).toEqual([2, 0]);
  });
});

describe("brakingPoints", () => {
  const grid = [0, 10, 20, 30, 40];
  const lap = profile(1, grid, [30, 25, 18, 10, 15], [0, 1000, 2000, 3000, 4000]);

  it("finds the braking onset, peak decel and distance to the apex", () => {
    const [bp] = brakingPoints(lap, [corner(0, 0, 3, 4, grid)]);
    expect(bp.brakeDist).toBe(0);
    expect(bp.peakDecelMps2).toBeCloseTo(-7.5, 5);
    expect(bp.brakingDistanceM).toBe(30);
  });

  it("reports null when no braking zone precedes the apex", () => {
    const cruise = profile(1, grid, [20, 20, 20, 20, 20], [0, 1000, 2000, 3000, 4000]);
    const [bp] = brakingPoints(cruise, [corner(0, 0, 3, 4, grid)]);
    expect(bp.brakeDist).toBeNull();
    expect(bp.brakingDistanceM).toBeNull();
  });
});

describe("throttleApplication", () => {
  const grid = [0, 10, 20, 30, 40];

  it("finds where throttle is reapplied after the apex", () => {
    const lap = profile(1, grid, [10, 10, 10, 10, 10], [0, 1, 2, 3, 4], {
      throttle: [0, 0, 0, 40, 80],
    });
    const [tp] = throttleApplication(lap, [corner(0, 0, 2, 4, grid)]);
    expect(tp.throttleDist).toBe(40);
  });

  it("is null without a throttle channel", () => {
    const lap = profile(1, grid, [10, 10, 10, 10, 10], [0, 1, 2, 3, 4]);
    expect(throttleApplication(lap, [corner(0, 0, 2, 4, grid)])[0].throttleDist).toBeNull();
  });
});
