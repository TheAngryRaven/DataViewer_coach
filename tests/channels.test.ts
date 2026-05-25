import { describe, expect, it } from "vitest";
import { detectCapabilities, presentChannelIds } from "../analysis/channels";
import { parsedData } from "./fixtures";

describe("presentChannelIds", () => {
  it("unions field-mapping ids and the first sample's extraFields ids", () => {
    const ids = presentChannelIds(parsedData(["rpm"], { lat_g: 0.5 }));
    expect(ids.has("rpm")).toBe(true);
    expect(ids.has("lat_g")).toBe(true);
  });
});

describe("detectCapabilities", () => {
  it("reads pure GPS (no g, no inputs)", () => {
    const caps = detectCapabilities(parsedData(["satellites", "hdop", "altitude"], {}));
    expect(caps).toEqual({
      hasG: false,
      measuredG: false,
      throttle: false,
      brake: false,
      rpm: false,
    });
  });

  it("treats GPS-derived lat_g/lon_g as g present but not measured", () => {
    const caps = detectCapabilities(parsedData(["lat_g", "lon_g"], {}));
    expect(caps.hasG).toBe(true);
    expect(caps.measuredG).toBe(false);
  });

  it("treats raw IMU accel_* as measured g", () => {
    const caps = detectCapabilities(parsedData(["lat_g"], { accel_x: 0.1, accel_y: 0.2 }));
    expect(caps.measuredG).toBe(true);
    expect(caps.hasG).toBe(true);
  });

  it("treats *_native g as measured", () => {
    expect(detectCapabilities(parsedData(["lat_g_native"], {})).measuredG).toBe(true);
  });

  it("flags driver-input and engine channels", () => {
    const caps = detectCapabilities(parsedData(["throttle", "brake", "rpm"], {}));
    expect(caps.throttle).toBe(true);
    expect(caps.brake).toBe(true);
    expect(caps.rpm).toBe(true);
  });
});
