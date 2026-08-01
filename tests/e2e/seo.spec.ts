import { expect, test } from "@playwright/test";

const canonicalOrigin = "https://ugc.vixelai.com";

test("public acquisition pages expose self-referencing canonicals", async ({
  page,
}) => {
  const pages = [
    {
      path: "/",
      heading: "Turn product truth into creator ads ready to produce.",
    },
    {
      path: "/ai-video-generator-for-product-marketing",
      heading: "Plan product video campaigns before you generate.",
    },
    {
      path: "/ugc-ad-generator",
      heading: "Build creator-style product ads from approved facts.",
    },
    {
      path: "/what-is-ai-ugc",
      heading: "AI UGC is creator-style ad media produced with generative AI.",
    },
    {
      path: "/guides/ugc-vs-koc",
      heading: "UGC is the content. KOC is a creator role.",
    },
    {
      path: "/workflows/ugc-video",
      heading: "From product truth to a reviewed video candidate.",
    },
    {
      path: "/compare/vixel-ai-video-generator-app",
      heading: "Two products called Vixel. Different creative jobs.",
    },
    {
      path: "/pricing",
      heading: "Plan freely. Generate deliberately.",
    },
    {
      path: "/waitlist",
      heading: "Bring one product. Apply with a real brief.",
    },
  ] as const;

  for (const entry of pages) {
    await page.goto(entry.path);
    await expect(
      page.getByRole("heading", { level: 1, name: entry.heading }),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${canonicalOrigin}${entry.path === "/" ? "" : entry.path}`,
    );
  }
});

test("crawl surfaces list the UGC content cluster without blocking Studio noindex", async ({
  request,
}) => {
  const [robotsResponse, sitemapResponse, llmsResponse] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
    request.get("/llms.txt"),
  ]);

  expect(robotsResponse.ok()).toBeTruthy();
  expect(sitemapResponse.ok()).toBeTruthy();
  expect(llmsResponse.ok()).toBeTruthy();

  const robots = await robotsResponse.text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).not.toContain("Disallow: /studio");

  const sitemap = await sitemapResponse.text();
  for (const path of [
    "/ai-video-generator-for-product-marketing",
    "/ugc-ad-generator",
    "/workflows/ugc-video",
    "/what-is-ai-ugc",
    "/guides/ugc-vs-koc",
    "/compare/vixel-ai-video-generator-app",
    "/access",
    "/pricing",
    "/waitlist",
  ]) {
    expect(sitemap).toContain(`${canonicalOrigin}${path}`);
  }

  const llms = await llmsResponse.text();
  expect(llms).toContain("# Vixel UGC");
  expect(llms).toContain("AI UGC Ad Studio");
  expect(llms).toContain("UGC Campaign");
  expect(llms).toContain("account-scoped cloud campaign");
  expect(llms).toContain("billing");
  expect(llms).toContain(
    `${canonicalOrigin}/ai-video-generator-for-product-marketing`,
  );
  expect(llms).toContain(`${canonicalOrigin}/ugc-ad-generator`);
  expect(llms).toContain(`${canonicalOrigin}/guides/ugc-vs-koc`);
});

test("the independent iPhone app comparison is indexable and names the source boundary", async ({
  page,
}) => {
  const path = "/compare/vixel-ai-video-generator-app";
  const appStoreUrl =
    "https://apps.apple.com/us/app/vixel-ai-video-generator/id6756965785";

  const response = await page.goto(path);
  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()["x-robots-tag"] ?? "").not.toContain("noindex");
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]'),
  ).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${canonicalOrigin}${path}`,
  );

  await expect(
    page.getByText("FENIX MOBILE YAZILIM A.S.").first(),
  ).toBeVisible();
  await expect(page.getByText(/independent/i).first()).toBeVisible();
  await expect(page.getByText(/not affiliated/i).first()).toBeVisible();

  const officialListing = page.locator(`a[href="${appStoreUrl}"]`).first();
  await expect(officialListing).toBeVisible();
  await expect(officialListing).toHaveAttribute("target", "_blank");
  await expect(officialListing).toHaveAttribute("rel", /noopener/);

  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  expect(structuredData.join("\n")).not.toContain(appStoreUrl);
});

test("legacy public routes permanently redirect", async ({ request }) => {
  const workflowResponse = await request.get("/workflows/koc-video", {
    maxRedirects: 0,
  });
  expect(workflowResponse.status()).toBe(308);
  expect(workflowResponse.headers().location).toBe("/workflows/ugc-video");

  const attributedWorkflow = await request.get(
    "/workflows/koc-video?utm_source=legacy&utm_campaign=launch",
    { maxRedirects: 0 },
  );
  expect(attributedWorkflow.status()).toBe(308);
  expect(attributedWorkflow.headers().location).toBe(
    "/workflows/ugc-video?utm_source=legacy&utm_campaign=launch",
  );
});
