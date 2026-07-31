import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("security headers", () => {
  it("allows the Cloudflare Turnstile runtime without widening other origins", async () => {
    const headerRules = await nextConfig.headers?.();
    const globalRule = headerRules?.find((rule) => rule.source === "/(.*)");
    const policy = globalRule?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;

    expect(policy).toContain(
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    );
    expect(policy).toContain(
      "connect-src 'self' https://challenges.cloudflare.com",
    );
    expect(policy).toContain(
      "frame-src 'self' https://challenges.cloudflare.com",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
