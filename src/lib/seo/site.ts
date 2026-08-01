import type { Metadata } from "next";

const canonicalUrl = "https://ugc.vixelai.com";

export const siteConfig = {
  name: "Vixel Campaigns",
  shortName: "Campaigns",
  description:
    "Vixel Campaigns is an AI Product-to-UGC Campaign Studio for grounded creator ad plans, cloud recovery, and readiness-gated media generation.",
  url: canonicalUrl,
  locale: "en_US",
  keywords: [
    "AI ad studio",
    "AI UGC campaign",
    "AI video ads",
    "AI UGC video generator",
    "UGC ad generator",
    "AI product video generator",
    "creator-style video ads",
    "KOC video generator",
    "KOC campaign planner",
    "product truth",
    "TikTok UGC ads",
    "Reels video ads",
  ],
} as const;

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function createPageMetadata({
  title,
  description,
  path,
}: PageMetadataInput): Metadata {
  const canonical = path === "/" ? siteConfig.url : `${siteConfig.url}${path}`;
  const brandedTitle = `${title} · ${siteConfig.name}`;

  return {
    title: { absolute: brandedTitle },
    description,
    alternates: { canonical },
    openGraph: {
      title: brandedTitle,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} — product truth to creator-native ads`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brandedTitle,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export function absoluteUrl(path: string) {
  return path === "/" ? siteConfig.url : `${siteConfig.url}${path}`;
}
