import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { withProductTransactionMock } = vi.hoisted(() => ({
  withProductTransactionMock: vi.fn(),
}));

vi.mock("./product-db", () => ({
  productQuery: vi.fn(),
  withProductTransaction: withProductTransactionMock,
}));

import {
  normalizeWaitlistEmail,
  transitionWaitlist,
  updateWaitlistNote,
  waitlistTransitionTarget,
  type WaitlistStatus,
} from "./waitlist";

const ENTRY_ID = "1f54f1be-129d-4adb-a731-6fd54cfc1bc2";
const ACTOR_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";
const LINKED_USER_ID = "2f54f1be-129d-4adb-a731-6fd54cfc1bc3";

function convertedWaitlistRow(status: WaitlistStatus = "approved") {
  return {
    id: ENTRY_ID,
    email: "admin@example.com",
    display_name: "Admin",
    company: "Example Co",
    use_case: "UGC",
    expected_volume: "10/month",
    status,
    source: "product-entry",
    internal_note: null,
    converted_user_id: LINKED_USER_ID,
    approved_at: "2026-08-01T00:00:00.000Z",
    invited_at: null,
    invitation_expires_at: null,
    last_reminder_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function actorRow(input: {
  status?: "pending" | "approved" | "suspended";
  role?: "user" | "admin";
} = {}) {
  return {
    user_id: ACTOR_ID,
    account_status: input.status ?? "approved",
    app_role: input.role ?? "admin",
  };
}

beforeEach(() => {
  withProductTransactionMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("waitlist domain rules", () => {
  it("normalizes email as the canonical duplicate key", () => {
    expect(normalizeWaitlistEmail("  Creator+UGC@Example.COM ")).toBe(
      "creator+ugc@example.com",
    );
  });

  it("allows only explicit operator status transitions", () => {
    expect(waitlistTransitionTarget("pending", "approve")).toBe("approved");
    expect(waitlistTransitionTarget("approved", "invite")).toBe("invited");
    expect(waitlistTransitionTarget("invited", "revoke")).toBe("approved");
    expect(waitlistTransitionTarget("invited", "reject")).toBe("rejected");
  });

  it("rejects transitions that would resend or skip lifecycle gates", () => {
    const statuses: WaitlistStatus[] = [
      "pending",
      "approved",
      "invited",
      "rejected",
      "converted",
    ];
    expect(waitlistTransitionTarget("pending", "invite")).toBeNull();
    expect(waitlistTransitionTarget("invited", "invite")).toBeNull();
    expect(waitlistTransitionTarget("converted", "reject")).toBeNull();
    expect(
      statuses.filter(
        (status) => waitlistTransitionTarget(status, "approve") !== null,
      ),
    ).toEqual(["pending", "rejected"]);
  });
});

describe("linked account waitlist protection and audit", () => {
  it("fails closed when an in-flight actor loses admin authority", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow({ role: "user" })] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      transitionWaitlist({
        entryId: ENTRY_ID,
        action: "reject",
        reason: "Access policy changed",
        actorUserId: ACTOR_ID,
        requestId: "request-stale-operator",
      }),
    ).rejects.toMatchObject({ code: "actor_not_authorized" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
    expect(String(query.mock.calls[1][0])).toContain("FOR SHARE");
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM vixel_ugc.waitlist_entries"),
      ),
    ).toBe(false);
  });

  it("requires a meaningful reason before a linked ordinary account can be changed", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: LINKED_USER_ID,
            account_status: "approved",
            app_role: "user",
          },
        ],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      transitionWaitlist({
        entryId: ENTRY_ID,
        action: "reject",
        actorUserId: ACTOR_ID,
        requestId: "request-missing-reason",
      }),
    ).rejects.toMatchObject({ code: "invalid_reason" });

    expect(query).toHaveBeenCalledTimes(4);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE vixel_ugc.waitlist_entries"),
      ),
    ).toBe(false);
  });

  it("records a normalized reason with a linked ordinary account transition", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: LINKED_USER_ID,
            account_status: "approved",
            app_role: "user",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow("rejected")] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    const result = await transitionWaitlist({
      entryId: ENTRY_ID,
      action: "reject",
      reason: "  Customer   requested access removal  ",
      actorUserId: ACTOR_ID,
      requestId: "request-audited-reject",
    });

    expect(result.status).toBe("rejected");
    const auditValues = query.mock.calls[6][1] as unknown[];
    expect(auditValues[0]).toBe(ACTOR_ID);
    expect(auditValues[1]).toBe(LINKED_USER_ID);
    expect(auditValues[3]).toBe("waitlist.reject");
    expect(JSON.parse(String(auditValues[4]))).toMatchObject({
      status: "approved",
      accountStatus: "approved",
      appRole: "user",
    });
    expect(JSON.parse(String(auditValues[5]))).toMatchObject({
      status: "rejected",
      accountStatus: "pending",
      appRole: "user",
      reason: "Customer requested access removal",
    });
    expect(auditValues[6]).toBe("request-audited-reject");
  });

  it("blocks a reject before it can downgrade a linked approved administrator", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: LINKED_USER_ID,
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
      transitionWaitlist({
        entryId: ENTRY_ID,
        action: "reject",
        actorUserId: ACTOR_ID,
        requestId: "request-protected-admin",
      }),
    ).rejects.toMatchObject({ code: "protected_admin" });

    expect(query).toHaveBeenCalledTimes(4);
    expect(String(query.mock.calls[3][0])).toContain(
      "FROM vixel_ugc.user_profiles",
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE vixel_ugc.waitlist_entries"),
      ),
    ).toBe(false);
  });

  it("also protects a bootstrap administrator whose stored role is still user", async () => {
    vi.stubEnv("ADMIN_USER_IDS", LINKED_USER_ID);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: LINKED_USER_ID,
            account_status: "approved",
            app_role: "user",
          },
        ],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      transitionWaitlist({
        entryId: ENTRY_ID,
        action: "reject",
        actorUserId: ACTOR_ID,
        requestId: "request-bootstrap-admin",
      }),
    ).rejects.toMatchObject({ code: "protected_admin" });
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("blocks Admissions from restoring a suspended administrator through rejected to approved", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow()] })
      .mockResolvedValueOnce({ rows: [convertedWaitlistRow("rejected")] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: LINKED_USER_ID,
            account_status: "suspended",
            app_role: "admin",
          },
        ],
      });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      transitionWaitlist({
        entryId: ENTRY_ID,
        action: "approve",
        reason: "Re-admit this operator",
        actorUserId: ACTOR_ID,
        requestId: "request-restore-admin",
      }),
    ).rejects.toMatchObject({ code: "protected_admin" });

    expect(query).toHaveBeenCalledTimes(4);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE vixel_ugc.user_profiles"),
      ),
    ).toBe(false);
  });
});

describe("waitlist note authorization", () => {
  it("fails closed when an in-flight note actor loses admin authority", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [actorRow({ status: "suspended" })] });
    withProductTransactionMock.mockImplementationOnce(
      async (operation: (client: { query: typeof query }) => unknown) =>
        operation({ query }),
    );

    await expect(
      updateWaitlistNote({
        entryId: ENTRY_ID,
        note: "This note must not be written",
        actorUserId: ACTOR_ID,
        requestId: "request-stale-note-operator",
      }),
    ).rejects.toMatchObject({ code: "actor_not_authorized" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain("pg_advisory_xact_lock");
    expect(String(query.mock.calls[1][0])).toContain("FOR SHARE");
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE vixel_ugc.waitlist_entries"),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO vixel_ugc.audit_events"),
      ),
    ).toBe(false);
  });
});
