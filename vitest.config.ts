import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "app/lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["app/lib/**/*.ts"],
      exclude: ["app/lib/**/*.test.ts", "app/lib/**/*.d.ts"],
      thresholds: {
        // Conversion engine coverage target — enforced from M2 onwards
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
