import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "./turnstile";

const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

function environment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SITE_URL: "https://preview-ugc.vixelai.com",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY,
    TURNSTILE_SECRET_KEY: TEST_SECRET,
  };
  return Object.assign(env, overrides);
}

function mockVerification(hostname: string, action?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, hostname, action }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("accepts Cloudflare's documented test hostname only on Preview", async () => {
    mockVerification("example.com", "waitlist");

    await expect(
      verifyTurnstile(
        { token: "XXXX.DUMMY.TOKEN.XXXX", expectedAction: "waitlist" },
        environment(),
      ),
    ).resolves.toBe(true);
  });

  it("rejects the test hostname on Production", async () => {
    mockVerification("example.com", "waitlist");

    await expect(
      verifyTurnstile(
        { token: "XXXX.DUMMY.TOKEN.XXXX", expectedAction: "waitlist" },
        environment({ VERCEL_ENV: "production" }),
      ),
    ).resolves.toBe(false);
  });

  it("rejects the test hostname when the real key pair is configured", async () => {
    mockVerification("example.com", "waitlist");

    await expect(
      verifyTurnstile(
        { token: "real-token", expectedAction: "waitlist" },
        environment({
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-site-key",
          TURNSTILE_SECRET_KEY: "real-secret",
        }),
      ),
    ).resolves.toBe(false);
  });

  it("accepts the configured application hostname and expected action", async () => {
    mockVerification("preview-ugc.vixelai.com", "otp");

    await expect(
      verifyTurnstile(
        { token: "real-token", expectedAction: "otp" },
        environment({
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-site-key",
          TURNSTILE_SECRET_KEY: "real-secret",
        }),
      ),
    ).resolves.toBe(true);
  });

  it("rejects a successful token when Cloudflare omits its action", async () => {
    mockVerification("preview-ugc.vixelai.com");

    await expect(
      verifyTurnstile(
        { token: "real-token", expectedAction: "otp" },
        environment({
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-site-key",
          TURNSTILE_SECRET_KEY: "real-secret",
        }),
      ),
    ).resolves.toBe(false);
  });

  it("rejects a token issued for another application action", async () => {
    mockVerification("preview-ugc.vixelai.com", "waitlist");

    await expect(
      verifyTurnstile(
        { token: "real-token", expectedAction: "otp" },
        environment({
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: "real-site-key",
          TURNSTILE_SECRET_KEY: "real-secret",
        }),
      ),
    ).resolves.toBe(false);
  });
});
