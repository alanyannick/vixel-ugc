import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountSessionToken } from "./auth";
import { productQuery } from "./product-db";

vi.mock("./product-db", () => ({
  productQuery: vi.fn(),
}));

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

function accountRequest(input: {
  status?: "pending" | "approved" | "suspended";
  role?: "user" | "admin";
} = {}): Request {
  const token = createAccountSessionToken({
    userId: USER_ID,
    email: "creator@example.com",
    accountStatus: input.status ?? "approved",
    appRole: input.role ?? "user",
  })!;
  return new Request("https://ugc.vixelai.com/api/admin/waitlist", {
    headers: { cookie: `vixel_studio_session=${encodeURIComponent(token)}` },
  });
}

function row(input: {
  status?: "pending" | "approved" | "suspended";
  role?: "user" | "admin";
} = {}) {
  return {
    user_id: USER_ID,
    email: "creator@example.com",
    display_name: null,
    company: null,
    use_case: null,
    expected_volume: null,
    account_status: input.status ?? "approved",
    app_role: input.role ?? "user",
    approved_at: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  };
}

describe("account authorization", () => {
  beforeEach(() => {
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "a-production-session-secret-that-is-long-enough",
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the current database profile instead of trusting signed role hints", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ role: "user" })],
    } as never);
    const { authorizeAccount } = await import("./accounts");
    const authorization = await authorizeAccount(
      accountRequest({ role: "admin" }),
      "request-role",
      { admin: true },
    );
    expect(authorization.allowed).toBe(false);
    if (!authorization.allowed) {
      expect(authorization.response.status).toBe(403);
    }
  });

  it("allows only a current approved admin through the admin boundary", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "approved", role: "admin" })],
    } as never);
    const { authorizeAccount } = await import("./accounts");
    const authorization = await authorizeAccount(
      accountRequest({ role: "admin" }),
      "request-admin",
      { approved: true, admin: true },
    );
    expect(authorization.allowed).toBe(true);
  });

  it("rejects a suspended database profile even with an approved token", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "suspended" })],
    } as never);
    const { authorizeAccount } = await import("./accounts");
    const authorization = await authorizeAccount(
      accountRequest(),
      "request-suspended",
      { approved: true },
    );
    expect(authorization.allowed).toBe(false);
    if (!authorization.allowed) {
      expect(authorization.response.status).toBe(403);
    }
  });
});
