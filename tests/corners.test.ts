import { describe, expect, it } from "vitest";
import { detectCornersByCurvature, detectCornersBySpeed } from "../analysis/corners";

// A grid of 21 points; speed dips into two clear corners (apex ~5 and ~15).
const grid = Array.from({ length: 21 }, (_, i) => i * 10);
function vAt(i: number): number {
  if (i <= 5) return 30 - 4 * i; // 30 -> 10 at idx 5
  if (i <= 10) return 10 + 4 * (i - 5); // 10 -> 30 at idx 10
  if (i <= 15) return 30 - 3.6 * (i - 10); // 30 -> 12 at idx 15
  return 12 + 3.6 * (i - 15); // 12 -> 30 at idx 20
}
const speed = grid.map((_, i) => vAt(i));

describe("detectCornersBySpeed", () => {
  it("finds both speed valleys with apex and window bounds", () => {
    const corners = detectCornersBySpeed(grid, speed);
    expect(corners).toHaveLength(2);

    expect(corners[0].apexIdx).toBe(5);
    expect(corners[0].minSpeedMps).toBeCloseTo(10, 5);
    expect(corners[0].startIdx).toBeLessThan(corners[0].apexIdx);
    expect(corners[0].endIdx).toBeGreaterThan(corners[0].apexIdx);
    expect(corners[0].apexDist).toBe(50);

    expect(corners[1].apexIdx).toBe(15);
    expect(corners[1].minSpeedMps).toBeCloseTo(12, 5);
    expect(corners[1].index).toBe(1);
  });

  it("ignores tiny wiggles below the prominence threshold", () => {
    const flatish = grid.map((_, i) => 30 + (i % 2 === 0 ? 0 : -0.3));
    expect(detectCornersBySpeed(grid, flatish)).toEqual([]);
  });

  it("returns nothing for flat speed or degenerate input", () => {
    expect(detectCornersBySpeed(grid, grid.map(() => 25))).toEqual([]);
    expect(detectCornersBySpeed([0, 1], [10, 10])).toEqual([]);
    expect(detectCornersBySpeed([0, 1, 2], [10, 9])).toEqual([]); // length mismatch
  });
});

describe("detectCornersByCurvature", () => {
  // |curvature| bumps up in two corners; the apex is the curvature peak.
  function kappaAt(i: number): number {
    if (i >= 3 && i <= 7) return 0.04 - Math.abs(i - 5) * 0.005; // peak 0.04 at idx 5
    if (i >= 13 && i <= 17) return 0.03 - Math.abs(i - 15) * 0.004; // peak 0.03 at idx 15
    return 0;
  }
  const curvature = grid.map((_, i) => (i % 2 === 0 ? 1 : -1) * kappaAt(i)); // sign alternates; magnitude matters

  it("finds curvature peaks as geometric apexes", () => {
    const corners = detectCornersByCurvature(grid, curvature, speed);
    expect(corners).toHaveLength(2);
    expect(corners[0].apexIdx).toBe(5);
    expect(corners[1].apexIdx).toBe(15);
    // minSpeedMps still reports the slowest speed within the window.
    expect(corners[0].minSpeedMps).toBeCloseTo(10, 5);
  });

  it("returns nothing for a straight (zero curvature) or mismatched lengths", () => {
    expect(detectCornersByCurvature(grid, grid.map(() => 0), speed)).toEqual([]);
    expect(detectCornersByCurvature(grid, [0, 0], speed)).toEqual([]);
  });
});
