import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as operatorRecoveryStatus } from "@/app/api/auth/access/route";

import {
  createAccountSessionToken,
  getAccountSession,
  getStudioSessionIdentity,
  requireStudioSession,
  sessionCookie,
  verifySessionToken,
} from "./auth";

const NOW = Date.now();
const ACCOUNT = {
  userId: "0f54f1be-129d-4adb-a731-6fd54cfc1bc1",
  email: "Creator@Example.com",
  accountStatus: "approved" as const,
  appRole: "user" as const,
};

function requestFor(token: string): Request {
  return new Request("https://ugc.vixelai.com/api/account", {
    headers: { cookie: `vixel_studio_session=${encodeURIComponent(token)}` },
  });
}

describe("account application sessions", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "a-production-recovery-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "a-production-session-secret-that-is-long-enough",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs and verifies normalized account claims", () => {
    const token = createAccountSessionToken(ACCOUNT, NOW);
    expect(token).toBeTruthy();
    expect(verifySessionToken(token, NOW)).toBe(true);
    expect(getAccountSession(requestFor(token!), NOW)).toMatchObject({
      userId: ACCOUNT.userId,
      email: "creator@example.com",
      accountStatus: "approved",
      appRole: "user",
    });
    expect(sessionCookie(token!)).toContain("HttpOnly");
    expect(sessionCookie(token!)).toContain("Secure");
  });

  it("rejects tampered and expired account claims", () => {
    const token = createAccountSessionToken(ACCOUNT, NOW)!;
    expect(
      verifySessionToken(token.replace(".approved.", ".pending."), NOW),
    ).toBe(false);
    expect(verifySessionToken(token, NOW + 8 * 24 * 60 * 60 * 1_000)).toBe(
      false,
    );
  });

  it("derives a stable opaque paid-media owner from the immutable user ID", () => {
    const first = createAccountSessionToken(ACCOUNT, NOW)!;
    const second = createAccountSessionToken(ACCOUNT, NOW + 1_000)!;
    expect(getStudioSessionIdentity(requestFor(first))).toMatch(/^[a-f0-9]{64}$/);
    expect(getStudioSessionIdentity(requestFor(second))).toBe(
      getStudioSessionIdentity(requestFor(first)),
    );
  });

  it("keeps pending and suspended account claims outside Studio", () => {
    for (const accountStatus of ["pending", "suspended"] as const) {
      const token = createAccountSessionToken(
        { ...ACCOUNT, accountStatus },
        NOW,
      )!;
      const response = requireStudioSession(
        requestFor(token),
        "request-account-gate",
      );
      expect(response?.status).toBe(403);
    }
  });

  it("does not reuse an account v3 cookie as operator recovery", async () => {
    const token = createAccountSessionToken(ACCOUNT, NOW)!;
    const response = await operatorRecoveryStatus(requestFor(token));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authenticated: false,
      required: true,
      configured: true,
    });
  });
});
