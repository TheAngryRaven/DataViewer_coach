import { lazy } from "react";
import { Gauge } from "lucide-react";
import { PANELS_POINT, PanelSlot, type PluginPanel } from "@/plugins/panels";
import type { DataViewerPlugin } from "@/plugins/types";

const plugin: DataViewerPlugin = {
  id: "ai-coaching",
  name: "AI Coaching",
  version: "0.2.0",
  priority: 100, // overrides a public coach with the same id
  setup(ctx) {
    ctx.registry.contribute(PANELS_POINT, {
      id: "ai-coaching",
      title: "AI Coaching",
      slot: PanelSlot.Coach,
      chromeless: true,
      icon: Gauge,
      // Lazy so uPlot (loaded inside the dashboard module) stays out of the
      // host's initial bundle; the host wraps panels in <Suspense>.
      component: lazy(() => import("./panel/CoachDashboard")),
    } satisfies PluginPanel);
  },
};

export default plugin;
