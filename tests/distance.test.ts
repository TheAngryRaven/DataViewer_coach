import { describe, expect, it } from "vitest";
import type { GpsSample, Lap } from "@/types/racing";
import {
  buildComparableProfiles,
  buildLapProfile,
  cumulativeDistanceMeters,
  deltaTimeMs,
  distanceGrid,
  haversineMeters,
  interpolateAt,
  lapLengthMeters,
  resample,
  type LapProfile,
} from "../analysis/distance";

function sample(t: number, lat: number, lon: number, speedMps: number): GpsSample {
  return { t, lat, lon, speedMps, speedMph: 0, speedKph: 0, extraFields: {} };
}

function lap(lapNumber: number, startIndex: number, endIndex: number): Lap {
  return {
    lapNumber,
    startTime: 0,
    endTime: 0,
    lapTimeMs: 0,
    maxSpeedMph: 0,
    maxSpeedKph: 0,
    minSpeedMph: 0,
    minSpeedKph: 0,
    startIndex,
    endIndex,
  };
}

// A run of samples marching east along the equator, 0.001 deg (~111.19 m) apart,
// one second between each. Speed and time therefore rise linearly with distance.
function eastwardRun(count: number): GpsSample[] {
  return Array.from({ length: count }, (_, i) => sample(i * 1000, 0, i * 0.001, 10 + i));
}

const STEP_M = 111.1926; // ~haversine of 0.001 deg of longitude at the equator

describe("haversineMeters", () => {
  it("is zero for a point against itself", () => {
    expect(haversineMeters({ lat: 12.3, lon: -4.5 }, { lat: 12.3, lon: -4.5 })).toBe(0);
  });

  it("is ~111 km per degree of longitude at the equator", () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
});

describe("cumulativeDistanceMeters", () => {
  it("starts at zero and is non-decreasing", () => {
    const dist = cumulativeDistanceMeters(eastwardRun(4));
    expect(dist[0]).toBe(0);
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1]);
    expect(dist[3]).toBeCloseTo(3 * STEP_M, 1);
  });

  it("adds nothing for a stationary point", () => {
    const dist = cumulativeDistanceMeters([sample(0, 0, 0, 0), sample(1000, 0, 0, 0)]);
    expect(dist).toEqual([0, 0]);
  });
});

describe("interpolateAt", () => {
  it("interpolates linearly within a segment", () => {
    expect(interpolateAt([0, 10], [0, 100], 5)).toBe(50);
  });

  it("clamps outside the range", () => {
    expect(interpolateAt([0, 10], [0, 100], -3)).toBe(0);
    expect(interpolateAt([0, 10], [0, 100], 99)).toBe(100);
  });

  it("handles a single point and an empty list", () => {
    expect(interpolateAt([5], [42], 0)).toBe(42);
    expect(interpolateAt([5], [42], 10)).toBe(42);
    expect(Number.isNaN(interpolateAt([], [], 1))).toBe(true);
  });

  it("steps over a zero-width segment without dividing by zero", () => {
    expect(interpolateAt([0, 5, 5, 8], [0, 10, 20, 26], 6.5)).toBe(23);
  });
});

describe("resample", () => {
  it("maps each grid position through interpolation", () => {
    expect(resample([0, 10, 20], [0, 10, 20], [0, 5, 15, 20])).toEqual([0, 5, 15, 20]);
  });
});

describe("distanceGrid", () => {
  it("spans [0, length] with evenly spaced points", () => {
    expect(distanceGrid(100, 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("degenerates to a single point when asked for one or fewer", () => {
    expect(distanceGrid(50, 1)).toEqual([0]);
    expect(distanceGrid(50, 0)).toEqual([0]);
  });
});

describe("lapLengthMeters", () => {
  it("measures the GPS path between a lap's start and end indices (inclusive)", () => {
    const samples = eastwardRun(6);
    expect(lapLengthMeters(samples, lap(1, 1, 4))).toBeCloseTo(3 * STEP_M, 1);
  });
});

describe("buildLapProfile", () => {
  it("resamples speed and elapsed time onto the grid", () => {
    const samples = eastwardRun(6);
    const target = lap(1, 1, 4); // 4 samples, ~3 steps long, 3 s elapsed
    const grid = distanceGrid(3 * STEP_M, 4);
    const profile = buildLapProfile(samples, target, grid);

    expect(profile.lapNumber).toBe(1);
    expect(profile.lengthMeters).toBeCloseTo(3 * STEP_M, 1);
    expect(profile.grid).toBe(grid);
    expect(profile.elapsedMs[0]).toBe(0);
    expect(profile.elapsedMs[profile.elapsedMs.length - 1]).toBeCloseTo(3000, 0);
    expect(profile.speedMps[0]).toBeCloseTo(11, 5); // slice starts at sample index 1
  });
});

describe("buildComparableProfiles", () => {
  it("puts every lap on one shared grid", () => {
    const samples = eastwardRun(9);
    const { grid, profiles } = buildComparableProfiles(samples, [lap(1, 0, 4), lap(2, 4, 8)], 5);
    expect(grid).toHaveLength(5);
    expect(profiles).toHaveLength(2);
    expect(profiles[0].grid).toBe(grid);
    expect(profiles[1].grid).toBe(grid);
  });

  it("returns an empty result for no laps", () => {
    expect(buildComparableProfiles(eastwardRun(3), [], 5)).toEqual({ grid: [], profiles: [] });
  });

  it("sizes the grid from a single lap's length", () => {
    const samples = eastwardRun(6);
    const { grid, profiles } = buildComparableProfiles(samples, [lap(1, 1, 4)], 4);
    expect(profiles).toHaveLength(1);
    expect(grid[grid.length - 1]).toBeCloseTo(3 * STEP_M, 1);
  });
});

describe("degenerate laps", () => {
  it("treat an empty sample window as zero length", () => {
    const samples = eastwardRun(6);
    const empty = lap(9, 5, 4); // startIndex > endIndex -> no samples
    expect(lapLengthMeters(samples, empty)).toBe(0);
    expect(buildLapProfile(samples, empty, distanceGrid(0, 3)).lengthMeters).toBe(0);
  });
});

describe("deltaTimeMs", () => {
  it("is positive where the lap trails the reference", () => {
    const ref: LapProfile = {
      lapNumber: 1,
      lengthMeters: 100,
      grid: [0, 50, 100],
      speedMps: [10, 10, 10],
      elapsedMs: [0, 1000, 2000],
    };
    const slower: LapProfile = { ...ref, lapNumber: 2, elapsedMs: [0, 1100, 2300] };
    expect(deltaTimeMs(ref, slower)).toEqual([0, 100, 300]);
  });
});
