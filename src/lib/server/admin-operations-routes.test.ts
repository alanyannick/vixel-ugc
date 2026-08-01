import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAdminUserOperationError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AdminUserOperationError";
    }
  }
  return {
    authorizeAccount: vi.fn(),
    getAdminOverview: vi.fn(),
    listAdminUsers: vi.fn(),
    mutateAdminUser: vi.fn(),
    AdminUserOperationError: MockAdminUserOperationError,
  };
});

vi.mock("@/lib/server/accounts", () => ({
  authorizeAccount: mocks.authorizeAccount,
}));

vi.mock("@/lib/server/admin-operations", () => ({
  AdminUserOperationError: mocks.AdminUserOperationError,
  getAdminOverview: mocks.getAdminOverview,
  isAdminOverviewWindow: (value: number) => [7, 30, 90].includes(value),
  listAdminUsers: mocks.listAdminUsers,
  mutateAdminUser: mocks.mutateAdminUser,
}));

import { GET as overviewRoute } from "@/app/api/admin/overview/route";
import { GET as usersRoute } from "@/app/api/admin/users/route";
import { PATCH as userMutationRoute } from "@/app/api/admin/users/[userId]/route";

const ACTOR_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";
const TARGET_ID = "1f54f1be-129d-4adb-a731-6fd54cfc1bc2";

function allowAdmin() {
  mocks.authorizeAccount.mockResolvedValue({
    allowed: true,
    session: {},
    account: {
      userId: ACTOR_ID,
      email: "operator@example.com",
      accountStatus: "approved",
      appRole: "admin",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  allowAdmin();
});

describe("admin operations routes", () => {
  it("returns the stable nested overview contract for an approved admin", async () => {
    mocks.getAdminOverview.mockResolvedValue({
      generatedAt: "2026-08-01T00:00:00.000Z",
      windowDays: 30,
      source: { status: "ready" },
      caveats: [],
      queues: [],
      readiness: {},
      metrics: {},
      funnel: [],
      audit: { status: "ready", entries: [] },
    });

    const response = await overviewRoute(
      new Request("https://ugc.vixelai.com/api/admin/overview?window=30"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      overview: expect.objectContaining({ windowDays: 30 }),
    });
    expect(mocks.getAdminOverview).toHaveBeenCalledWith(30);
    expect(mocks.authorizeAccount).toHaveBeenCalledWith(
      expect.any(Request),
      expect.any(String),
      { approved: true, admin: true },
    );
  });

  it("rejects unsupported overview windows without querying metrics", async () => {
    const response = await overviewRoute(
      new Request("https://ugc.vixelai.com/api/admin/overview?window=14"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_admin_window" },
    });
    expect(mocks.getAdminOverview).not.toHaveBeenCalled();
  });

  it("returns users and generatedAt without flattening the contract", async () => {
    mocks.listAdminUsers.mockResolvedValue({
      users: [{ userId: null, email: "waiting@example.com" }],
      generatedAt: "2026-08-01T00:00:00.000Z",
    });

    const response = await usersRoute(
      new Request(
        "https://ugc.vixelai.com/api/admin/users?search=waiting&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{ userId: null, email: "waiting@example.com" }],
      generatedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(mocks.listAdminUsers).toHaveBeenCalledWith({
      search: "waiting",
      limit: 25,
    });
  });

  it("blocks cross-origin mutations before authorization", async () => {
    const response = await userMutationRoute(
      new Request(
        `https://ugc.vixelai.com/api/admin/users/${TARGET_ID}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.example",
          },
          body: JSON.stringify({
            action: "suspend",
            reason: "Security incident",
          }),
        },
      ),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.authorizeAccount).not.toHaveBeenCalled();
    expect(mocks.mutateAdminUser).not.toHaveBeenCalled();
  });

  it("passes the current actor and request id into an audited mutation", async () => {
    mocks.mutateAdminUser.mockResolvedValue({
      user: { userId: TARGET_ID, accountStatus: "suspended" },
      audit: { id: "audit-safe", reason: "Security incident" },
    });
    const request = new Request(
      `https://ugc.vixelai.com/api/admin/users/${TARGET_ID}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "https://ugc.vixelai.com",
          "x-request-id": "request-safe",
        },
        body: JSON.stringify({
          action: "suspend",
          reason: "Security incident",
        }),
      },
    );

    const response = await userMutationRoute(request, {
      params: Promise.resolve({ userId: TARGET_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { userId: TARGET_ID, accountStatus: "suspended" },
      audit: { id: "audit-safe", reason: "Security incident" },
    });
    expect(mocks.mutateAdminUser).toHaveBeenCalledWith({
      userId: TARGET_ID,
      action: "suspend",
      reason: "Security incident",
      actorUserId: ACTOR_ID,
      requestId: "request-safe",
    });
  });

  it("maps lockout protection failures to a conflict", async () => {
    mocks.mutateAdminUser.mockRejectedValue(
      new mocks.AdminUserOperationError(
        "last_usable_admin",
        "The last usable administrator cannot be demoted.",
      ),
    );
    const response = await userMutationRoute(
      new Request(
        `https://ugc.vixelai.com/api/admin/users/${TARGET_ID}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "https://ugc.vixelai.com",
          },
          body: JSON.stringify({
            action: "revoke_admin",
            reason: "Role no longer required",
          }),
        },
      ),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "last_usable_admin" },
    });
  });

  it("maps a transaction-time actor authorization failure to forbidden", async () => {
    mocks.mutateAdminUser.mockRejectedValue(
      new mocks.AdminUserOperationError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      ),
    );
    const response = await userMutationRoute(
      new Request(
        `https://ugc.vixelai.com/api/admin/users/${TARGET_ID}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "https://ugc.vixelai.com",
          },
          body: JSON.stringify({
            action: "suspend",
            reason: "Security incident",
          }),
        },
      ),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "actor_not_authorized" },
    });
  });
});
