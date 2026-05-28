import type { ComponentType } from "react";
import type { Course, GpsSample, Lap, ParsedData } from "@/types/racing";
import type { VehicleSetup } from "./setup";

// Compile-time stub of the host's panel contract (DataViewer src/plugins/panels.ts).
// At runtime the host's real module resolves; this exists only so the package
// typechecks standalone. Keep it matched to the host contract.

/** Registry extension point that collects UI panel contributions. */
export const PANELS_POINT = "ui:panels";

/** Slots a panel can target. The host added a dedicated Coach tab. */
export const PanelSlot = {
  Labs: "labs",
  Coach: "coach",
  Profile: "profile",
} as const;

export type PanelSlot = (typeof PanelSlot)[keyof typeof PanelSlot];

/**
 * A reference lap the user has loaded as a baseline. Snapshots are keyed on the
 * host by (course, engine), so the loaded `engine` may differ from whatever the
 * driver is running in the current session.
 *
 * `samples` is a clean lap slice (no buffer trimming needed) at original
 * wall-clock `t` (ms); align by arc-length / position, not absolute time.
 */
export interface PluginSnapshot {
  id: string;
  engine: string;
  trackName: string;
  courseName: string;
  lapTimeMs: number;
  sourceFileName: string;
  sourceLapNumber: number;
  recordedAt?: number;
  samples: GpsSample[];
  course: Course;
  vehicle?: { id?: string; name?: string; number?: number };
  /** The setup at the time the snapshot was captured (frozen baseline). */
  setup?: VehicleSetup;
}

/**
 * The curated, read-only session snapshot the host hands each panel on every
 * render. This is the entire surface a panel may rely on.
 *
 * `sessionSetup` and `activeSnapshot` are typed optional so the plugin keeps
 * working against older host builds that don't ship them; behave as `null` when
 * either is undefined.
 */
export interface PluginPanelProps {
  data: ParsedData | null;
  laps: Lap[];
  selectedLapNumber: number | null;
  course: Course | null;
  useKph: boolean;
  sessionSetup?: VehicleSetup | null;
  activeSnapshot?: PluginSnapshot | null;
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
