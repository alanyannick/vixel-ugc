import { describe, expect, it, vi } from "vitest";

import {
  probeMediaLedgerReadiness,
  type MediaLedgerProbeOptions,
} from "./database-readiness";

type FakeClient = {
  connect: ReturnType<typeof vi.fn<() => Promise<void>>>;
  query: ReturnType<
    typeof vi.fn<
      (
        text: string,
        values?: readonly unknown[],
      ) => Promise<{ rows: unknown[] }>
    >
  >;
  end: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function readyAccessRow() {
  return {
    schema_exists: true,
    table_exists: true,
    schema_usage: true,
    can_select: true,
    can_insert: true,
    can_update: true,
    delete_denied: true,
    schema_create_denied: true,
    runtime_role: true,
    runtime_role_restricted: true,
    row_security_ready: true,
    runtime_policy_exists: true,
  };
}

function fakeClient(
  accessRow: unknown = readyAccessRow(),
  updateAllowed = true,
): FakeClient {
  let queryIndex = 0;
  return {
    connect: vi.fn(async () => undefined),
    query: vi.fn(
      async (
        text: string,
        values?: readonly unknown[],
      ): Promise<{ rows: unknown[] }> => {
        queryIndex += 1;
        if (queryIndex === 1) return { rows: [accessRow] };
        if (text.includes("LIMIT 0")) return { rows: [] };
        if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
        const id = values?.[0];
        if (text.includes("INSERT INTO")) {
          return { rows: [{ id, revision: 0 }] };
        }
        if (text.includes("SELECT id, revision")) {
          return { rows: [{ id, revision: 0 }] };
        }
        if (text.includes("SET revision = revision + 1")) {
          return {
            rows: updateAllowed ? [{ id, revision: 1 }] : [],
          };
        }
        throw new Error(`Unexpected readiness query: ${text}`);
      },
    ),
    end: vi.fn(async () => undefined),
  };
}

function probeOptions(
  client: FakeClient,
  createClient = vi.fn(() => client),
): MediaLedgerProbeOptions {
  return {
    env: {
      NODE_ENV: "test",
      DATABASE_APP_URL:
        "postgresql://runtime:secret@database.example.test:5432/postgres",
    },
    createClient,
  };
}

describe("media ledger database readiness", () => {
  it("does not create a client when the database is not configured", async () => {
    const createClient = vi.fn();

    await expect(
      probeMediaLedgerReadiness({
        env: { NODE_ENV: "test" },
        createClient,
      }),
    ).resolves.toEqual({ status: "not_configured" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("uses DATABASE_URL when the application-specific value is empty", async () => {
    const client = fakeClient();
    const createClient = vi.fn(() => client);

    await expect(
      probeMediaLedgerReadiness({
        env: {
          NODE_ENV: "test",
          DATABASE_APP_URL: " ",
          DATABASE_URL:
            "postgresql://fallback:secret@database.example.test/postgres",
        },
        createClient,
      }),
    ).resolves.toEqual({ status: "ready" });
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString:
          "postgresql://fallback:secret@database.example.test/postgres",
      }),
    );
  });

  it("checks connection, shape, and a rolled-back INSERT/SELECT/UPDATE capability", async () => {
    const client = fakeClient();
    const createClient = vi.fn(() => client);

    await expect(
      probeMediaLedgerReadiness(probeOptions(client, createClient)),
    ).resolves.toEqual({ status: "ready" });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeoutMillis: 2_000,
        statement_timeout: 2_000,
        query_timeout: 2_000,
        application_name: "vixel-health-readiness",
      }),
    );
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(7);
    expect(client.query.mock.calls[0]?.[0]).toContain(
      "has_schema_privilege",
    );
    expect(client.query.mock.calls[0]?.[0]).toContain("DELETE");
    expect(client.query.mock.calls[0]?.[0]).toContain("CREATE");
    expect(client.query.mock.calls[0]?.[0]).toContain("rolbypassrls");
    expect(client.query.mock.calls[0]?.[0]).toContain("pg_policies");
    expect(client.query.mock.calls[1]?.[0]).toContain(
      "FROM vixel_koc.media_generation_ledger",
    );
    expect(client.query.mock.calls[1]?.[0]).toContain("account_user_id");
    expect(client.query.mock.calls[1]?.[0]).toContain("revision");
    expect(client.query.mock.calls[1]?.[0]).toContain("LIMIT 0");
    expect(client.query.mock.calls[2]?.[0]).toBe("BEGIN");
    expect(client.query.mock.calls[3]?.[0]).toContain("INSERT INTO");
    expect(client.query.mock.calls[4]?.[0]).toContain(
      "SELECT id, revision",
    );
    expect(client.query.mock.calls[5]?.[0]).toContain(
      "SET revision = revision + 1",
    );
    expect(client.query.mock.calls[6]?.[0]).toBe("ROLLBACK");
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("fails closed when schema, role, or table privileges are incomplete", async () => {
    const client = fakeClient({
      ...readyAccessRow(),
      can_update: false,
    });

    await expect(
      probeMediaLedgerReadiness(probeOptions(client)),
    ).resolves.toEqual({ status: "not_ready" });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("fails closed and suppresses connection diagnostics", async () => {
    const client = fakeClient();
    client.connect.mockRejectedValueOnce(
      new Error(
        "password=do-not-leak host=private-database.example.internal",
      ),
    );

    const result = await probeMediaLedgerReadiness(
      probeOptions(client),
    );

    expect(result).toEqual({ status: "not_ready" });
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
    expect(JSON.stringify(result)).not.toContain(
      "private-database.example.internal",
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a restrictive RLS policy hides runtime updates", async () => {
    const client = fakeClient(readyAccessRow(), false);

    await expect(
      probeMediaLedgerReadiness(probeOptions(client)),
    ).resolves.toEqual({ status: "not_ready" });
    expect(client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent public readiness probes for a short TTL", async () => {
    const client = fakeClient();
    const createClient = vi.fn(() => client);
    const options = {
      ...probeOptions(client, createClient),
      env: {
        NODE_ENV: "test",
        DATABASE_APP_URL:
          "postgresql://runtime:secret@database.example.test/cache-coalesce",
      },
      cacheTtlMs: 1_000,
    } satisfies MediaLedgerProbeOptions;

    const [first, second] = await Promise.all([
      probeMediaLedgerReadiness(options),
      probeMediaLedgerReadiness(options),
    ]);
    const third = await probeMediaLedgerReadiness(options);

    expect(first).toEqual({ status: "ready" });
    expect(second).toEqual({ status: "ready" });
    expect(third).toEqual({ status: "ready" });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("bounds caller-provided connection and statement timeouts", async () => {
    const client = fakeClient();
    const createClient = vi.fn(() => client);

    await probeMediaLedgerReadiness({
      ...probeOptions(client, createClient),
      timeoutMs: 60_000,
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeoutMillis: 5_000,
        statement_timeout: 5_000,
        query_timeout: 5_000,
      }),
    );
  });
});
