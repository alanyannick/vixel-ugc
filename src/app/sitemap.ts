import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const entries = [
    {
      path: "/",
      lastModified: "2026-08-01",
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      path: "/ai-video-generator-for-product-marketing",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.95,
    },
    {
      path: "/ugc-ad-generator",
      lastModified: "2026-07-30",
      changeFrequency: "monthly" as const,
      priority: 0.95,
    },
    {
      path: "/workflows/ugc-video",
      lastModified: "2026-07-30",
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    {
      path: "/what-is-ai-ugc",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    {
      path: "/guides/ugc-vs-koc",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      path: "/product-truth",
      lastModified: "2026-07-30",
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      path: "/compare/vixel-ai-video-generator-app",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    {
      path: "/access",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      path: "/pricing",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      path: "/waitlist",
      lastModified: "2026-08-01",
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      path: "/faq",
      lastModified: "2026-08-01",
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      path: "/privacy",
      lastModified: "2026-08-01",
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      path: "/terms",
      lastModified: "2026-08-01",
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];

  return entries.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: new Date(`${entry.lastModified}T00:00:00.000Z`),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
