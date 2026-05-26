import { describe, expect, it } from "vitest";
import type { ApexOffset, CornerConsistency, CornerDelta, CornerExit } from "../analysis/segments";
import {
  buildCornerInsights,
  cornerInsight,
  describeCornerInsight,
  type CornerInsight,
} from "../analysis/coaching";

function consistency(cornerIndex: number, vMinStdevMps: number, sampleSize = 5): CornerConsistency {
  return { cornerIndex, vMinStdevMps, vMinSpreadMps: vMinStdevMps * 2, sampleSize };
}

function delta(cornerIndex: number, timeLostMs: number, refMin: number, subjMin: number): CornerDelta {
  return {
    cornerIndex,
    startDist: 0,
    apexDist: cornerIndex * 100,
    endDist: 0,
    timeLostMs,
    subjectMinSpeedMps: subjMin,
    referenceMinSpeedMps: refMin,
  };
}

function exit(cornerIndex: number, exitCritical: boolean): CornerExit {
  return { cornerIndex, exitSpeedMps: 40, followingStraightM: exitCritical ? 200 : 0, exitCritical };
}

function apex(cornerIndex: number, confident: boolean, offsetM = 5): ApexOffset {
  return { cornerIndex, vMinDist: 0, geoApexDist: 0, offsetM, kind: "late", confident };
}

describe("cornerInsight", () => {
  it("attributes loss to low min speed, firm on exit-critical corners", () => {
    const insight = cornerInsight(delta(0, 300, 30, 28), exit(0, true), apex(0, true), consistency(0, 0.1));
    expect(insight.rootCause).toBe("low_min_speed");
    expect(insight.confidence).toBe("high");
    expect(insight.evidence.minSpeedGapMps).toBeCloseTo(2, 5);
    expect(insight.evidence.exitCritical).toBe(true);
    expect(insight.evidence.apexOffsetM).toBe(5);
  });

  it("softens to medium when low min speed is not on an exit corner", () => {
    expect(cornerInsight(delta(1, 300, 30, 28), exit(1, false), undefined, undefined).confidence).toBe("medium");
  });

  it("calls it corner_execution (low confidence) when apex speed matches but time is lost", () => {
    const insight = cornerInsight(delta(2, 300, 30, 29.95), exit(2, true), undefined, undefined);
    expect(insight.rootCause).toBe("corner_execution");
    expect(insight.confidence).toBe("low");
  });

  it("reports on-pace within the noise floor", () => {
    expect(cornerInsight(delta(3, 20, 30, 25), exit(3, true), undefined, undefined).rootCause).toBe("none");
  });

  it("nulls the apex offset when the geometric apex is ill-defined", () => {
    expect(
      cornerInsight(delta(0, 300, 30, 28), undefined, apex(0, false), undefined).evidence.apexOffsetM,
    ).toBeNull();
  });

  it("prioritises inconsistent_apex over low min speed when V-Min swings, scaling confidence with lap count", () => {
    // Big variance AND a min-speed deficit: consistency wins (it's the prerequisite to pace).
    const many = cornerInsight(delta(0, 300, 30, 28), exit(0, true), undefined, consistency(0, 1.2, 5));
    expect(many.rootCause).toBe("inconsistent_apex");
    expect(many.confidence).toBe("high");
    expect(many.evidence.vMinStdevMps).toBeCloseTo(1.2, 5);

    const few = cornerInsight(delta(0, 300, 30, 28), exit(0, true), undefined, consistency(0, 1.2, 3));
    expect(few.confidence).toBe("medium");
  });

  it("needs at least two laps to call a corner inconsistent", () => {
    const insight = cornerInsight(delta(0, 300, 30, 28), exit(0, true), undefined, consistency(0, 1.2, 1));
    expect(insight.rootCause).toBe("low_min_speed"); // variance ignored with one lap
    expect(insight.evidence.vMinStdevMps).toBeNull();
  });
});

describe("buildCornerInsights", () => {
  it("joins context, drops on-pace corners, and ranks by time lost", () => {
    const insights = buildCornerInsights(
      [delta(0, 120, 30, 29), delta(1, 20, 30, 30), delta(2, 400, 30, 27)],
      [exit(0, true), exit(2, true)],
      [],
      [],
    );
    expect(insights.map((i) => i.cornerIndex)).toEqual([2, 0]); // 400ms then 120ms; corner 1 (20ms) dropped
  });
});

describe("describeCornerInsight", () => {
  const base: CornerInsight = {
    cornerIndex: 3,
    apexDist: 0,
    timeLostMs: 340,
    rootCause: "low_min_speed",
    confidence: "high",
    evidence: { minSpeedGapMps: 0.894, exitCritical: true, apexOffsetM: null, vMinStdevMps: null },
  };

  it("phrases an exit-critical min-speed loss with units, adding no new numbers", () => {
    const mph = describeCornerInsight(base, false);
    expect(mph).toContain("Corner 4");
    expect(mph).toContain("0.34s");
    expect(mph).toContain("2.0 mph"); // 0.894 m/s
    expect(mph).toContain("compounds");
    expect(describeCornerInsight(base, true)).toContain("3.2 km/h");
  });

  it("is honest when the cause is unresolved", () => {
    const note = describeCornerInsight({ ...base, rootCause: "corner_execution", confidence: "low" }, false);
    expect(note).toContain("entry/line/exit");
  });

  it("phrases an inconsistent corner around the V-Min swing", () => {
    const note = describeCornerInsight(
      { ...base, rootCause: "inconsistent_apex", evidence: { ...base.evidence, vMinStdevMps: 0.894 } },
      false,
    );
    expect(note).toContain("swings about 2.0 mph");
    expect(note).toContain("Repeating");
  });

  it("phrases a non-exit min-speed loss and an on-pace corner", () => {
    const offStraight = describeCornerInsight(
      { ...base, evidence: { ...base.evidence, exitCritical: false } },
      false,
    );
    expect(offStraight).toContain("minimum speed");
    expect(offStraight).not.toContain("compounds");
    expect(describeCornerInsight({ ...base, rootCause: "none" }, false)).toContain("on your best pace");
  });
});
