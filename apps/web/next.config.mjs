/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict Mode double-invokes effects in dev, which makes Firestore real-time
  // listeners rapidly subscribe/unsubscribe/resubscribe and trips a known SDK
  // watch-aggregator assertion (ID: ca9) against the emulator. Disable it ONLY in
  // dev-auth (emulator/e2e) mode; production and normal dev keep Strict Mode on.
  reactStrictMode: process.env.NEXT_PUBLIC_DEV_AUTH !== "true",
  transpilePackages: ["@picklebaddies/match-engine", "@picklebaddies/domain"],
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.duorally.com.au" }],
        destination: "https://duorally.com.au/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    const noindex = [
      {
        key: "X-Robots-Tag",
        value: "noindex, nofollow",
      },
    ];

    return [
      { source: "/admin/:path*", headers: noindex },
      { source: "/board/:path*", headers: noindex },
      { source: "/bookings", headers: noindex },
      { source: "/dashboard", headers: noindex },
      { source: "/groups/:path*", headers: noindex },
      { source: "/help", headers: noindex },
      { source: "/leaderboard", headers: noindex },
      { source: "/rsvp/:path*", headers: noindex },
      { source: "/score/:path*", headers: noindex },
      { source: "/sessions/:path*", headers: noindex },
      { source: "/sign-in", headers: noindex },
    ];
  },
};

export default nextConfig;
