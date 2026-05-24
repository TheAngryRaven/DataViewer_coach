import { describe, expect, it, vi } from "vitest";
import plugin from "@/index";
import type { PluginContext, PluginStore } from "@/plugins/types";
import { PANELS_POINT, PanelSlot, type PluginPanel } from "@/plugins/panels";

/** A no-op PluginStore stub; the Stage-1 debrief does not touch storage. */
const storage: PluginStore = {
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve()),
  delete: vi.fn(() => Promise.resolve()),
  getAll: vi.fn(() => Promise.resolve({})),
  keys: vi.fn(() => Promise.resolve([])),
};

describe("eye-in-the-sky plugin", () => {
  it("exposes its identity", () => {
    expect(plugin.id).toBe("ai-coaching");
    expect(plugin.version).toBe("0.1.0");
    expect(plugin.priority).toBe(100);
  });

  it("contributes a Coach-tab panel on setup", () => {
    const contribute = vi.fn();
    const ctx = { registry: { contribute }, storage } satisfies PluginContext;

    plugin.setup(ctx);

    expect(contribute).toHaveBeenCalledTimes(1);
    const [point, panel] = contribute.mock.calls[0] as [string, PluginPanel];
    expect(point).toBe(PANELS_POINT);
    expect(panel.id).toBe("ai-coaching");
    expect(panel.slot).toBe(PanelSlot.Coach);
    expect(typeof panel.component).toBe("function");
  });
});
