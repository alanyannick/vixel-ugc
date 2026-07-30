import { expect, test } from "@playwright/test";

const canonicalOrigin = "https://ugc.vixelai.com";

test("public acquisition pages expose self-referencing canonicals", async ({
  page,
}) => {
  const pages = [
    {
      path: "/",
      heading: "Turn any product into a creator ad.",
    },
    {
      path: "/ugc-ad-generator",
      heading: "Build creator-style product ads from approved facts.",
    },
    {
      path: "/what-is-ai-ugc",
      heading:
        "AI UGC is creator-style ad media produced with generative AI.",
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
      path: "/pricing",
      heading: "Plan freely. Generate deliberately.",
    },
    {
      path: "/waitlist",
      heading: "Bring one product. Leave with a campaign.",
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
    "/ugc-ad-generator",
    "/workflows/ugc-video",
    "/what-is-ai-ugc",
    "/guides/ugc-vs-koc",
    "/access",
    "/pricing",
    "/waitlist",
  ]) {
    expect(sitemap).toContain(`${canonicalOrigin}${path}`);
  }

  const llms = await llmsResponse.text();
  expect(llms).toContain("# Vixel UGC Studio");
  expect(llms).toContain(`${canonicalOrigin}/ugc-ad-generator`);
  expect(llms).toContain(`${canonicalOrigin}/guides/ugc-vs-koc`);
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
