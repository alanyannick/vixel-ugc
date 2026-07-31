import { beforeEach, describe, expect, it, vi } from "vitest";

const { productQueryMock, queryMock, withProductTransactionMock } = vi.hoisted(
  () => ({
    productQueryMock: vi.fn(),
    queryMock: vi.fn(),
    withProductTransactionMock: vi.fn(),
  }),
);

vi.mock("./product-db", () => ({
  productQuery: productQueryMock,
  withProductTransaction: withProductTransactionMock,
}));

import { ensureAccountProfile } from "./accounts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const WAITLIST_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "creator@example.com";

function accountRow(status: "pending" | "approved" = "pending") {
  return {
    user_id: USER_ID,
    email: EMAIL,
    display_name: null,
    company: null,
    use_case: null,
    expected_volume: null,
    account_status: status,
    app_role: "user",
    approved_at: status === "approved" ? new Date("2026-08-01T00:00:00Z") : null,
    created_at: new Date("2026-08-01T00:00:00Z"),
    updated_at: new Date("2026-08-01T00:00:00Z"),
  };
}

function waitlistRow(
  status: "pending" | "approved" = "pending",
  convertedUserId: string | null = USER_ID,
) {
  return {
    id: WAITLIST_ID,
    display_name: "Existing creator",
    status,
    converted_user_id: convertedUserId,
  };
}

beforeEach(() => {
  productQueryMock.mockReset();
  queryMock.mockReset();
  withProductTransactionMock.mockReset();
  withProductTransactionMock.mockImplementation(
    async (
      operation: (client: { query: typeof queryMock }) => Promise<unknown>,
    ) => operation({ query: queryMock }),
  );
});

describe("account-first waitlist linking", () => {
  it("creates an idempotent account-signup waitlist row without changing consent", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vixel_ugc.user_profiles")) {
        return { rows: [accountRow()] };
      }
      if (sql.includes("INSERT INTO vixel_ugc.waitlist_entries")) {
        return { rows: [waitlistRow()] };
      }
      return { rows: [] };
    });

    await expect(
      ensureAccountProfile({ userId: USER_ID, email: EMAIL }),
    ).resolves.toMatchObject({
      userId: USER_ID,
      email: EMAIL,
      accountStatus: "pending",
    });

    const waitlistCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vixel_ugc.waitlist_entries"),
    );
    expect(waitlistCall?.[1]).toEqual([EMAIL, USER_ID]);
    expect(waitlistCall?.[0]).toContain("'account-signup'");
    expect(waitlistCall?.[0]).toContain("ON CONFLICT (email) DO UPDATE");
    expect(waitlistCall?.[0]).toContain(
      "SET converted_user_id = EXCLUDED.converted_user_id",
    );
    expect(waitlistCall?.[0]).not.toContain("display_name =");
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("vixel_ugc.email_preferences"),
      ),
    ).toBe(false);

    const confirmationCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("'waitlist_confirmation'"),
    );
    expect(confirmationCall?.[1]).toEqual([
      EMAIL,
      USER_ID,
      WAITLIST_ID,
      `waitlist_confirmation:${WAITLIST_ID}:v1`,
      "Existing creator",
    ]);
    expect(confirmationCall?.[0]).toContain(
      "ON CONFLICT (idempotency_key) DO NOTHING",
    );
  });

  it("reuses an existing richer waitlist row already linked to the account", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vixel_ugc.user_profiles")) {
        return { rows: [accountRow()] };
      }
      if (sql.includes("INSERT INTO vixel_ugc.waitlist_entries")) {
        return { rows: [] };
      }
      if (sql.includes("FROM vixel_ugc.waitlist_entries")) {
        return { rows: [waitlistRow()] };
      }
      return { rows: [] };
    });

    await expect(
      ensureAccountProfile({ userId: USER_ID, email: EMAIL }),
    ).resolves.toMatchObject({ accountStatus: "pending" });

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("SELECT id, display_name, status, converted_user_id"),
      ),
    ).toBe(true);
  });

  it("restores approved account state from an approved waitlist row", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vixel_ugc.user_profiles")) {
        return { rows: [accountRow()] };
      }
      if (sql.includes("INSERT INTO vixel_ugc.waitlist_entries")) {
        return { rows: [waitlistRow("approved")] };
      }
      if (sql.includes("UPDATE vixel_ugc.user_profiles")) {
        return { rows: [accountRow("approved")] };
      }
      return { rows: [] };
    });

    await expect(
      ensureAccountProfile({ userId: USER_ID, email: EMAIL }),
    ).resolves.toMatchObject({ accountStatus: "approved" });
  });

  it("fails closed instead of stealing a waitlist row linked to another user", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vixel_ugc.user_profiles")) {
        return { rows: [accountRow()] };
      }
      if (sql.includes("INSERT INTO vixel_ugc.waitlist_entries")) {
        return { rows: [] };
      }
      if (sql.includes("FROM vixel_ugc.waitlist_entries")) {
        return { rows: [waitlistRow("pending", OTHER_USER_ID)] };
      }
      return { rows: [] };
    });

    await expect(
      ensureAccountProfile({ userId: USER_ID, email: EMAIL }),
    ).rejects.toThrow("account_waitlist_identity_conflict");
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("vixel_ugc.email_delivery_ledger"),
      ),
    ).toBe(false);
  });
});
