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

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WAITLIST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMAIL = "creator@example.com";

function accountRow(
  status: "pending" | "approved" | "suspended" = "pending",
) {
  return {
    user_id: USER_ID,
    email: EMAIL,
    display_name: null,
    company: null,
    use_case: null,
    expected_volume: null,
    account_status: status,
    app_role: "user",
    approved_at:
      status === "pending" ? null : new Date("2026-08-01T00:00:00Z"),
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
      ensureAccountProfile({
        userId: USER_ID.toUpperCase(),
        email: "  Creator@Example.COM ",
      }),
    ).resolves.toMatchObject({
      userId: USER_ID,
      email: EMAIL,
      accountStatus: "pending",
    });

    const profileCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vixel_ugc.user_profiles"),
    );
    expect(profileCall?.[1]).toEqual([USER_ID, EMAIL, "user"]);
    expect(profileCall?.[0]).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(profileCall?.[0]).not.toContain("ON CONFLICT (email)");

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

  it("never self-restores a suspended profile from an approved waitlist row", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO vixel_ugc.user_profiles")) {
        return { rows: [accountRow("suspended")] };
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
    ).resolves.toMatchObject({
      userId: USER_ID,
      email: EMAIL,
      accountStatus: "suspended",
    });
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE vixel_ugc.user_profiles"),
      ),
    ).toBe(false);
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
    const waitlistCall = queryMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vixel_ugc.waitlist_entries"),
    );
    expect(waitlistCall?.[1]).toEqual([EMAIL, USER_ID]);
    expect(waitlistCall?.[0]).toContain(
      "WHERE vixel_ugc.waitlist_entries.converted_user_id IS NULL",
    );
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes("vixel_ugc.email_delivery_ledger"),
      ),
    ).toBe(false);
  });
});
