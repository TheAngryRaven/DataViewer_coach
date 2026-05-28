import { describe, expect, it } from "vitest";
import type { FieldMapping, GpsSample, Lap, ParsedData } from "@/types/racing";
import type { PluginSnapshot } from "@/plugins/panels";
import type { VehicleSetup } from "@/plugins/setup";
import {
  buildCoachingReport,
  GRID_POINTS,
  SNAPSHOT_LAP_NUMBER,
  type ReportInput,
} from "../analysis/report";
import { gpsSample } from "./fixtures";

// A V-shaped speed trace: one clear corner per lap (apex at the middle sample).
function speedAt(i: number): number {
  return i <= 10 ? 30 - 2 * i : 10 + 2 * (i - 10);
}

// Heading holds straight, then sweeps sharply through the apex and straightens
// again, so the path has a real curvature peak for the curvature method to find.
function headingDeg(i: number): number {
  if (i <= 8) return 90;
  if (i <= 11) return 90 - 30 * (i - 8);
  return 0;
}

function lapRun(startT: number, dt: number): GpsSample[] {
  return Array.from({ length: 21 }, (_, i) => ({
    ...gpsSample(startT + i * dt, 0, i * 0.0002, speedAt(i), { throttle: i > 10 ? 80 : 0 }),
    heading: headingDeg(i),
  }));
}

function fieldMappings(ids: string[]): Record<string, FieldMapping> {
  const out: Record<string, FieldMapping> = {};
  for (const id of ids) out[id] = { name: id, label: id, unit: "%" };
  return out;
}

// Lap 1 is slower (50 ms/sample) than lap 2 (40 ms/sample), so lap 2 is the best.
const samples: GpsSample[] = [...lapRun(0, 50), ...lapRun(2000, 40)];

const laps: Lap[] = [
  mkLap(1, 0, 20, 1000, { s1: 340, s2: 330, s3: 330 }),
  mkLap(2, 21, 41, 800, { s1: 270, s2: 265, s3: 265 }),
];

function mkLap(
  lapNumber: number,
  startIndex: number,
  endIndex: number,
  lapTimeMs: number,
  sectors: { s1: number; s2: number; s3: number },
): Lap {
  return {
    lapNumber,
    startTime: 0,
    endTime: lapTimeMs,
    lapTimeMs,
    maxSpeedMph: 60,
    maxSpeedKph: 96,
    minSpeedMph: 22,
    minSpeedKph: 36,
    startIndex,
    endIndex,
    sectors,
  };
}

const data: ParsedData = {
  samples,
  fieldMappings: fieldMappings(["throttle", "altitude"]),
  bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0.02 },
  duration: 2800,
};

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    data,
    laps,
    selectedLapNumber: 1,
    course: null,
    useKph: false,
    ...overrides,
  };
}

