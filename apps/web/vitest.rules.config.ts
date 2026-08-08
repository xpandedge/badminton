import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.rules.test.ts"],
    testTimeout: 15000,
  },
});
