import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { productQueryMock, withProductTransactionMock } = vi.hoisted(() => ({
  productQueryMock: vi.fn(),
  withProductTransactionMock: vi.fn(),
}));

vi.mock("./product-db", () => ({
  productQuery: productQueryMock,
  withProductTransaction: withProductTransactionMock,
}));

import {
  AdminUserOperationError,
  getAdminOverview,
  listAdminUsers,
  mutateAdminUser,
} from "./admin-operations";

const ACTOR_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";
const TARGET_ID = "1f54f1be-129d-4adb-a731-6fd54cfc1bc2";
const AUDIT_ID = "2f54f1be-129d-4adb-a731-6fd54cfc1bc3";

function userRow(input: {
  userId?: string | null;
  status?: "pending" | "approved" | "suspended" | null;
  role?: "user" | "admin" | null;
} = {}) {
  return {
    user_id: input.userId === undefined ? TARGET_ID : input.userId,
    email: input.userId === null ? "waiting@example.com" : "creator@example.com",
    display_name: input.userId === null ? "Waiting Creator" : "Creator",
    company: "Example Co",
    waitlist_status: input.userId === null ? "approved" : "converted",
    account_status: input.status === undefined ? "approved" : input.status,
    app_role: input.role === undefined ? "user" : input.role,
    subscription_status: input.userId === null ? "none" : "active",
    campaign_count: input.userId === null ? 0 : "2",
    successful_generation_count: input.userId === null ? 0 : "3",
    generation_attention_count: input.userId === null ? 0 : "1",
    email_failure_count: input.userId === null ? 1 : "0",
    created_at: "2026-07-31T00:00:00.000Z",
    approved_at: "2026-07-31T01:00:00.000Z",
  };
}

function actorRow(input: {
  status?: "pending" | "approved" | "suspended";
  role?: "user" | "admin";
} = {}) {
  return {
    user_id: ACTOR_ID,
    email: "operator@example.com",
    account_status: input.status ?? "approved",
    app_role: input.role ?? "admin",
  };
}

function coreOverviewRow() {
  return {
    total_accounts: "20",
    approved_accounts: "12",
    active_subscriptions: "3",
    campaign_count: "8",
    pending_waitlist: "5",
    failed_emails: "2",
    billing_attention: "1",
    cohort_submitted: "10",
    cohort_approved: "8",
    cohort_accounts: "6",
    cohort_campaigns: "4",
    cohort_active_subscription: "3",
  };
}

function generationOverviewRow() {
  return {
    successful_generation_count: "11",
    generation_attention: "2",
    cohort_successful_generation: "2",
  };
}

function auditRow() {
  return {
    id: AUDIT_ID,
    actor_user_id: ACTOR_ID,
    actor_email: "operator@example.com",
    subject_user_id: TARGET_ID,
    subject_email: "creator@example.com",
    action: "account.suspend",
    before_state: { accountStatus: "approved", appRole: "user" },
    after_state: {
      accountStatus: "suspended",
      appRole: "user",
      reason: "Repeated provider abuse",
    },
    request_id: "request-admin",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  productQueryMock.mockReset();
  withProductTransactionMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin user read model", () => {
  it("combines account activity and waitlist-only identities without inventing an account", async () => {
    vi.stubEnv("ADMIN_USER_IDS", TARGET_ID);
    productQueryMock
      .mockResolvedValueOnce({
        rows: [userRow(), userRow({ userId: null, status: null, role: null })],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: TARGET_ID,
            successful_generation_count: "3",
            generation_attention_count: "1",
          },
        ],
      });

    const result = await listAdminUsers({ search: "creator", limit: 25 });

    expect(result.users).toEqual([
      expect.objectContaining({
        userId: TARGET_ID,
        waitlistStatus: "converted",
        subscriptionStatus: "active",
        campaignCount: 2,
        successfulGenerationCount: 3,
        generationAttentionCount: 1,
        isBootstrapAdmin: true,
      }),
      expect.objectContaining({
        userId: null,
        email: "waiting@example.com",
        accountStatus: null,
        appRole: null,
        waitlistStatus: "approved",
        emailFailureCount: 1,
        isBootstrapAdmin: false,
      }),
    ]);
    expect(productQueryMock.mock.calls[0][0]).toContain("waitlist_identities");
    expect(productQueryMock.mock.calls[0][1]).toEqual(["creator", 25]);
  });

  it("keeps user access available when the optional generation ledger is unavailable", async () => {
    productQueryMock
      .mockResolvedValueOnce({ rows: [userRow()] })
      .mockRejectedValueOnce(new Error("generation ledger unavailable"));

    const result = await listAdminUsers({ limit: 25 });

    expect(result.users[0]).toMatchObject({
      userId: TARGET_ID,
      accountStatus: "approved",
      successfulGenerationCount: null,
      generationAttentionCount: null,
    });
  });
});

