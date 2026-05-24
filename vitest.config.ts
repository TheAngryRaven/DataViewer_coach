import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Match tsconfig's automatic JSX runtime so .tsx imports resolve react/jsx-runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "lcov"],
      include: ["index.ts", "plugins/**/*.ts", "analysis/**/*.ts"],
      exclude: ["plugins/types.ts"],
      // Gate intentionally low so it can be ratcheted up later as coverage grows.
      thresholds: {
        lines: 1,
        functions: 1,
        branches: 1,
        statements: 1,
      },
    },
  },
});
