import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Pure unit tests only. Emulator-backed *.rules.test.ts run via a separate script.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/*.rules.test.ts", "node_modules/**"],
  },
});
