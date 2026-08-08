/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict Mode double-invokes effects in dev, which makes Firestore real-time
  // listeners rapidly subscribe/unsubscribe/resubscribe and trips a known SDK
  // watch-aggregator assertion (ID: ca9) against the emulator. Disable it ONLY in
  // dev-auth (emulator/e2e) mode; production and normal dev keep Strict Mode on.
  reactStrictMode: process.env.NEXT_PUBLIC_DEV_AUTH !== "true",
  transpilePackages: ["@picklebaddies/match-engine", "@picklebaddies/domain"],
  output: "standalone",
};

export default nextConfig;
