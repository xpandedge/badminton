import type { MetadataRoute } from "next";

const origin = "https://duorally.com.au";
const lastModified = new Date("2026-08-23T00:00:00+10:00");

const routes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/racquet-sports-rotation-app", priority: 0.95, changeFrequency: "monthly" },
  { path: "/badminton-doubles-rotation-app", priority: 0.9, changeFrequency: "monthly" },
  { path: "/pickleball-rotation-app", priority: 0.9, changeFrequency: "monthly" },
  { path: "/brisbane-pickleball-badminton-court-bookings", priority: 0.75, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.25, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.25, changeFrequency: "yearly" },
] satisfies Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}>;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${origin}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
