import { describe, expect, it, vi } from "vitest";
import plugin from "@/index";
import type { PluginContext } from "@/plugins/types";
import { PANELS_POINT, PanelSlot, type PluginPanel } from "@/plugins/panels";

describe("eye-in-the-sky plugin", () => {
  it("exposes its identity", () => {
    expect(plugin.id).toBe("ai-coaching");
    expect(plugin.version).toBe("0.0.3");
  });

  it("contributes a Labs panel on setup", () => {
    const contribute = vi.fn();
    const ctx = { registry: { contribute } } satisfies PluginContext;

    plugin.setup(ctx);

    expect(contribute).toHaveBeenCalledTimes(1);
    const [point, panel] = contribute.mock.calls[0] as [string, PluginPanel];
    expect(point).toBe(PANELS_POINT);
    expect(panel.id).toBe("ai-coaching");
    expect(panel.slot).toBe(PanelSlot.Labs);
    expect(typeof panel.component).toBe("function");
  });
});
