import { describe, expect, it } from "vitest";
import type { GpsSample, Lap, ParsedData } from "@/types/racing";
import { buildSession, detectChannels } from "../analysis/session";

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

function sample(extraFields: Record<string, number>): GpsSample {
  return {
    t: 0,
    lat: 0,
    lon: 0,
    speedMps: 0,
    speedMph: 0,
    speedKph: 0,
    extraFields,
  };
}

function parsed(fieldMappings: Record<string, string>, extraFields: Record<string, number>): ParsedData {
  return {
    samples: [sample(extraFields)],
    fieldMappings,
    bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
    duration: 0,
  };
}

describe("detectChannels", () => {
  it("returns [] for pure GPS data", () => {
    expect(detectChannels(parsed({ lat: "Latitude", lon: "Longitude" }, {}))).toEqual([]);
  });

  it("detects channels from field mappings and extraFields (case-insensitive)", () => {
    const data = parsed({ RPM: "engine_rpm" }, { lat_g: 0.8 });
    expect(detectChannels(data).sort()).toEqual(["lat_g", "rpm"]);
  });

  it("ignores unknown channels", () => {
    expect(detectChannels(parsed({ water_temp: "wt" }, { tyre_temp: 60 }))).toEqual([]);
  });
});

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
    expect(session.channels).toEqual([]);
  });

  it("carries channel detection when data is present, and 0 speed for no laps", () => {
    const session = buildSession(parsed({ rpm: "rpm" }, {}), []);
    expect(session.topSpeedMph).toBe(0);
    expect(session.channels).toEqual(["rpm"]);
  });
});
