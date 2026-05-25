import { describe, expect, it } from "vitest";
import { longitudinalAccel, movingAverage, sampleRateHz } from "../analysis/signal";
import { gpsSample } from "./fixtures";

describe("sampleRateHz", () => {
  it("is the reciprocal of the median sample interval", () => {
    const samples = Array.from({ length: 5 }, (_, i) => gpsSample(i * 50, 0, 0, 0)); // 50 ms -> 20 Hz
    expect(sampleRateHz(samples)).toBeCloseTo(20, 5);
  });

  it("is robust to an irregular gap", () => {
    const samples = [0, 40, 80, 600, 640].map((t) => gpsSample(t, 0, 0, 0)); // median 40 ms -> 25 Hz
    expect(sampleRateHz(samples)).toBeCloseTo(25, 5);
  });

  it("returns 0 when it cannot be determined", () => {
    expect(sampleRateHz([])).toBe(0);
    expect(sampleRateHz([gpsSample(0, 0, 0, 0)])).toBe(0);
  });
});

describe("movingAverage", () => {
  it("smooths with edge clamping", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 1)).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  it("returns a copy when the radius is non-positive", () => {
    const input = [1, 2, 3];
    expect(movingAverage(input, 0)).toEqual(input);
    expect(movingAverage(input, 0)).not.toBe(input);
  });
});

describe("longitudinalAccel", () => {
  it("is constant for linearly rising speed", () => {
    expect(longitudinalAccel([0, 10, 20], [0, 1000, 2000])).toEqual([10, 10, 10]);
  });

  it("is negative under braking", () => {
    const accel = longitudinalAccel([30, 20, 10], [0, 1000, 2000]);
    expect(accel.every((a) => a < 0)).toBe(true);
  });

  it("returns zeros for fewer than two points", () => {
    expect(longitudinalAccel([5], [0])).toEqual([0]);
  });
});
