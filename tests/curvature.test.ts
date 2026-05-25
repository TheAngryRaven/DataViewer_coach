import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import {
  bearingRad,
  curvatureForLap,
  curvatureFromHeading,
  sampleHeadingsRad,
  unwrapRadians,
} from "../analysis/curvature";
import { gpsSample } from "./fixtures";

function lap(startIndex: number, endIndex: number): Lap {
  return {
    lapNumber: 1,
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

describe("bearingRad", () => {
  it("points east and north as expected", () => {
    expect(bearingRad({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(Math.PI / 2, 5);
    expect(bearingRad({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 5);
  });
});

describe("unwrapRadians", () => {
  it("removes 2*pi jumps in both directions", () => {
    const up = unwrapRadians([6.1, 0.1]); // wraps forward (delta < -pi -> add 2pi)
    expect(up[1]).toBeCloseTo(0.1 + 2 * Math.PI, 5);
    expect(up[1] - up[0]).toBeLessThan(Math.PI);

    const down = unwrapRadians([0.1, 6.1]); // wraps back (delta > pi -> subtract 2pi)
    expect(down[1]).toBeCloseTo(6.1 - 2 * Math.PI, 5);
    expect(Math.abs(down[1] - down[0])).toBeLessThan(Math.PI);
  });
});

describe("curvatureFromHeading", () => {
  it("is constant when heading turns linearly with distance", () => {
    const heading = [0, 0.1, 0.2, 0.3];
    const distance = [0, 10, 20, 30];
    const kappa = curvatureFromHeading(heading, distance);
    expect(kappa.every((k) => Math.abs(k - 0.01) < 1e-9)).toBe(true);
  });

  it("returns zeros for degenerate input", () => {
    expect(curvatureFromHeading([1], [0])).toEqual([0]);
  });
});

describe("sampleHeadingsRad", () => {
  it("uses the source heading when present (degrees -> radians)", () => {
    const samples = [
      { ...gpsSample(0, 0, 0, 10), heading: 90 },
      { ...gpsSample(1000, 0, 0.001, 10), heading: 180 },
    ];
    expect(sampleHeadingsRad(samples)).toEqual([Math.PI / 2, Math.PI]);
  });

  it("derives bearings from positions when no heading is present", () => {
    const samples = [gpsSample(0, 0, 0, 10), gpsSample(1000, 0, 0.001, 10)];
    const headings = sampleHeadingsRad(samples);
    expect(headings[0]).toBeCloseTo(Math.PI / 2, 5); // heading east
    expect(headings[1]).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("curvatureForLap", () => {
  const grid = [0, 100, 200, 300, 400, 500];

  it("is ~zero along a straight (constant heading)", () => {
    const straight = Array.from({ length: 6 }, (_, i) => gpsSample(i * 1000, 0, i * 0.001, 20));
    const kappa = curvatureForLap(straight, lap(0, 5), grid);
    expect(kappa.every((k) => Math.abs(k) < 1e-9)).toBe(true);
  });

  it("is positive where the path turns", () => {
    const turning = Array.from({ length: 6 }, (_, i) => ({
      ...gpsSample(i * 1000, 0, i * 0.001, 20),
      heading: 90 + i * 2, // turning steadily
    }));
    const kappa = curvatureForLap(turning, lap(0, 5), grid);
    expect(Math.max(...kappa.map(Math.abs))).toBeGreaterThan(0);
  });

  it("returns zeros for too-short laps", () => {
    expect(curvatureForLap([gpsSample(0, 0, 0, 0)], lap(0, 0), grid)).toEqual(grid.map(() => 0));
  });
});
