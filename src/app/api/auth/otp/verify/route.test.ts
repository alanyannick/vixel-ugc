import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockSupabaseAuthError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "SupabaseAuthError";
    }
  }
  return {
    ensureAccountProfile: vi.fn(),
    verifySupabaseEmailOtp: vi.fn(),
    createAccountSessionToken: vi.fn(),
    sessionCookie: vi.fn(),
    SupabaseAuthError: MockSupabaseAuthError,
  };
});

vi.mock("@/lib/server/accounts", () => ({
  ensureAccountProfile: mocks.ensureAccountProfile,
}));

vi.mock("@/lib/server/auth", () => ({
  createAccountSessionToken: mocks.createAccountSessionToken,
  sessionCookie: mocks.sessionCookie,
}));

vi.mock("@/lib/server/env", () => ({
  getServerRuntimeConfig: () => ({
    product: { features: { accountAuth: { ready: true } } },
  }),
}));

vi.mock("@/lib/server/supabase-auth", () => ({
  SupabaseAuthError: mocks.SupabaseAuthError,
  verifySupabaseEmailOtp: mocks.verifySupabaseEmailOtp,
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const EMAIL = "creator@example.com";

function request(input: { email?: string; code?: string } = {}): Request {
  return new Request("https://ugc.vixelai.com/api/auth/otp/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ugc.vixelai.com",
      "sec-fetch-site": "same-origin",
      "x-request-id": "request-otp-verify",
    },
    body: JSON.stringify({
      email: input.email ?? " Creator@Example.COM ",
      code: input.code ?? "123456",
    }),
  });
}

function account(userId = USER_ID) {
  return {
    userId,
    email: EMAIL,
    accountStatus: "pending",
    appRole: "user",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifySupabaseEmailOtp.mockResolvedValue({
    userId: USER_ID,
    email: EMAIL,
  });
  mocks.ensureAccountProfile.mockResolvedValue(account());
  mocks.createAccountSessionToken.mockReturnValue("signed-account-token");
  mocks.sessionCookie.mockReturnValue(
    "vixel_studio_session=signed-account-token; Path=/; HttpOnly",
  );
});

describe("email OTP verification route", () => {
  it("normalizes a valid request, binds the verified identity, and issues a session", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.verifySupabaseEmailOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: "123456",
    });
    expect(mocks.ensureAccountProfile).toHaveBeenCalledWith({
      userId: USER_ID,
      email: EMAIL,
    });
    expect(mocks.createAccountSessionToken).toHaveBeenCalledWith(account());
    expect(response.headers.get("set-cookie")).toBe(
      "vixel_studio_session=signed-account-token; Path=/; HttpOnly",
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      requestId: "request-otp-verify",
      account: {
        email: EMAIL,
        accountStatus: "pending",
        appRole: "user",
      },
    });
  });

  it("rejects a malformed OTP without calling Supabase or account binding", async () => {
    const response = await POST(request({ code: "12345" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_otp", retryable: false },
    });
    expect(mocks.verifySupabaseEmailOtp).not.toHaveBeenCalled();
    expect(mocks.ensureAccountProfile).not.toHaveBeenCalled();
  });

  it("does not create a profile or cookie for an invalid provider OTP", async () => {
    mocks.verifySupabaseEmailOtp.mockRejectedValue(
      new mocks.SupabaseAuthError(
        "otp_verification_failed",
        "The sign-in code is invalid or has expired.",
      ),
    );

    const response = await POST(request({ code: "654321" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_otp", retryable: false },
    });
    expect(mocks.ensureAccountProfile).not.toHaveBeenCalled();
    expect(mocks.createAccountSessionToken).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps a suspended profile suspended in both the cookie claim and response", async () => {
    const suspendedAccount = {
      ...account(),
      accountStatus: "suspended",
    };
    mocks.ensureAccountProfile.mockResolvedValueOnce(suspendedAccount);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createAccountSessionToken).toHaveBeenCalledWith(
      suspendedAccount,
    );
    expect(await response.json()).toMatchObject({
      account: {
        email: EMAIL,
        accountStatus: "suspended",
        appRole: "user",
      },
    });
  });

  it("fails closed when the same email is already bound to another immutable user id", async () => {
    mocks.verifySupabaseEmailOtp.mockResolvedValueOnce({
      userId: OTHER_USER_ID,
      email: EMAIL,
    });
    mocks.ensureAccountProfile.mockRejectedValueOnce(
      new Error("account_waitlist_identity_conflict"),
    );

    const response = await POST(request());

    expect(mocks.ensureAccountProfile).toHaveBeenCalledWith({
      userId: OTHER_USER_ID,
      email: EMAIL,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "account_session_unavailable", retryable: false },
    });
    expect(mocks.createAccountSessionToken).not.toHaveBeenCalled();
    expect(mocks.sessionCookie).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
