import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as accountSessionRoute } from "@/app/api/auth/session/route";

import { createAccountSessionToken, getAccountSession } from "./auth";
import { productQuery } from "./product-db";

vi.mock("./product-db", () => ({
  productQuery: vi.fn(),
}));

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

function accountRequest(
  input: {
    status?: "pending" | "approved" | "suspended";
    role?: "user" | "admin";
  } = {},
): Request {
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

function row(
  input: {
    status?: "pending" | "approved" | "suspended";
    role?: "user" | "admin";
  } = {},
) {
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

  it("allows a verified suspended profile through billing management only", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "suspended" })],
    } as never);
    const { authorizeBillingManagement } = await import("./accounts");

    const authorization = await authorizeBillingManagement(
      accountRequest({ status: "approved" }),
      "request-suspended-billing",
    );

    expect(authorization.allowed).toBe(true);
    if (authorization.allowed) {
      expect(authorization.account.accountStatus).toBe("suspended");
    }
  });

  it("keeps billing management closed to anonymous and missing profiles", async () => {
    const { authorizeBillingManagement } = await import("./accounts");
    const anonymous = await authorizeBillingManagement(
      new Request("https://ugc.vixelai.com/api/billing/portal"),
      "request-anonymous-billing",
    );
    expect(anonymous.allowed).toBe(false);
    if (!anonymous.allowed) expect(anonymous.response.status).toBe(401);

    vi.mocked(productQuery).mockResolvedValueOnce({ rows: [] } as never);
    const missingProfile = await authorizeBillingManagement(
      accountRequest({ status: "suspended" }),
      "request-missing-profile-billing",
    );
    expect(missingProfile.allowed).toBe(false);
    if (!missingProfile.allowed) {
      expect(missingProfile.response.status).toBe(401);
    }
  });

  it("refreshes the v3 cookie and response from the latest account profile", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "approved", role: "admin" })],
    } as never);

    const response = await accountSessionRoute(
      accountRequest({ status: "pending", role: "user" }),
    );
    expect(response.status).toBe(200);
    expect(await response.clone().json()).toMatchObject({
      authenticated: true,
      account: {
        userId: USER_ID,
        accountStatus: "approved",
        appRole: "admin",
      },
    });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    const cookiePair = setCookie!.split(";", 1)[0];
    expect(
      getAccountSession(
        new Request("https://ugc.vixelai.com/api/auth/session", {
          headers: { cookie: cookiePair },
        }),
      ),
    ).toMatchObject({
      userId: USER_ID,
      accountStatus: "approved",
      appRole: "admin",
    });
  });

  it("uses current approval for product APIs instead of stale v3 claims", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "approved" })],
    } as never);
    const { requireCurrentStudioSession } = await import("./accounts");

    await expect(
      requireCurrentStudioSession(
        accountRequest({ status: "pending" }),
        "request-current-approval",
      ),
    ).resolves.toBeNull();
  });

  it("blocks a stale approved v3 cookie after the account is suspended", async () => {
    vi.mocked(productQuery).mockResolvedValueOnce({
      rows: [row({ status: "suspended" })],
    } as never);
    const { requireCurrentStudioSession } = await import("./accounts");

    const response = await requireCurrentStudioSession(
      accountRequest({ status: "approved" }),
      "request-current-suspension",
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({
      error: { code: "account_suspended" },
    });
  });

  it("fails product APIs closed when current account authorization is unavailable", async () => {
    vi.mocked(productQuery).mockRejectedValueOnce(new Error("db unavailable"));
    const { requireCurrentStudioSession } = await import("./accounts");

    const response = await requireCurrentStudioSession(
      accountRequest(),
      "request-current-database",
    );
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({
      error: { code: "account_database_unavailable" },
    });
  });
});
