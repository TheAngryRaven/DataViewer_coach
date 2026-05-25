import type { ParsedData } from "@/types/racing";

// Capability detection over the host's canonical channel ids (the keys of both
// `fieldMappings` and each sample's `extraFields`). This is what gates the
// richer "Tier-2" reads: measured g / driver inputs only when the data carries
// them, degrading gracefully to a pure-GPS read otherwise.

/** Raw body-frame IMU acceleration — unambiguously measured. */
const MEASURED_ACCEL = ["accel_x", "accel_y", "accel_z"] as const;
/** Logger-reported native g (measured, just pre-resolved by the device). */
const NATIVE_G = ["lat_g_native", "lon_g_native"] as const;
/** Primary g channels; GPS-derived (lower fidelity) unless a measured source above exists. */
const PRIMARY_G = ["lat_g", "lon_g"] as const;

export interface SessionCapabilities {
  /** Any lateral/longitudinal g is available (measured or GPS-derived). */
  hasG: boolean;
  /** g comes from a measured source (`accel_*` or `*_native`), not GPS derivation. */
  measuredG: boolean;
  throttle: boolean;
  brake: boolean;
  rpm: boolean;
}

/** Canonical channel ids present in the data (union of mappings + first sample). */
export function presentChannelIds(data: ParsedData): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(data.fieldMappings)) ids.add(id);
  const first = data.samples[0];
  if (first) for (const id of Object.keys(first.extraFields)) ids.add(id);
  return ids;
}

export function detectCapabilities(data: ParsedData): SessionCapabilities {
  const ids = presentChannelIds(data);
  const has = (id: string) => ids.has(id);
  const measuredG = MEASURED_ACCEL.some(has) || NATIVE_G.some(has);
  return {
    measuredG,
    hasG: measuredG || PRIMARY_G.some(has),
    throttle: has("throttle"),
    brake: has("brake"),
    rpm: has("rpm"),
  };
}
