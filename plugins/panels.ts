import type { ComponentType } from "react";
import type { Course, Lap, ParsedData } from "@/types/racing";

// Compile-time stub of the host's panel contract (DataViewer src/plugins/panels.ts).
// At runtime the host's real module resolves; this exists only so the package
// typechecks standalone. Keep it matched to the host contract.

/** Registry extension point that collects UI panel contributions. */
export const PANELS_POINT = "ui:panels";

/** Slots a panel can target. The host added a dedicated Coach tab. */
export const PanelSlot = {
  Labs: "labs",
  Coach: "coach",
} as const;

export type PanelSlot = (typeof PanelSlot)[keyof typeof PanelSlot];

/**
 * The curated, read-only session snapshot the host hands each panel on every
 * render. This is the entire surface a panel may rely on.
 */
export interface PluginPanelProps {
  data: ParsedData | null;
  laps: Lap[];
  selectedLapNumber: number | null;
  course: Course | null;
  useKph: boolean;
}

/** Descriptor a plugin contributes to PANELS_POINT. */
export interface PluginPanel {
  id: string;
  title: string;
  slot: string;
  order?: number;
  icon?: ComponentType<{ className?: string }>;
  /**
   * When true, the host renders the panel body with no card/header/padding (and
   * drops the slot's outer padding if every panel in it is chromeless), so the
   * panel can own its full-bleed layout. Error boundary + Suspense still apply.
   */
  chromeless?: boolean;
  component: ComponentType<PluginPanelProps>;
}
