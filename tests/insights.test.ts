import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import {
  deltaToFastest,
  fastestLap,
  findLap,
  formatDelta,
  formatLapTime,
} from "../analysis/insights";

const laps: Lap[] = [
  { lapNumber: 1, lapTime: 84.123 },
  { lapNumber: 2, lapTime: 82.5 },
  { lapNumber: 3, lapTime: 83.001 },
];

describe("formatLapTime", () => {
  it("formats sub-minute and over-minute times as m:ss.mmm", () => {
    expect(formatLapTime(83.456)).toBe("1:23.456");
    expect(formatLapTime(3.2)).toBe("0:03.200");
    expect(formatLapTime(0)).toBe("0:00.000");
  });

  it("guards against invalid input", () => {
    expect(formatLapTime(-1)).toBe("--:--.---");
    expect(formatLapTime(Number.NaN)).toBe("--:--.---");
  });
});

describe("fastestLap", () => {
  it("returns the lap with the lowest time", () => {
    expect(fastestLap(laps)?.lapNumber).toBe(2);
  });

  it("returns null for an empty session", () => {
    expect(fastestLap([])).toBeNull();
  });
});

describe("findLap", () => {
  it("finds a lap by number", () => {
    expect(findLap(laps, 3)?.lapTime).toBe(83.001);
  });

  it("returns null when not selected or not found", () => {
    expect(findLap(laps, null)).toBeNull();
    expect(findLap(laps, 99)).toBeNull();
  });
});

describe("deltaToFastest", () => {
  it("computes the gap to the session best", () => {
    expect(deltaToFastest(laps, 1)).toBeCloseTo(1.623, 3);
    expect(deltaToFastest(laps, 2)).toBe(0);
  });

  it("returns null when there is nothing to compare", () => {
    expect(deltaToFastest(laps, null)).toBeNull();
    expect(deltaToFastest([], 1)).toBeNull();
  });
});

describe("formatDelta", () => {
  it("signs the delta", () => {
    expect(formatDelta(0.42)).toBe("+0.420s");
    expect(formatDelta(-0.42)).toBe("-0.420s");
    expect(formatDelta(0)).toBe("0.000s");
  });
});
