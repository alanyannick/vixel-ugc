import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-07-30T00:00:00.000Z");
  const entries = [
    { path: "/", changeFrequency: "weekly" as const, priority: 1 },
    {
      path: "/workflows/koc-video",
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    {
      path: "/product-truth",
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    { path: "/pricing", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/faq", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly" as const, priority: 0.3 },
  ];

  return entries.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
