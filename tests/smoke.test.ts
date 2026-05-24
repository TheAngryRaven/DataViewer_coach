import { describe, expect, it, vi } from "vitest";
import plugin from "@/index";
import type { PluginContext } from "@/plugins/types";

describe("eye-in-the-sky plugin", () => {
  it("exposes its identity", () => {
    expect(plugin.id).toBe("ai-coaching");
    expect(plugin.version).toBe("0.0.1");
  });

  it("contributes a diagnostic on setup", () => {
    const contribute = vi.fn();
    const ctx = { registry: { contribute } } satisfies PluginContext;

    plugin.setup(ctx);

    expect(contribute).toHaveBeenCalledWith(
      "diagnostics",
      "ai-coaching: hello world",
    );
  });
});
