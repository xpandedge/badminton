import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/racquet-sports-rotation-app",
          "/badminton-doubles-rotation-app",
          "/pickleball-rotation-app",
          "/brisbane-pickleball-badminton-court-bookings",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/admin",
          "/board",
          "/bookings",
          "/dashboard",
          "/groups",
          "/rsvp",
          "/score",
          "/sessions",
          "/sign-in",
        ],
      },
    ],
    sitemap: "https://duorally.com.au/sitemap.xml",
    host: "https://duorally.com.au",
  };
}
