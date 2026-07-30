import { expect, test } from "@playwright/test";

test("marketing page communicates the source-grounded workflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Product truth, creator native.",
    }),
  ).toBeVisible();
  if (testInfo.project.name.includes("mobile")) {
    await expect(
      page.getByRole("link", { name: "Start a campaign" }),
    ).toBeVisible();
  } else {
    const stages = page.getByLabel("Campaign stages");
    await expect(stages.getByText("Source", { exact: true })).toBeVisible();
    await expect(stages.getByText("Generate", { exact: true })).toBeVisible();
    await expect(stages.getByText("Adopt", { exact: true })).toBeVisible();
  }
});

test("campaign intake reaches a five-route decision without media spend", async ({
  page,
}, testInfo) => {
  let mediaSubmissions = 0;
  await page.route("**/api/media/approval", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      kind: string;
      input: { idempotencyKey: string };
    };
    expect(body.kind).toBe("image");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        approvalToken: "ma1.test-payload.test-signature",
        kind: "image",
        inputSignature: "a".repeat(64),
        idempotencyKey: body.input.idempotencyKey,
        providerModel: "gpt-image-2",
        adapterVersion: "commit:abcdef1234567",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    });
  });
  await page.route("**/api/media/image", async (route) => {
    mediaSubmissions += 1;
    await route.abort();
  });
  await page.goto("/studio");
  await expect(page.getByText("Checking studio access…")).toBeHidden({
    timeout: 10_000,
  });
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

  await page.getByRole("button", { name: "Continue to assets" }).click();
  const approval = page.getByRole("dialog");
  await expect(approval).toBeVisible();
  await expect(
    approval.getByRole("heading", { name: "Review exact input" }),
  ).toBeVisible();
  await expect(approval.getByText("1 image · 1024×1536")).toBeVisible();
  await expect(
    approval.getByText("Resolved after lock", { exact: true }).first(),
  ).toBeVisible();
  await approval
    .getByRole("button", { name: "Lock exact input · no spend" })
    .click();
  await expect(
    approval.getByRole("heading", { name: "Confirm paid generation" }),
  ).toBeVisible();
  await expect(approval.getByText("gpt-image-2", { exact: true })).toBeVisible();
  await expect(
    approval.getByRole("button", { name: "Confirm paid generation" }),
  ).toBeVisible();
  expect(mediaSubmissions).toBe(0);
  await approval.getByRole("button", { name: "Cancel" }).click();
  await expect(approval).toBeHidden();
});
