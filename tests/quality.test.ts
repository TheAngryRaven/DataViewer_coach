import { describe, expect, it } from "vitest";
import { assessQuality } from "../analysis/quality";
import { parsedData } from "./fixtures";

// parsedData() builds a single sample; extend it with the GPS-quality channels we read.
function dataWith(extra: Record<string, number>) {
  const data = parsedData([], {});
  data.samples = [
    { ...data.samples[0], extraFields: extra },
    { ...data.samples[0], t: 50, extraFields: extra },
  ];
  return data;
}

describe("assessQuality", () => {
  it("reads good quality from a strong fix at a high rate", () => {
    const q = assessQuality(dataWith({ hdop: 1.2, satellites: 11 }), 25);
    expect(q.level).toBe("good");
    expect(q.confidenceCap).toBe("high");
    expect(q.hdop).toBe(1.2);
    expect(q.satellites).toBe(11);
  });

  it("drops to poor on a weak fix and caps confidence to low", () => {
    const q = assessQuality(dataWith({ hdop: 7, satellites: 4 }), 25);
    expect(q.level).toBe("poor");
    expect(q.confidenceCap).toBe("low");
  });

  it("drops to poor on a low sample rate regardless of fix", () => {
    expect(assessQuality(dataWith({ hdop: 1, satellites: 12 }), 5).level).toBe("poor");
  });

  it("is fair in between, and missing fix channels don't force poor", () => {
    const noFix = assessQuality(parsedData([], {}), 12); // no hdop/sats, mid rate
    expect(noFix.level).toBe("fair");
    expect(noFix.hdop).toBeNull();
    expect(noFix.confidenceCap).toBe("medium");
  });
});
