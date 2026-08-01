import { absoluteUrl, siteConfig } from "@/lib/seo/site";

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteConfig.url}/#organization`,
  name: "Vixel",
  url: siteConfig.url,
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteConfig.url}/#website`,
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  publisher: { "@id": `${siteConfig.url}/#organization` },
  inLanguage: "en",
};

export const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${siteConfig.url}/#software`,
  name: "Vixel UGC",
  url: siteConfig.url,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "AI UGC ad and product video studio",
  operatingSystem: "Web",
  description: siteConfig.description,
  isPartOf: { "@id": `${siteConfig.url}/#website` },
  featureList: [
    "UGC Campaign planning with browser recovery and account-scoped cloud sync",
    "Creative Router for direct, guided, or planned work",
    "Passwordless account access and private-beta approval",
    "Cloud campaign save, reload, and revision protection",
    "Source-backed product claim ledger",
    "Five creative hook routes and three creator personas",
    "4, 6, or 8-second vertical product video planning workflow",
    "Explicit approval before paid generation",
    "Subscription entitlement and deployment readiness checks before paid generation",
    "Live media submission only when account, billing, provider, and ledger readiness pass",
    "Candidate lineage and adoption receipts",
    "Campaign JSON export and browser recovery fallback",
  ],
  brand: { "@id": `${siteConfig.url}/#organization` },
  publisher: { "@id": `${siteConfig.url}/#organization` },
};

export function articleSchema(input: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${absoluteUrl(input.path)}#article`,
    headline: input.headline,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: absoluteUrl(input.path),
    isPartOf: { "@id": `${siteConfig.url}/#website` },
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { "@id": `${siteConfig.url}/#organization` },
    publisher: { "@id": `${siteConfig.url}/#organization` },
    inLanguage: "en",
  };
}

export function howToSchema(input: {
  name: string;
  description: string;
  path: string;
  steps: ReadonlyArray<{ name: string; text: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${absoluteUrl(input.path)}#howto`,
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    inLanguage: "en",
    step: input.steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(
  items: ReadonlyArray<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
