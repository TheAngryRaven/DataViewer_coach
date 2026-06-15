import { describe, expect, it } from "vitest";
import type { VehicleSetup } from "@/plugins/setup";
import { setupChangeMessage, diffSetups } from "../analysis/setupDiff";

function setup(overrides: Partial<VehicleSetup> = {}): VehicleSetup {
  return {
    id: "setup-1",
    vehicleId: "kart-1",
    templateId: "tag-x30",
    name: "Baseline",
    unitSystem: "mm",
    tireBrand: "MG Red",
    psiMode: "halves",
    psiFrontLeft: 12,
    psiFrontRight: 12,
    psiRearLeft: 11,
    psiRearRight: 11,
    tireWidthMode: "halves",
    tireWidthFrontLeft: 120,
    tireWidthFrontRight: 120,
    tireWidthRearLeft: 200,
    tireWidthRearRight: 200,
    tireDiameterMode: "halves",
    tireDiameterFrontLeft: 280,
    tireDiameterFrontRight: 280,
    tireDiameterRearLeft: 290,
    tireDiameterRearRight: 290,
    customFields: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("diffSetups", () => {
  it("returns an empty list when nothing has changed", () => {
    expect(diffSetups(setup(), setup())).toEqual([]);
  });

  it("captures a single PSI change with its signed delta and unit", () => {
    const changes = diffSetups(setup(), setup({ psiFrontLeft: 13 }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: "psiFrontLeft",
      baseline: 12,
      current: 13,
      delta: 1,
      unit: "psi",
    });
  });

  it("tags a tire-width change with the current setup's unit system", () => {
    const baseline = setup({ unitSystem: "mm", tireWidthFrontLeft: 120 });
    const current = setup({ unitSystem: "mm", tireWidthFrontLeft: 125 });
    const change = diffSetups(baseline, current).find((c) => c.field === "tireWidthFrontLeft");
    expect(change?.unit).toBe("mm");
    expect(change?.delta).toBe(5);
  });

  it("flags a unit-system change before reading width/diameter deltas", () => {
    const changes = diffSetups(setup({ unitSystem: "mm" }), setup({ unitSystem: "in" }));
    expect(changes[0].field).toBe("unitSystem");
    expect(changes[0].delta).toBeNull();
  });

  it("diffs custom fields and includes additions and removals", () => {
    const baseline = setup({ customFields: { rearAxle: "medium", caster: 6 } });
    const current = setup({ customFields: { rearAxle: "soft", camber: -1 } });
    const fields = diffSetups(baseline, current).map((c) => c.field);
    expect(fields).toContain("customFields.rearAxle");
    expect(fields).toContain("customFields.caster");
    expect(fields).toContain("customFields.camber");
  });

  it("flags a template change (so custom-field comparisons are read with care)", () => {
    const changes = diffSetups(setup({ templateId: "tag-x30" }), setup({ templateId: "rotax-senior" }));
    expect(changes.some((c) => c.field === "templateId")).toBe(true);
  });
});

describe("setupChangeMessage", () => {
  it("formats a numeric PSI bump into value+unit pieces with a signed delta", () => {
    expect(
      setupChangeMessage({
        field: "psiFrontLeft",
        labelKey: "psiFrontLeft",
        label: "Front-left PSI",
        baseline: 12,
        current: 13,
        delta: 1,
        unit: "psi",
      }),
    ).toEqual({ labelKey: "psiFrontLeft", label: "Front-left PSI", before: "12 psi", after: "13 psi", delta: "+1" });
  });

  it("formats a string-valued change with no delta", () => {
    expect(
      setupChangeMessage({
        field: "tireBrand",
        labelKey: "tireBrand",
        label: "Tire brand",
        baseline: "MG Red",
        current: "Vega White",
        delta: null,
        unit: null,
      }),
    ).toEqual({ labelKey: "tireBrand", label: "Tire brand", before: "MG Red", after: "Vega White", delta: null });
  });

  it("carries a null labelKey through for custom fields", () => {
    expect(
      setupChangeMessage({
        field: "customFields.frontCamber",
        labelKey: null,
        label: "frontCamber",
        baseline: null,
        current: 2.5,
        delta: null,
        unit: null,
      }),
    ).toEqual({ labelKey: null, label: "frontCamber", before: "—", after: "2.5", delta: null });
  });
});
