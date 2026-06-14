import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatInteger,
  formatNumber,
  formatSignedDelta,
} from "@/lib/i18n/format";
import { formatLapTime, formatSpeed } from "../analysis/insights";

// Locale-aware number rendering. English is the canonical default; German
// exercises the comma-decimal / dot-grouping path so we know localization is
// actually wired (not just `toFixed`). Requires a full-ICU Node (CI uses 22).

describe("formatDecimal", () => {
  it("uses fixed fraction digits with the locale's decimal separator", () => {
    expect(formatDecimal(2, "en", 1)).toBe("2.0");
    expect(formatDecimal(2, "de", 1)).toBe("2,0");
    expect(formatDecimal(0.34, "en", 2)).toBe("0.34");
    expect(formatDecimal(0.34, "de", 2)).toBe("0,34");
  });
});

describe("formatInteger", () => {
  it("groups thousands per locale", () => {
    expect(formatInteger(1200, "en")).toBe("1,200");
    expect(formatInteger(1200, "de")).toBe("1.200");
    expect(formatInteger(42, "fr")).toBe("42");
  });
});

describe("formatNumber", () => {
  it("trims trailing zeros up to the precision cap", () => {
    expect(formatNumber(12, "en")).toBe("12");
    expect(formatNumber(12.5, "en")).toBe("12.5");
    expect(formatNumber(12.5, "de")).toBe("12,5");
  });
});

describe("formatSignedDelta", () => {
  it("adds + for positives, keeps - for negatives, no sign on zero", () => {
    expect(formatSignedDelta(1, "en")).toBe("+1");
    expect(formatSignedDelta(-1, "en")).toBe("-1");
    expect(formatSignedDelta(0, "en")).toBe("0");
    expect(formatSignedDelta(0.25, "en")).toBe("+0.25");
    expect(formatSignedDelta(0.25, "de")).toBe("+0,25");
  });
});

describe("locale-aware lap time + speed", () => {
  it("localizes the lap-time decimal and the speed number, not the units", () => {
    expect(formatLapTime(83.456, "en")).toBe("1:23.456");
    expect(formatLapTime(83.456, "de")).toBe("1:23,456");
    expect(formatSpeed(62.137, 100, false, "de")).toBe("62,1 mph");
    expect(formatSpeed(62.137, 100, true, "de")).toBe("100,0 km/h");
  });
});
