import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// The Next dev server runs the admin SDK (server actions). It needs the emulator
// host vars so mutations hit the emulator instead of trying real credentials —
// not just the public client flags. Emulators must be started separately
// (pnpm emulators) before running these tests; test:e2e:full wraps that for you.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared emulator state; keep serial
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    ...devices["Pixel 5"], // mobile-first PWA
  },
  webServer: {
    command: "next dev",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      NEXT_PUBLIC_DEV_AUTH: "true",
      // Must match the emulator's configured project (firebase.json singleProjectMode +
      // .firebaserc default = picklebaddies-85732). A mismatched projectId makes the
      // Firestore emulator treat client tokens as unauthenticated (request.auth = null).
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "picklebaddies-85732",
      FIREBASE_ADMIN_PROJECT_ID: "picklebaddies-85732",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    },
  },
});
