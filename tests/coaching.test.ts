import { describe, expect, it } from "vitest";
import type { ApexOffset, CornerConsistency, CornerDelta, CornerExit } from "../analysis/segments";
import type { CornerGrip } from "../analysis/grip";
import {
  buildCornerInsights,
  cornerInsight,
  cornerInsightMessage,
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

function grip(
  cornerIndex: number,
  opts: { scrubbing?: boolean; unusedGrip?: boolean; envelopeUtil?: number } = {},
): CornerGrip {
  return {
    cornerIndex,
    apexLatAccelMps2: 12,
    apexCombinedAccelMps2: 12,
    envelopeUtil: opts.envelopeUtil ?? 0.9,
    unusedGrip: opts.unusedGrip ?? false,
    scrubbing: opts.scrubbing ?? false,
  };
}

describe("cornerInsight", () => {
  it("attributes loss to low min speed, firm on exit-critical corners", () => {
    const insight = cornerInsight({
      delta: delta(0, 300, 30, 28),
      exit: exit(0, true),
      apex: apex(0, true),
      consistency: consistency(0, 0.1),
    });
    expect(insight.rootCause).toBe("low_min_speed");
    expect(insight.confidence).toBe("high");
    expect(insight.evidence.minSpeedGapMps).toBeCloseTo(2, 5);
    expect(insight.evidence.exitCritical).toBe(true);
    expect(insight.evidence.apexOffsetM).toBe(5);
  });

  it("softens to medium when low min speed is not on an exit corner", () => {
    expect(cornerInsight({ delta: delta(1, 300, 30, 28), exit: exit(1, false) }).confidence).toBe("medium");
  });

  it("calls it corner_execution (low confidence) when apex speed matches but time is lost", () => {
    const insight = cornerInsight({ delta: delta(2, 300, 30, 29.95), exit: exit(2, true) });
    expect(insight.rootCause).toBe("corner_execution");
    expect(insight.confidence).toBe("low");
  });

  it("reports on-pace within the noise floor", () => {
    expect(cornerInsight({ delta: delta(3, 20, 30, 25), exit: exit(3, true) }).rootCause).toBe("none");
  });

  it("nulls the apex offset when the geometric apex is ill-defined", () => {
    expect(cornerInsight({ delta: delta(0, 300, 30, 28), apex: apex(0, false) }).evidence.apexOffsetM).toBeNull();
  });

  it("prioritises inconsistent_apex over low min speed, scaling confidence with lap count", () => {
    const many = cornerInsight({ delta: delta(0, 300, 30, 28), exit: exit(0, true), consistency: consistency(0, 1.2, 5) });
    expect(many.rootCause).toBe("inconsistent_apex");
    expect(many.confidence).toBe("high");
    expect(many.evidence.vMinStdevMps).toBeCloseTo(1.2, 5);

    const few = cornerInsight({ delta: delta(0, 300, 30, 28), exit: exit(0, true), consistency: consistency(0, 1.2, 3) });
    expect(few.confidence).toBe("medium");
  });

  it("needs at least two laps to call a corner inconsistent", () => {
    const insight = cornerInsight({ delta: delta(0, 300, 30, 28), exit: exit(0, true), consistency: consistency(0, 1.2, 1) });
    expect(insight.rootCause).toBe("low_min_speed");
    expect(insight.evidence.vMinStdevMps).toBeNull();
  });

  it("refines a min-speed loss into scrubbing or unused grip (advisory, low confidence)", () => {
    const scrub = cornerInsight({ delta: delta(0, 300, 30, 28), exit: exit(0, true), grip: grip(0, { scrubbing: true }) });
    expect(scrub.rootCause).toBe("scrubbing");
    expect(scrub.confidence).toBe("low");

    const unused = cornerInsight({ delta: delta(0, 300, 30, 28), grip: grip(0, { unusedGrip: true, envelopeUtil: 0.6 }) });
    expect(unused.rootCause).toBe("unused_grip");
    expect(unused.evidence.envelopeUtil).toBe(0.6);
  });

  it("caps confidence by the Stage-0 data-quality level", () => {
    const capped = cornerInsight(
      { delta: delta(0, 300, 30, 28), exit: exit(0, true) }, // would be low_min_speed / high
      undefined,
      "medium",
    );
    expect(capped.rootCause).toBe("low_min_speed");
    expect(capped.confidence).toBe("medium");
  });
});

describe("buildCornerInsights", () => {
  it("joins context, drops on-pace corners, and ranks by time lost", () => {
    const insights = buildCornerInsights(
      [delta(0, 120, 30, 29), delta(1, 20, 30, 30), delta(2, 400, 30, 27)],
      [exit(0, true), exit(2, true)],
      [],
      [],
      [],
    );
    expect(insights.map((i) => i.cornerIndex)).toEqual([2, 0]); // 400ms then 120ms; corner 1 (20ms) dropped
  });
});

describe("cornerInsightMessage", () => {
  const base: CornerInsight = {
    cornerIndex: 3,
    apexDist: 0,
    timeLostMs: 340,
    rootCause: "low_min_speed",
    confidence: "high",
    evidence: { minSpeedGapMps: 0.894, exitCritical: true, apexOffsetM: null, vMinStdevMps: null, envelopeUtil: null },
  };

  it("formats an exit-critical min-speed loss with 1-based corner + units, adding no new numbers", () => {
    const mph = cornerInsightMessage(base, false);
    expect(mph.key).toBe("low_min_speed_exit");
    expect(mph.params.corner).toBe(4);
    expect(mph.params.secs).toBe("0.34");
    expect(mph.params.gap).toBe("2.0 mph"); // 0.894 m/s
    expect(cornerInsightMessage(base, true).params.gap).toBe("3.2 km/h");
  });

  it("keys an inconsistent corner and formats the V-Min swing", () => {
    const msg = cornerInsightMessage(
      { ...base, rootCause: "inconsistent_apex", evidence: { ...base.evidence, vMinStdevMps: 0.894 } },
      false,
    );
    expect(msg.key).toBe("inconsistent_apex");
    expect(msg.params.swing).toBe("2.0 mph");
  });

  it("keys grip-based reads and surfaces the envelope utilisation percent", () => {
    expect(cornerInsightMessage({ ...base, rootCause: "scrubbing" }, false).key).toBe("scrubbing");
    const unused = cornerInsightMessage(
      { ...base, rootCause: "unused_grip", evidence: { ...base.evidence, envelopeUtil: 0.6 } },
      false,
    );
    expect(unused.key).toBe("unused_grip");
    expect(unused.params.util).toBe(60);
  });

  it("keys an unresolved cause", () => {
    expect(cornerInsightMessage({ ...base, rootCause: "corner_execution", confidence: "low" }, false).key).toBe(
      "corner_execution",
    );
  });

  it("distinguishes a non-exit min-speed loss and an on-pace corner", () => {
    expect(cornerInsightMessage({ ...base, evidence: { ...base.evidence, exitCritical: false } }, false).key).toBe(
      "low_min_speed",
    );
    expect(cornerInsightMessage({ ...base, rootCause: "none" }, false).key).toBe("none");
  });
});
