import type { VehicleSetup } from "@/plugins/setup";

// Setup-diff between the frozen baseline (snapshot.setup) and the live session
// setup. Pure & deterministic; used to surface "what changed since the baseline
// lap" as a coaching insight in its own right. The diff is a flat list of
// SetupChange records — easier for the dashboard to render and for a future AI
// tier to reason over than a nested object diff.

/** A single setup field that differs between baseline and current. */
export interface SetupChange {
  /** Stable field key on the host's VehicleSetup, or `customFields.<id>`. */
  field: string;
  /** Human-readable label for display ("Front-left PSI", "Tire brand", …). */
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
  label: string;
  unit: ((setup: VehicleSetup) => string | null) | string | null;
}

const PSI: FieldDef["unit"] = "psi";
const SIZE: FieldDef["unit"] = (s) => s.unitSystem;

const NUMERIC_FIELDS: FieldDef[] = [
  { key: "psiFrontLeft", label: "Front-left PSI", unit: PSI },
  { key: "psiFrontRight", label: "Front-right PSI", unit: PSI },
  { key: "psiRearLeft", label: "Rear-left PSI", unit: PSI },
  { key: "psiRearRight", label: "Rear-right PSI", unit: PSI },
  { key: "tireWidthFrontLeft", label: "Front-left tire width", unit: SIZE },
  { key: "tireWidthFrontRight", label: "Front-right tire width", unit: SIZE },
  { key: "tireWidthRearLeft", label: "Rear-left tire width", unit: SIZE },
  { key: "tireWidthRearRight", label: "Rear-right tire width", unit: SIZE },
  { key: "tireDiameterFrontLeft", label: "Front-left tire diameter", unit: SIZE },
  { key: "tireDiameterFrontRight", label: "Front-right tire diameter", unit: SIZE },
  { key: "tireDiameterRearLeft", label: "Rear-left tire diameter", unit: SIZE },
  { key: "tireDiameterRearRight", label: "Rear-right tire diameter", unit: SIZE },
];

const STRING_FIELDS: FieldDef[] = [
  { key: "tireBrand", label: "Tire brand", unit: null },
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
      label: key,
      baseline: b,
      current: c,
      delta: typeof b === "number" && typeof c === "number" ? c - b : null,
      unit: null,
    });
  }

  return out;
}

/** One-line plain-English phrasing of a SetupChange ("Front-left PSI: 12.5 → 13.5 psi (+1.0)"). */
export function describeSetupChange(change: SetupChange): string {
  const unit = change.unit ? ` ${change.unit}` : "";
  const before = change.baseline === null ? "—" : `${change.baseline}${unit}`;
  const after = change.current === null ? "—" : `${change.current}${unit}`;
  if (change.delta === null) return `${change.label}: ${before} → ${after}`;
  const sign = change.delta > 0 ? "+" : "";
  // Trim trailing zeros on the delta so "1" stays "1" but "0.25" stays "0.25".
  const deltaStr = Number.isInteger(change.delta)
    ? `${change.delta}`
    : change.delta.toFixed(2).replace(/\.?0+$/, "");
  return `${change.label}: ${before} → ${after} (${sign}${deltaStr})`;
}
