import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, signInWithOtpMock, verifyOtpMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import {
  requestSupabaseEmailOtp,
  verifySupabaseEmailOtp,
} from "./supabase-auth";

const USER_ID = "abcdefab-cdef-4abc-8def-abcdefabcdef";

describe("Supabase email OTP", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    signInWithOtpMock.mockReset().mockResolvedValue({ error: null });
    verifyOtpMock.mockReset();
    createClientMock.mockReset().mockReturnValue({
      auth: {
        signInWithOtp: signInWithOtpMock,
        verifyOtp: verifyOtpMock,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets Supabase Auth redeem the Turnstile token exactly once", async () => {
    await requestSupabaseEmailOtp({
      email: "creator@example.com",
      captchaToken: "single-use-token",
    });

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "creator@example.com",
      options: {
        captchaToken: "single-use-token",
        shouldCreateUser: true,
      },
    });
  });

  it("classifies a provider CAPTCHA rejection without exposing provider details", async () => {
    signInWithOtpMock.mockResolvedValueOnce({
      error: { code: "captcha_failed", message: "provider details" },
    });

    await expect(
      requestSupabaseEmailOtp({
        email: "creator@example.com",
        captchaToken: "rejected-token",
      }),
    ).rejects.toMatchObject({ code: "bot_check_failed" });
  });

  it("normalizes the requested and provider identity after a valid OTP", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      data: {
        user: {
          id: `  ${USER_ID.toUpperCase()}  `,
          email: "  Creator@Example.COM ",
        },
      },
      error: null,
    });

    await expect(
      verifySupabaseEmailOtp({
        email: " Creator@Example.com ",
        token: "123456",
      }),
    ).resolves.toEqual({
      userId: USER_ID,
      email: "creator@example.com",
    });
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "creator@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("maps an invalid or expired provider OTP to a stable fail-closed error", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Token has expired" },
    });

    await expect(
      verifySupabaseEmailOtp({
        email: "creator@example.com",
        token: "654321",
      }),
    ).rejects.toMatchObject({
      code: "otp_verification_failed",
    });
  });

  it("rejects a provider identity whose email does not match the OTP address", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      data: {
        user: {
          id: USER_ID,
          email: "different@example.com",
        },
      },
      error: null,
    });

    await expect(
      verifySupabaseEmailOtp({
        email: "creator@example.com",
        token: "123456",
      }),
    ).rejects.toMatchObject({
      code: "otp_verification_failed",
    });
  });
});
