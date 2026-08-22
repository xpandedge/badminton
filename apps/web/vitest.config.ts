import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` is a Next.js build-time guard with no runtime module to
      // resolve under vitest. Stub it so src/server/** stays unit-testable.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Pure unit tests only. Emulator-backed *.rules.test.ts run via a separate script.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/*.rules.test.ts", "node_modules/**"],
  },
});
