import { expect, test } from "@playwright/test";

test("marketing page communicates the source-grounded workflow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Vixel Campaigns/);
  await expect(
    page.getByRole("link", { name: "Vixel Campaigns home" }),
  ).toBeVisible();
  await expect(
    page
      .getByText(/VIXEL CAMPAIGNS \/ PRIVATE BETA \/ AI PRODUCT-TO-UGC/)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Turn product truth into creator ads ready to produce.",
    }),
  ).toBeVisible();
  const productLink = page.getByRole("textbox", { name: "Product link" });
  const campaignIdea = page.getByRole("textbox", { name: "Campaign idea" });
  await expect(productLink).toBeVisible();
  await expect(campaignIdea).toBeVisible();
  await productLink.fill("https://shop.example.test/pulse-blender");
  await campaignIdea.fill("Show the ten-second setup and first-use reaction.");
  await page.getByRole("button", { name: "Apply with brief" }).click();
  await expect(page).toHaveURL(/\/waitlist\?/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Bring one product. Apply with a real brief.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Product link" }),
  ).toHaveValue("https://shop.example.test/pulse-blender");
  await expect(
    page.getByRole("textbox", { name: "Campaign idea" }),
  ).toHaveValue("Show the ten-second setup and first-use reaction.");
});

test("public entry preserves keyboard focus and reduced-motion content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  const sectionCopy = page.locator(".section-heading-copy").first();
  await sectionCopy.scrollIntoViewIfNeeded();
  await expect(sectionCopy).toBeVisible();
  await expect(sectionCopy).toHaveCSS("animation-name", "none");
});

test("campaign intake reaches a five-route planning decision while generation is closed", async ({
  page,
}, testInfo) => {
  let mediaSubmissions = 0;
  await page.route("**/api/media/approval", async (route) => {
    mediaSubmissions += 1;
    await route.abort();
  });
  await page.route("**/api/media/image", async (route) => {
    mediaSubmissions += 1;
    await route.abort();
  });
  await page.goto("/studio?operator=recovery");
  await expect(
    page.getByText("Checking UGC Campaign access…"),
  ).toBeHidden({ timeout: 10_000 });
  if (testInfo.project.name.includes("mobile")) {
    const director = page.getByRole("complementary", { name: "Director" });
    await expect(director).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("button", { name: "New campaign" }).click();

  await page.getByLabel("Product name").fill("Pulse Mini Blender");
  await page.getByLabel("Category").fill("Kitchen appliance");
  await page
    .getByLabel("Product fact 1")
    .fill("Two 450 ml BPA-free blending cups are included");
  await page
    .getByLabel("Target audience")
    .fill("Commuters who prepare breakfast before leaving home");
  await page
    .getByLabel("Desired action")
    .fill("Drive qualified product-page visits");
  await page.getByRole("button", { name: "Build creative routes" }).click();

  await expect(
    page.getByRole("heading", { name: "Five openings. One decision." }),
  ).toBeVisible();
  await expect(page.getByText("5 routes ready", { exact: true })).toBeVisible();
  await expect(page.getByText("3 casting routes", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Creative foundation/ }),
  ).toHaveAttribute("data-plan-stage-id", /^stage-/);

  await expect(
    page.getByText("Planning mode", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Asset generation not open" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(mediaSubmissions).toBe(0);
});
