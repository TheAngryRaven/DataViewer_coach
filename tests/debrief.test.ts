import { describe, expect, it } from "vitest";
import type { Session, SessionLap } from "../analysis/session";
import {
  buildDebrief,
  consistency,
  median,
  takeaway,
  theoreticalBestMs,
  validSessionLaps,
} from "../analysis/debrief";

function sLap(lapNumber: number, lapTimeMs: number, sectors?: SessionLap["sectors"]): SessionLap {
  return { lapNumber, lapTimeMs, maxSpeedMph: 0, maxSpeedKph: 0, ...(sectors ? { sectors } : {}) };
}

function session(laps: SessionLap[], topMph = 0, topKph = 0): Session {
  return { laps, topSpeedMph: topMph, topSpeedKph: topKph, channels: [] };
}

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("is NaN for an empty list", () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("validSessionLaps", () => {
  it("drops slow outliers (out/in/aborted laps)", () => {
    const laps = [sLap(1, 90000), sLap(2, 62000), sLap(3, 62500), sLap(4, 63000)];
    const valid = validSessionLaps(laps).map((l) => l.lapNumber);
    expect(valid).toEqual([2, 3, 4]); // median ~62750, cutoff ~87850 drops the 90s out-lap
  });

  it("keeps a single lap", () => {
    expect(validSessionLaps([sLap(1, 90000)])).toHaveLength(1);
  });
});

describe("consistency", () => {
  it("computes mean, sample stdev and spread", () => {
    const stats = consistency([62000, 63000, 64000]);
    expect(stats).not.toBeNull();
    expect(stats!.meanMs).toBe(63000);
    expect(stats!.spreadMs).toBe(2000);
    expect(stats!.stdevMs).toBeCloseTo(1000, 0);
    expect(stats!.sampleSize).toBe(3);
  });

  it("is null with fewer than two laps", () => {
    expect(consistency([62000])).toBeNull();
    expect(consistency([])).toBeNull();
  });
});

describe("theoreticalBestMs", () => {
  it("sums the best time in each sector across laps", () => {
    const laps = [
      sLap(1, 62000, { s1: 20000, s2: 21000, s3: 21000 }),
      sLap(2, 62500, { s1: 19500, s2: 21500, s3: 21500 }),
    ];
    // best s1 19500 + best s2 21000 + best s3 21000 = 61500
    expect(theoreticalBestMs(laps)).toBe(61500);
  });

  it("returns null when no sectors are present", () => {
    expect(theoreticalBestMs([sLap(1, 62000), sLap(2, 62500)])).toBeNull();
  });

  it("sums only the sectors that exist", () => {
    const laps = [sLap(1, 62000, { s1: 30000, s2: 32000 }), sLap(2, 61000, { s1: 29000 })];
    expect(theoreticalBestMs(laps)).toBe(29000 + 32000);
  });
});

describe("takeaway", () => {
  it("nudges for more laps when there is only one clean lap", () => {
    const msg = takeaway(sLap(1, 62300), 1, null);
    expect(msg).toContain("One clean lap");
    expect(msg).toContain("1:02.300");
  });

  it("leads with inconsistency when the average gap to best is meaningful", () => {
    const stats = consistency([62300, 63100, 63500]); // mean 62966, best 62300 -> gap ~0.7s
    const msg = takeaway(sLap(1, 62300), 3, stats);
    expect(msg).toContain("inconsistency");
    expect(msg).toContain("1:02.300");
  });

  it("calls a tight session out when the gap is small", () => {
    const stats = consistency([62300, 62350, 62400]); // gap ~0.05s
    const msg = takeaway(sLap(1, 62300), 3, stats);
    expect(msg).toContain("Tight session");
  });
});

describe("buildDebrief", () => {
  it("produces a full session-level debrief", () => {
    const laps = [
      sLap(1, 90000), // out-lap, slow outlier
      sLap(2, 62300, { s1: 20000, s2: 21000, s3: 21300 }),
      sLap(3, 63100, { s1: 20500, s2: 21200, s3: 21400 }),
      sLap(4, 63500, { s1: 20300, s2: 21300, s3: 21900 }),
    ];
    const debrief = buildDebrief(session(laps, 63.8, 102.7));

    expect(debrief.lapsAnalysed).toBe(4);
    expect(debrief.validLaps).toBe(3);
    expect(debrief.best).toEqual({ lapNumber: 2, lapTimeMs: 62300 });
    expect(debrief.consistency?.sampleSize).toBe(3);
    expect(debrief.theoreticalBestMs).toBe(20000 + 21000 + 21300);
    expect(debrief.topSpeedMph).toBe(63.8);
    expect(debrief.topSpeedKph).toBe(102.7);
    expect(debrief.takeaway).toContain("1:02.300");
  });

  it("handles an empty session", () => {
    const debrief = buildDebrief(session([]));
    expect(debrief.lapsAnalysed).toBe(0);
    expect(debrief.best).toBeNull();
    expect(debrief.consistency).toBeNull();
    expect(debrief.theoreticalBestMs).toBeNull();
    expect(debrief.topSpeedMph).toBeNull();
  });
});
