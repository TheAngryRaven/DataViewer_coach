import type { VehicleSetup } from "@/plugins/setup";

// Setup-diff between the frozen baseline (snapshot.setup) and the live session
// setup. Pure & deterministic; used to surface "what changed since the baseline
// lap" as a coaching insight in its own right. The diff is a flat list of
// SetupChange records — easier for the dashboard to render and for a future AI
// tier to reason over than a nested object diff.

/** Stable label keys for the known (non-custom) setup fields. The panel maps
 *  these to translated labels (`setup.fields.<key>`); custom fields have none. */
export type SetupLabelKey =
  | "psiFrontLeft"
  | "psiFrontRight"
  | "psiRearLeft"
  | "psiRearRight"
  | "tireWidthFrontLeft"
  | "tireWidthFrontRight"
  | "tireWidthRearLeft"
  | "tireWidthRearRight"
  | "tireDiameterFrontLeft"
  | "tireDiameterFrontRight"
  | "tireDiameterRearLeft"
  | "tireDiameterRearRight"
  | "tireBrand"
  | "unitSystem"
  | "templateId";

/** A single setup field that differs between baseline and current. */
export interface SetupChange {
  /** Stable field key on the host's VehicleSetup, or `customFields.<id>`. */
  field: string;
  /** Stable label key for known fields (panel translates it), null for custom fields. */
  labelKey: SetupLabelKey | null;
  /** English fallback label — used for custom fields (the field's own key) and by
   *  a non-i18n / AI consumer ("Front-left PSI", "Tire brand", …). */
  label: string;
  /** Baseline value (from the frozen snapshot.setup). null if absent. */
  baseline: string | number | null;
  /** Current value (from the live sessionSetup). null if absent. */
  current: string | number | null;
  /** Signed delta (`current - baseline`) when both values are numeric. */
  delta: number | null;
  /** Unit suffix for display ("psi", "mm", "in"), or null when not applicable. */
  unit: string | null;
}

interface FieldDef {
  key: keyof VehicleSetup;
  labelKey: SetupLabelKey;
  label: string;
  unit: ((setup: VehicleSetup) => string | null) | string | null;
}

const PSI: FieldDef["unit"] = "psi";
const SIZE: FieldDef["unit"] = (s) => s.unitSystem;

const NUMERIC_FIELDS: FieldDef[] = [
  { key: "psiFrontLeft", labelKey: "psiFrontLeft", label: "Front-left PSI", unit: PSI },
  { key: "psiFrontRight", labelKey: "psiFrontRight", label: "Front-right PSI", unit: PSI },
  { key: "psiRearLeft", labelKey: "psiRearLeft", label: "Rear-left PSI", unit: PSI },
  { key: "psiRearRight", labelKey: "psiRearRight", label: "Rear-right PSI", unit: PSI },
  { key: "tireWidthFrontLeft", labelKey: "tireWidthFrontLeft", label: "Front-left tire width", unit: SIZE },
  { key: "tireWidthFrontRight", labelKey: "tireWidthFrontRight", label: "Front-right tire width", unit: SIZE },
  { key: "tireWidthRearLeft", labelKey: "tireWidthRearLeft", label: "Rear-left tire width", unit: SIZE },
  { key: "tireWidthRearRight", labelKey: "tireWidthRearRight", label: "Rear-right tire width", unit: SIZE },
  { key: "tireDiameterFrontLeft", labelKey: "tireDiameterFrontLeft", label: "Front-left tire diameter", unit: SIZE },
  { key: "tireDiameterFrontRight", labelKey: "tireDiameterFrontRight", label: "Front-right tire diameter", unit: SIZE },
  { key: "tireDiameterRearLeft", labelKey: "tireDiameterRearLeft", label: "Rear-left tire diameter", unit: SIZE },
  { key: "tireDiameterRearRight", labelKey: "tireDiameterRearRight", label: "Rear-right tire diameter", unit: SIZE },
];

const STRING_FIELDS: FieldDef[] = [
  { key: "tireBrand", labelKey: "tireBrand", label: "Tire brand", unit: null },
];