describe("buildCoachingReport", () => {
  it("assembles the full distance-domain report for a two-lap session", () => {
    const report = buildCoachingReport(input());

    expect(report.bestLapNumber).toBe(2);
    expect(report.subjectLapNumber).toBe(1);
    expect(report.grid).toHaveLength(GRID_POINTS);
    expect(report.profiles).toHaveLength(2);
    expect(report.corners.length).toBeGreaterThanOrEqual(1);
    expect(report.deltaMs).toHaveLength(GRID_POINTS);
    expect(report.cornerDeltas).toHaveLength(report.corners.length);
    expect(report.braking).toHaveLength(report.corners.length);
    expect(report.apex).toHaveLength(report.corners.length);
    expect(["early", "late", "on"]).toContain(report.apex[0].kind);
    expect(report.exits).toHaveLength(report.corners.length);
    expect(typeof report.exits[0].exitCritical).toBe("boolean");
    // Subject lap is slower, so at least one attributed insight should surface.
    expect(report.insights.length).toBeGreaterThanOrEqual(1);
    expect(["inconsistent_apex", "scrubbing", "unused_grip", "low_min_speed", "corner_execution"]).toContain(
      report.insights[0].rootCause,
    );
    expect(report.grip).toHaveLength(report.corners.length);
    expect(["good", "fair", "poor"]).toContain(report.quality.level);
    // Subject lap is slower overall, so it should show net time lost somewhere.
    expect(report.deltaMs[report.deltaMs.length - 1]).toBeGreaterThan(0);
    expect(report.sectorDeltas).toHaveLength(3);
  });

  it("gates throttle insight on the throttle capability", () => {
    const withThrottle = buildCoachingReport(input());
    expect(withThrottle.capabilities.throttle).toBe(true);
    expect(withThrottle.throttle).toHaveLength(withThrottle.corners.length);

    const noThrottle: ParsedData = {
      ...data,
      samples: samples.map((s) => ({ ...s, extraFields: {} })),
      fieldMappings: fieldMappings(["altitude"]),
    };
    const report = buildCoachingReport(input({ data: noThrottle }));
    expect(report.capabilities.throttle).toBe(false);
    expect(report.throttle).toEqual([]);
  });

  it("segments corners by curvature when that method is requested", () => {
    const speedReport = buildCoachingReport(input({ cornerMethod: "speed" }));
    const curvatureReport = buildCoachingReport(input({ cornerMethod: "curvature" }));

    expect(speedReport.cornerMethod).toBe("speed");
    expect(curvatureReport.cornerMethod).toBe("curvature");
    expect(curvatureReport.corners.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the second-best lap when none is selected", () => {
    const report = buildCoachingReport(input({ selectedLapNumber: null }));
    expect(report.bestLapNumber).toBe(2);
    expect(report.subjectLapNumber).toBe(1);
  });

  it("returns a safe empty report without data", () => {
    const report = buildCoachingReport(input({ data: null }));
    expect(report.grid).toEqual([]);
    expect(report.corners).toEqual([]);
    expect(report.debrief.lapsAnalysed).toBe(2);
  });

  it("detects corners but skips comparison for a single lap", () => {
    const report = buildCoachingReport(input({ laps: [laps[1]], selectedLapNumber: null }));
    expect(report.bestLapNumber).toBe(2);
    expect(report.subjectLapNumber).toBeNull();
    expect(report.corners.length).toBeGreaterThanOrEqual(1);
    expect(report.cornerDeltas).toEqual([]);
    expect(report.braking).toHaveLength(report.corners.length);
  });

  it("defaults referenceSource to best-lap when no snapshot is loaded", () => {
    const report = buildCoachingReport(input());
    expect(report.referenceSource).toBe("best-lap");
    expect(report.snapshotReference).toBeNull();
    expect(report.baselineDeltaMs).toBeNull();
    expect(report.setupChanges).toEqual([]);
  });
});

function setup(overrides: Partial<VehicleSetup> = {}): VehicleSetup {
  return {
    id: "s",
    vehicleId: "k",
    templateId: "tag",
    name: "n",
    unitSystem: "mm",
    tireBrand: "MG",
    psiMode: "halves",
    psiFrontLeft: 12,
    psiFrontRight: 12,
    psiRearLeft: 11,
    psiRearRight: 11,
    tireWidthMode: "halves",
    tireWidthFrontLeft: null,
    tireWidthFrontRight: null,
    tireWidthRearLeft: null,
    tireWidthRearRight: null,
    tireDiameterMode: "halves",
    tireDiameterFrontLeft: null,
    tireDiameterFrontRight: null,
    tireDiameterRearLeft: null,
    tireDiameterRearRight: null,
    customFields: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function snapshot(overrides: Partial<PluginSnapshot> = {}): PluginSnapshot {
  // Reuse the lap-2 sample slice as a snapshot baseline (a clean lap from
  // another session, by contract).
  const snapSamples = samples.slice(21, 42);
  return {
    id: "snap-1",
    engine: "Rotax",
    trackName: "Test Track",
    courseName: "Sprint",
    lapTimeMs: 820,
    sourceFileName: "session.csv",
    sourceLapNumber: 2,
    samples: snapSamples,
    course: {
      name: "Sprint",
      startFinishA: { lat: 0, lon: 0 },
      startFinishB: { lat: 0.0001, lon: 0 },
    },
    setup: setup({ id: "baseline" }),
    ...overrides,
  };
}

describe("buildCoachingReport with an active snapshot", () => {
  it("uses the snapshot as the reference profile when loaded", () => {
    const report = buildCoachingReport(input({ activeSnapshot: snapshot() }));
    expect(report.referenceSource).toBe("snapshot");
    expect(report.snapshotReference).toMatchObject({
      engine: "Rotax",
      trackName: "Test Track",
      courseName: "Sprint",
    });
    expect(report.referenceProfile?.lapNumber).toBe(SNAPSHOT_LAP_NUMBER);
    // In-session laps still resampled on the snapshot's grid for comparison.
    expect(report.profiles).toHaveLength(2);
    expect(report.profiles.every((p) => p.grid === report.referenceProfile?.grid)).toBe(true);
  });

  it("computes baselineDeltaMs from in-session best vs the snapshot lap time", () => {
    const report = buildCoachingReport(input({ activeSnapshot: snapshot({ lapTimeMs: 750 }) }));
    // In-session best lap is lap 2 (800 ms); snapshot is 750 ms ⇒ +50 ms.
    expect(report.inSessionBestLapTimeMs).toBe(800);
    expect(report.baselineDeltaMs).toBe(50);
  });

  it("defaults the subject to the in-session fastest lap when none is selected", () => {
    const report = buildCoachingReport(
      input({ selectedLapNumber: null, activeSnapshot: snapshot() }),
    );
    expect(report.subjectLapNumber).toBe(2);
    expect(report.deltaMs).toHaveLength(GRID_POINTS);
  });

  it("emits a setup diff when both sessionSetup and snapshot.setup are present", () => {
    const report = buildCoachingReport(
      input({
        activeSnapshot: snapshot({ setup: setup({ psiFrontLeft: 12 }) }),
        sessionSetup: setup({ psiFrontLeft: 13 }),
      }),
    );
    expect(report.setupChanges).toHaveLength(1);
    expect(report.setupChanges[0]).toMatchObject({ field: "psiFrontLeft", delta: 1 });
  });

  it("surfaces the baseline setup as context when no live sessionSetup is assigned", () => {
    const report = buildCoachingReport(input({ activeSnapshot: snapshot(), sessionSetup: null }));
    expect(report.baselineSetup).not.toBeNull();
    expect(report.setupChanges).toEqual([]);
  });

  it("falls back to best-lap reference when the snapshot has too few samples", () => {
    const report = buildCoachingReport(
      input({ activeSnapshot: snapshot({ samples: samples.slice(21, 23) }) }),
    );
    expect(report.referenceSource).toBe("best-lap");
    expect(report.snapshotReference).toBeNull();
  });
});
