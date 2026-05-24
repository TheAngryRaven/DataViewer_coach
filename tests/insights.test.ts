import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import {
  fastestLap,
  formatLapTime,
  formatLapTimeMs,
  formatSpeed,
} from "../analysis/insights";

/** A host Lap fixture; only the fields under test are filled meaningfully. */
function lap(lapNumber: number, lapTimeMs: number): Lap {
  return {
    lapNumber,
    lapTimeMs,
    startTime: 0,
    endTime: lapTimeMs,
    maxSpeedMph: 0,
    maxSpeedKph: 0,
    minSpeedMph: 0,
    minSpeedKph: 0,
    startIndex: 0,
    endIndex: 0,
  };
}

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

describe("formatLapTimeMs", () => {
  it("converts milliseconds to m:ss.mmm", () => {
    expect(formatLapTimeMs(83456)).toBe("1:23.456");
    expect(formatLapTimeMs(62300)).toBe("1:02.300");
  });
});

describe("fastestLap", () => {
  const laps = [lap(1, 84123), lap(2, 82500), lap(3, 83001)];

  it("returns the lap with the lowest time", () => {
    expect(fastestLap(laps)?.lapNumber).toBe(2);
  });

  it("returns null for an empty session", () => {
    expect(fastestLap([])).toBeNull();
  });

  // Regression: the host Lap carries `lapTimeMs`, not `lapTime`. Reading the
  // missing field made every comparison `undefined < undefined` (false), so
  // fastestLap silently returned the first lap and formatting rendered NaN.
  it("ranks by lapTimeMs, not a non-existent lapTime field", () => {
    const best = fastestLap(laps);
    expect(best?.lapNumber).toBe(2);
    expect(formatLapTimeMs(best!.lapTimeMs)).toBe("1:22.500");
    expect(Number.isNaN(best!.lapTimeMs)).toBe(false);
  });
});

describe("formatSpeed", () => {
  it("respects the unit preference", () => {
    expect(formatSpeed(62.137, 100, false)).toBe("62.1 mph");
    expect(formatSpeed(62.137, 100, true)).toBe("100.0 km/h");
  });
});