function resolveUnit(def: FieldDef, baseline: VehicleSetup, current: VehicleSetup): string | null {
  const u = def.unit;
  if (u === null || typeof u === "string") return u;
  return u(current) || u(baseline);
}

/**
 * Diff two VehicleSetup records. Returns one entry per field that differs;
 * unchanged fields are omitted. The order is built-in scalars first
 * (PSI → width → diameter → tireBrand), then custom template fields by key.
 *
 * Unit-system mismatches surface as their own change so width/diameter deltas
 * aren't read in the wrong units; templateId mismatches surface so a different
 * template's customFields aren't compared by key alone.
 */
export function diffSetups(baseline: VehicleSetup, current: VehicleSetup): SetupChange[] {
  const out: SetupChange[] = [];

  if (baseline.unitSystem !== current.unitSystem) {
    out.push({
      field: "unitSystem",
      labelKey: "unitSystem",
      label: "Unit system",
      baseline: baseline.unitSystem,
      current: current.unitSystem,
      delta: null,
      unit: null,
    });
  }

  if (baseline.templateId !== current.templateId) {
    out.push({
      field: "templateId",
      labelKey: "templateId",
      label: "Setup template",
      baseline: baseline.templateId,
      current: current.templateId,
      delta: null,
      unit: null,
    });
  }

  for (const def of NUMERIC_FIELDS) {
    const b = baseline[def.key] as number | null;
    const c = current[def.key] as number | null;
    if (b === c) continue;
    out.push({
      field: def.key,
      labelKey: def.labelKey,
      label: def.label,
      baseline: b,
      current: c,
      delta: typeof b === "number" && typeof c === "number" ? c - b : null,
      unit: resolveUnit(def, baseline, current),
    });
  }

  for (const def of STRING_FIELDS) {
    const b = baseline[def.key] as string;
    const c = current[def.key] as string;
    if (b === c) continue;
    out.push({
      field: def.key,
      labelKey: def.labelKey,
      label: def.label,
      baseline: b,
      current: c,
      delta: null,
      unit: null,
    });
  }

  // Union of custom-field keys so removals (or additions) also show up.
  const keys = new Set<string>([
    ...Object.keys(baseline.customFields),
    ...Object.keys(current.customFields),
  ]);
  for (const key of [...keys].sort()) {
    const b = baseline.customFields[key] ?? null;
    const c = current.customFields[key] ?? null;
    if (b === c) continue;
    out.push({
      field: `customFields.${key}`,
      labelKey: null,
      label: key,
      baseline: b,
      current: c,
      delta: typeof b === "number" && typeof c === "number" ? c - b : null,
      unit: null,
    });
  }

  return out;
}

/** The display pieces of a SetupChange line. The panel translates `labelKey`
 *  (falling back to `label`) and assembles the line via the `setup.changeLine`
 *  templates; values carry language-neutral unit suffixes. */
export interface SetupChangeMessage {
  labelKey: SetupLabelKey | null;
  label: string;
  /** Baseline value with unit, or "—" when absent. */
  before: string;
  /** Current value with unit, or "—" when absent. */
  after: string;
  /** Signed delta ("+1", "-0.25"), or null when not numeric. */
  delta: string | null;
}

/** Format a SetupChange into translation-ready display pieces (adds no prose). */
export function setupChangeMessage(change: SetupChange): SetupChangeMessage {
  const unit = change.unit ? ` ${change.unit}` : "";
  const before = change.baseline === null ? "—" : `${change.baseline}${unit}`;
  const after = change.current === null ? "—" : `${change.current}${unit}`;
  let delta: string | null = null;
  if (change.delta !== null) {
    const sign = change.delta > 0 ? "+" : "";
    // Trim trailing zeros on the delta so "1" stays "1" but "0.25" stays "0.25".
    const deltaStr = Number.isInteger(change.delta)
      ? `${change.delta}`
      : change.delta.toFixed(2).replace(/\.?0+$/, "");
    delta = `${sign}${deltaStr}`;
  }
  return { labelKey: change.labelKey, label: change.label, before, after, delta };
}
