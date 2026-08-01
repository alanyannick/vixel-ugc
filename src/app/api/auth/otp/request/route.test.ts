import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestOtpMock } = vi.hoisted(() => ({
  requestOtpMock: vi.fn(),
}));

vi.mock("@/lib/server/env", () => ({
  getServerRuntimeConfig: () => ({
    product: { features: { accountAuth: { ready: true } } },
  }),
}));

vi.mock("@/lib/server/supabase-auth", () => ({
  SupabaseAuthError: class SupabaseAuthError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
  requestSupabaseEmailOtp: requestOtpMock,
}));

import { POST } from "./route";
import { SupabaseAuthError } from "@/lib/server/supabase-auth";

function otpRequest(captchaToken = "turnstile-token"): Request {
  return new Request("https://ugc.vixelai.com/api/auth/otp/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ugc.vixelai.com",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({
      email: "Creator@Example.com",
      captchaToken,
    }),
  });
}

describe("email OTP request route", () => {
  beforeEach(() => {
    requestOtpMock.mockReset().mockResolvedValue(undefined);
  });

  it("fails closed when the Supabase-bound CAPTCHA token is absent", async () => {
    const response = await POST(otpRequest(""));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "bot_check_failed" },
    });
    expect(requestOtpMock).not.toHaveBeenCalled();
  });

  it("passes the single-use Turnstile token to Supabase Auth", async () => {
    const response = await POST(otpRequest("single-use-token"));

    expect(response.status).toBe(200);
    expect(requestOtpMock).toHaveBeenCalledWith({
      email: "creator@example.com",
      captchaToken: "single-use-token",
    });
  });

  it("returns a retryable security error when Supabase rejects the challenge", async () => {
    requestOtpMock.mockRejectedValueOnce(
      new SupabaseAuthError("bot_check_failed", "provider detail"),
    );

    const response = await POST(otpRequest("rejected-token"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "bot_check_failed", retryable: true },
    });
  });
});
