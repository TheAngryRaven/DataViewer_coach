import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import type { LapProfile } from "../analysis/distance";
import type { Corner } from "../analysis/corners";
import type { CornerDelta } from "../analysis/segments";
import {
  apexOffsets,
  brakingPoints,
  cornerExits,
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

describe("apexOffsets", () => {
  const grid = [0, 10, 20, 30, 40];
  const speed = [20, 15, 10, 15, 20]; // V-Min at idx 2 (dist 20)
  const window = [corner(0, 0, 2, 4, grid)];

  it("flags a late apex when V-Min falls after the curvature peak", () => {
    const curvature = [0, 0.05, 0.01, 0, 0]; // geometric apex at idx 1 (dist 10)
    const [offset] = apexOffsets(window, grid, speed, curvature);
    expect(offset.vMinDist).toBe(20);
    expect(offset.geoApexDist).toBe(10);
    expect(offset.offsetM).toBe(10);
    expect(offset.kind).toBe("late");
    expect(offset.confident).toBe(true);
  });

  it("flags an early apex when V-Min falls before the curvature peak", () => {
    const curvature = [0, 0, 0.01, 0.05, 0]; // geometric apex at idx 3 (dist 30)
    const [offset] = apexOffsets(window, grid, speed, curvature);
    expect(offset.offsetM).toBe(-10);
    expect(offset.kind).toBe("early");
  });

  it("reads 'on' within the deadband", () => {
    const curvature = [0, 0, 0.05, 0, 0]; // geometric apex coincides with V-Min
    expect(apexOffsets(window, grid, speed, curvature)[0].kind).toBe("on");
  });

  it("is not confident (and reads 'on') when there is no real curvature peak", () => {
    const flat = [0.001, 0.001, 0.001, 0.001, 0.001];
    const [offset] = apexOffsets(window, grid, speed, flat);
    expect(offset.confident).toBe(false);
    expect(offset.kind).toBe("on");
  });
});

describe("cornerExits", () => {
  const grid = Array.from({ length: 11 }, (_, i) => i * 10); // 0..100, 10 m spacing
  const speed = [30, 10, 28, 30, 30, 30, 30, 30, 12, 30, 26];
  // Corner 0 exits at idx 2 (dist 20); next corner enters at idx 8 (dist 80) -> 60 m straight.
  // Corner 1 exits at idx 10 (dist 100); lap ends there -> no straight.
  const corners = [corner(0, 0, 1, 2, grid), corner(1, 8, 9, 10, grid)];

  it("reads exit speed and flags corners with a following straight", () => {
    const result = cornerExits(grid, speed, corners, 60);
    expect(result[0]).toEqual({
      cornerIndex: 0,
      exitSpeedMps: 28,
      followingStraightM: 60,
      exitCritical: true,
    });
    expect(result[1]).toEqual({
      cornerIndex: 1,
      exitSpeedMps: 26,
      followingStraightM: 0,
      exitCritical: false,
    });
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
