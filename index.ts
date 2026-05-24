import type { DataViewerPlugin } from "@/plugins/types";

const plugin: DataViewerPlugin = {
  id: "ai-coaching",
  name: "AI Coaching",
  version: "0.0.1",
  priority: 100, // overrides a public coach with the same id
  setup(ctx) {
    ctx.registry.contribute("diagnostics", "ai-coaching: hello world");
  },
};

export default plugin;
