import { describe, expect, it } from "vitest";
import { detectCorners } from "../analysis/corners";

// A grid of 21 points; speed dips into two clear corners (apex ~5 and ~15).
const grid = Array.from({ length: 21 }, (_, i) => i * 10);
function vAt(i: number): number {
  if (i <= 5) return 30 - 4 * i; // 30 -> 10 at idx 5
  if (i <= 10) return 10 + 4 * (i - 5); // 10 -> 30 at idx 10
  if (i <= 15) return 30 - 3.6 * (i - 10); // 30 -> 12 at idx 15
  return 12 + 3.6 * (i - 15); // 12 -> 30 at idx 20
}
const speed = grid.map((_, i) => vAt(i));

describe("detectCorners", () => {
  it("finds both speed valleys with apex and window bounds", () => {
    const corners = detectCorners(grid, speed);
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
    expect(detectCorners(grid, flatish)).toEqual([]);
  });

  it("returns nothing for flat speed or degenerate input", () => {
    expect(detectCorners(grid, grid.map(() => 25))).toEqual([]);
    expect(detectCorners([0, 1], [10, 10])).toEqual([]);
    expect(detectCorners([0, 1, 2], [10, 9])).toEqual([]); // length mismatch
  });
});
