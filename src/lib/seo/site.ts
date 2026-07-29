import type { Metadata } from "next";

const fallbackUrl = "https://vixel-koc.vercel.app";

export const siteConfig = {
  name: "Vixel KOC Studio",
  shortName: "Vixel KOC",
  description:
    "A source-grounded AI workspace for planning and producing creator-native KOC and UGC product videos.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || fallbackUrl,
  locale: "en_US",
  keywords: [
    "KOC video generator",
    "UGC ad creator",
    "AI product video",
    "creator marketing workflow",
    "product truth",
    "TikTok ad creator",
    "Reels product video",
    "Xiaohongshu content",
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

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
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
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export function absoluteUrl(path: string) {
  return path === "/" ? siteConfig.url : `${siteConfig.url}${path}`;
}
