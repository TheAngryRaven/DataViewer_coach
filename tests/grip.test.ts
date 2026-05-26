import { describe, expect, it } from "vitest";
import type { Corner } from "../analysis/corners";
import {
  combinedAccelMps2,
  cornerGrip,
  gripEnvelopeMps2,
  lateralAccelMps2,
} from "../analysis/grip";

function corner(index: number, startIdx: number, endIdx: number, grid: number[]): Corner {
  return {
    index,
    startIdx,
    apexIdx: Math.floor((startIdx + endIdx) / 2),
    endIdx,
    startDist: grid[startIdx],
    apexDist: grid[Math.floor((startIdx + endIdx) / 2)],
    endDist: grid[endIdx],
    minSpeedMps: 0,
  };
}

describe("lateralAccelMps2", () => {
  it("is v^2 * |kappa|", () => {
    expect(lateralAccelMps2([10, 20], [0.01, -0.02])).toEqual([10 * 10 * 0.01, 20 * 20 * 0.02]);
  });
});

describe("combinedAccelMps2", () => {
  it("is the hypotenuse of lateral and longitudinal", () => {
    expect(combinedAccelMps2([3], [4])).toEqual([5]);
  });
});

describe("gripEnvelopeMps2", () => {
  it("takes a high percentile, ignoring single spikes", () => {
    // 0..10; p95 of 11 evenly spaced points lands at the top end, not the lone max.
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(gripEnvelopeMps2(values, 0.9)).toBe(9);
  });

  it("is 0 with no finite data", () => {
    expect(gripEnvelopeMps2([])).toBe(0);
  });
});

describe("cornerGrip", () => {
  const grid = Array.from({ length: 11 }, (_, i) => i * 10);

  it("flags unused grip when the apex is well under the envelope", () => {
    // Gentle corner: low lateral load relative to a high demonstrated envelope.
    const speed = [40, 30, 22, 30, 40, 40, 40, 40, 40, 40, 40];
    const lat = grid.map((_, i) => (i === 2 ? 6 : 2)); // ~0.6g at apex
    const long = grid.map(() => 0);
    const [g] = cornerGrip([corner(0, 0, 4, grid)], grid, speed, lat, long, 20); // envelope ~2g
    expect(g.unusedGrip).toBe(true);
    expect(g.scrubbing).toBe(false);
    expect(g.envelopeUtil).toBeCloseTo(6 / 20, 5);
  });

  it("flags scrubbing when minimum speed is held over a wide arc under load", () => {
    // Flat-bottomed speed trace: long stretch near V-Min, high lateral g throughout.
    const speed = [40, 20, 18, 18, 18, 18, 18, 20, 40, 40, 40];
    const lat = grid.map(() => 14); // ~1.4g sustained
    const long = grid.map(() => 0);
    const [g] = cornerGrip([corner(0, 0, 8, grid)], grid, speed, lat, long, 16);
    expect(g.scrubbing).toBe(true);
  });

  it("yields zero utilisation when no grip envelope is established", () => {
    const [g] = cornerGrip([corner(0, 0, 4, grid)], grid, [40, 30, 22, 30, 40, 40, 40, 40, 40, 40, 40], grid.map(() => 8), grid.map(() => 0), 0);
    expect(g.envelopeUtil).toBe(0);
  });

  it("does neither when not cornering hard enough", () => {
    const speed = [40, 38, 36, 38, 40];
    const lat = [1, 1, 1, 1, 1]; // below the min lateral threshold
    const long = [0, 0, 0, 0, 0];
    const [g] = cornerGrip([corner(0, 0, 4, [0, 10, 20, 30, 40])], [0, 10, 20, 30, 40], speed, lat, long, 20);
    expect(g.scrubbing).toBe(false);
    expect(g.unusedGrip).toBe(false);
  });
});
