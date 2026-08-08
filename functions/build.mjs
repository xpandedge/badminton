/**
 * esbuild bundler for Cloud Functions.
 * Inlines workspace packages (@picklebaddies/domain, @picklebaddies/match-engine)
 * so the deployed artifact has no workspace:* dependencies.
 * firebase-admin and firebase-functions are kept external (available in runtime).
 *
 * Also writes lib/package.json with only the two runtime deps so Cloud Build
 * (which runs `npm install` against the uploaded lib/ directory) never sees
 * workspace:* protocol entries.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, symlinkSync, lstatSync, unlinkSync } from "fs";

await build({
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: [
    "firebase-admin",
    "firebase-admin/*",
    "firebase-functions",
    "firebase-functions/*",
  ],
  format: "cjs",
  outfile: "lib/index.js",
  platform: "node",
  target: "node20",
  sourcemap: false,
});

console.log("✓ functions bundled to lib/index.js");

// Write a clean package.json into lib/ so Firebase Cloud Build only installs
// the two runtime packages — none of the workspace:* devDependencies.
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const deployPkg = {
  name: pkg.name,
  version: pkg.version,
  main: "index.js",
  engines: pkg.engines,
  dependencies: {
    "firebase-admin": pkg.dependencies["firebase-admin"],
    "firebase-functions": pkg.dependencies["firebase-functions"],
  },
};
writeFileSync("lib/package.json", JSON.stringify(deployPkg, null, 2) + "\n");
console.log("✓ lib/package.json written (no workspace:* entries)");

// Symlink node_modules into lib/ so firebase-tools can locate the SDK during
// local function analysis (both emulator start and `firebase deploy`).
// firebase-tools excludes node_modules from the Cloud Build upload, so this
// symlink never pollutes the deployed artifact.
try { if (lstatSync("lib/node_modules").isSymbolicLink()) unlinkSync("lib/node_modules"); } catch {}
symlinkSync("../node_modules", "lib/node_modules");
console.log("✓ lib/node_modules → ../node_modules (symlink for SDK discovery)");