describe("admin overview", () => {
  it("returns source-backed queues, metrics, audit, and cohort conversions", async () => {
    productQueryMock
      .mockResolvedValueOnce({ rows: [coreOverviewRow()] })
      .mockResolvedValueOnce({ rows: [generationOverviewRow()] })
      .mockResolvedValueOnce({ rows: [auditRow()] });

    const overview = await getAdminOverview(30);

    expect(overview.source).toMatchObject({
      status: "ready",
      parts: {
        product: "ready",
        generationLedger: "ready",
        audit: "ready",
      },
    });
    expect(overview.metrics).toEqual({
      totalAccounts: 20,
      approvedAccounts: 12,
      activeSubscriptions: 3,
      campaignCount: 8,
      successfulGenerationCount: 11,
    });
    expect(overview.queues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "waitlist_review", count: 5 }),
        expect.objectContaining({ id: "generation_reconciliation", count: 2 }),
      ]),
    );
    expect(overview.funnel.map((stage) => stage.value)).toEqual([
      10, 8, 6, 4, 3, 2,
    ]);
    expect(overview.funnel[1].conversionFromPreviousPercent).toBe(80);
    expect(overview.audit.entries[0]).toMatchObject({
      reason: "Repeated provider abuse",
      after: { accountStatus: "suspended", appRole: "user" },
    });
  });

  it("uses null and an explicit unavailable state when the generation source fails", async () => {
    productQueryMock
      .mockResolvedValueOnce({ rows: [coreOverviewRow()] })
      .mockRejectedValueOnce(new Error("ledger unavailable"))
      .mockResolvedValueOnce({ rows: [] });

    const overview = await getAdminOverview(7);

    expect(overview.source.status).toBe("partial");
    expect(overview.source.parts.generationLedger).toBe("unavailable");
    expect(overview.metrics.successfulGenerationCount).toBeNull();
    expect(
      overview.queues.find((queue) => queue.id === "generation_reconciliation"),
    ).toMatchObject({ count: null, status: "unavailable" });
    expect(
      overview.funnel.find(
        (stage) => stage.id === "first_successful_generation",
      ),
    ).toMatchObject({ value: null, status: "unavailable" });
    expect(overview.caveats.join(" ")).toContain("generation ledger is unavailable");
  });
});

describe("audited admin user mutations", () => {
  it("rejects every self status or role mutation before opening a transaction", async () => {
    await expect(
      mutateAdminUser({
        userId: ACTOR_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "Security incident",
        requestId: "request-self",
      }),
    ).rejects.toMatchObject({ code: "self_change_forbidden" });
    expect(withProductTransactionMock).not.toHaveBeenCalled();
  });

  it("fails closed when the actor loses approved admin authority after route authorization", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [actorRow({ status: "suspended" })],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "Security incident",
        requestId: "request-stale-actor",
      }),
    ).rejects.toMatchObject({ code: "actor_not_authorized" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
    expect(String(query.mock.calls[1][0])).toContain("FOR SHARE");
    expect(query.mock.calls[1][1]).toEqual([ACTOR_ID]);
  });

  it("does not let the bootstrap environment list bypass the stored-role authorization boundary", async () => {
    vi.stubEnv("ADMIN_USER_IDS", ACTOR_ID);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow({ role: "user" })] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "Security incident",
        requestId: "request-bootstrap-actor",
      }),
    ).rejects.toMatchObject({ code: "actor_not_authorized" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("protects a bootstrap administrator from suspension", async () => {
    vi.stubEnv("ADMIN_USER_IDS", TARGET_ID);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: TARGET_ID,
            email: "admin@example.com",
            account_status: "approved",
            app_role: "admin",
          },
        ],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "Rotate operator access",
        requestId: "request-bootstrap",
      }),
    ).rejects.toMatchObject({ code: "bootstrap_admin_protected" });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("prevents removing the final approved administrator", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: TARGET_ID,
            email: "admin@example.com",
            account_status: "approved",
            app_role: "admin",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "revoke_admin",
        reason: "Role no longer required",
        requestId: "request-last-admin",
      }),
    ).rejects.toMatchObject({ code: "last_usable_admin" });
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("does not turn a pending account into an approved account through suspend and restore", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: TARGET_ID,
            email: "waiting@example.com",
            account_status: "pending",
            app_role: "user",
          },
        ],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "Hold account during review",
        requestId: "request-pending",
      }),
    ).rejects.toMatchObject({ code: "invalid_transition" });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("updates and records actor, before, after, reason, and request id atomically", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: TARGET_ID,
            email: "creator@example.com",
            account_status: "approved",
            app_role: "user",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: AUDIT_ID }] })
      .mockResolvedValueOnce({ rows: [userRow({ status: "suspended" })] })
      .mockResolvedValueOnce({ rows: [auditRow()] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    const result = await mutateAdminUser({
      userId: TARGET_ID,
      actorUserId: ACTOR_ID,
      action: "suspend",
      reason: "  Repeated   provider abuse  ",
      requestId: "request-admin",
    });

    expect(result.user.accountStatus).toBe("suspended");
    expect(result.audit).toMatchObject({
      actorUserId: ACTOR_ID,
      subjectUserId: TARGET_ID,
      reason: "Repeated provider abuse",
      requestId: "request-admin",
    });
    const auditValues = query.mock.calls[4][1];
    expect(auditValues).toEqual([
      ACTOR_ID,
      TARGET_ID,
      "account.suspend",
      JSON.stringify({ accountStatus: "approved", appRole: "user" }),
      JSON.stringify({
        accountStatus: "suspended",
        appRole: "user",
        reason: "Repeated provider abuse",
      }),
      "request-admin",
    ]);
  });

  it("rejects a non-meaningful reason", async () => {
    await expect(
      mutateAdminUser({
        userId: TARGET_ID,
        actorUserId: ACTOR_ID,
        action: "suspend",
        reason: "   no ",
        requestId: "request-reason",
      }),
    ).rejects.toBeInstanceOf(AdminUserOperationError);
    expect(withProductTransactionMock).not.toHaveBeenCalled();
  });
});
