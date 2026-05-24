import { Gauge } from "lucide-react";
import { CoachPanel } from "./panel/CoachPanel";
import { PANELS_POINT, PanelSlot, type PluginPanel } from "@/plugins/panels";
import type { DataViewerPlugin } from "@/plugins/types";

const plugin: DataViewerPlugin = {
  id: "ai-coaching",
  name: "AI Coaching",
  version: "0.1.0",
  priority: 100, // overrides a public coach with the same id
  setup(ctx) {
    ctx.registry.contribute(PANELS_POINT, {
      id: "ai-coaching",
      title: "AI Coaching",
      slot: PanelSlot.Coach,
      icon: Gauge,
      component: CoachPanel,
    } satisfies PluginPanel);
  },
};

export default plugin;
