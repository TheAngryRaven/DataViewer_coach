import { describe, expect, it } from "vitest";
import type { Lap } from "@/types/racing";
import { buildSession } from "../analysis/session";
import { parsedData } from "./fixtures";

function lap(lapNumber: number, lapTimeMs: number, maxMph: number, maxKph: number): Lap {
  return {
    lapNumber,
    lapTimeMs,
    startTime: 0,
    endTime: lapTimeMs,
    maxSpeedMph: maxMph,
    maxSpeedKph: maxKph,
    minSpeedMph: 0,
    minSpeedKph: 0,
    startIndex: 0,
    endIndex: 0,
  };
}

describe("buildSession", () => {
  it("reduces host laps and takes the session top speed", () => {
    const session = buildSession(null, [
      lap(1, 84123, 60.2, 96.9),
      lap(2, 82500, 63.8, 102.7),
    ]);
    expect(session.laps).toHaveLength(2);
    expect(session.laps[0].lapTimeMs).toBe(84123);
    expect(session.topSpeedMph).toBe(63.8);
    expect(session.topSpeedKph).toBe(102.7);
    expect(session.capabilities.hasG).toBe(false);
  });

  it("detects capabilities when data is present, and 0 speed for no laps", () => {
    const session = buildSession(parsedData(["rpm", "throttle"], {}), []);
    expect(session.topSpeedMph).toBe(0);
    expect(session.capabilities.rpm).toBe(true);
    expect(session.capabilities.throttle).toBe(true);
  });
});
