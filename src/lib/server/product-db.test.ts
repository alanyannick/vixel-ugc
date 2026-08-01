import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installProductPoolForTests,
  probeProductDatabaseReadiness,
} from "./product-db";

const DATABASE_URL = "postgresql://runtime:test@database.example.test/vixel";

function fakePool(contractResults: boolean[]) {
  const remainingContractResults = [...contractResults];
  const query = vi.fn(async (text: string, values?: readonly unknown[]) => {
    void values;
    if (text.includes("AS runtime_ready")) {
      return {
        rows: [
          {
            runtime_ready: remainingContractResults.shift() ?? true,
          },
        ],
      };
    }
    if (text === "SELECT 1 AS ready") {
      return { rows: [{ ready: 1 }] };
    }
    throw new Error(`Unexpected product database query: ${text}`);
  });

  return {
    pool: { query } as unknown as Pool,
    query,
  };
}

function installPool(contractResults: boolean[]) {
  const fake = fakePool(contractResults);
  vi.stubEnv("DATABASE_APP_URL", DATABASE_URL);
  vi.stubEnv("DATABASE_URL", "");
  installProductPoolForTests(fake.pool, DATABASE_URL, false);
  return fake;
}

afterEach(() => {
  installProductPoolForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("product database readiness", () => {
  it("does not touch PostgreSQL when no product database is configured", async () => {
    vi.stubEnv("DATABASE_APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "not_configured",
    });
  });

  it("checks the exact runtime role, RLS policy, and table privilege contract", async () => {
    const { query } = installPool([true]);

    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "ready",
    });

    const [contractSql, contractValues] = query.mock.calls[0] ?? [];
    expect(contractSql).toContain("pg_has_role");
    expect(contractSql).toContain("relation.relforcerowsecurity");
    expect(contractSql).toContain("vixel_ugc_runtime_server_access");
    expect(contractSql).toContain("has_table_privilege");
    expect(contractSql).toContain("'UPDATE'");
    expect(contractSql).toContain("'DELETE'");
    expect(contractValues).toEqual([
      8,
      [
        "user_profiles",
        "waitlist_entries",
        "email_preferences",
        "campaign_snapshots",
        "email_delivery_ledger",
        "subscriptions",
        "provider_webhook_events",
        "audit_events",
      ],
      [
        "vixel_ugc.user_profiles",
        "vixel_ugc.waitlist_entries",
        "vixel_ugc.email_preferences",
        "vixel_ugc.campaign_snapshots",
        "vixel_ugc.email_delivery_ledger",
        "vixel_ugc.subscriptions",
        "vixel_ugc.provider_webhook_events",
        "vixel_ugc.audit_events",
      ],
      [
        "vixel_ugc.user_profiles",
        "vixel_ugc.waitlist_entries",
        "vixel_ugc.email_preferences",
        "vixel_ugc.campaign_snapshots",
        "vixel_ugc.email_delivery_ledger",
        "vixel_ugc.subscriptions",
      ],
    ]);
    expect(query.mock.calls[1]?.[0]).toBe("SELECT 1 AS ready");
  });

  it("coalesces concurrent contract probes", async () => {
    const contract = Promise.withResolvers<{
      rows: Array<{ runtime_ready: boolean }>;
    }>();
    const query = vi.fn(
      (text: string, values?: readonly unknown[]) => {
        void values;
        if (text.includes("AS runtime_ready")) return contract.promise;
        if (text === "SELECT 1 AS ready") {
          return Promise.resolve({ rows: [{ ready: 1 }] });
        }
        return Promise.reject(
          new Error(`Unexpected product database query: ${text}`),
        );
      },
    );
    vi.stubEnv("DATABASE_APP_URL", DATABASE_URL);
    vi.stubEnv("DATABASE_URL", "");
    installProductPoolForTests(
      { query } as unknown as Pool,
      DATABASE_URL,
      false,
    );

    const first = probeProductDatabaseReadiness();
    const second = probeProductDatabaseReadiness();
    expect(
      query.mock.calls.filter(([text]) => text.includes("AS runtime_ready")),
    ).toHaveLength(1);

    contract.resolve({ rows: [{ runtime_ready: true }] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "ready" },
      { status: "ready" },
    ]);
  });

  it("revalidates the full contract after the TTL and detects drift", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { query } = installPool([true, false]);

    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "ready",
    });
    now += 14_999;
    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "ready",
    });
    now += 2;
    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "not_ready",
    });

    const contractCalls = query.mock.calls.filter(([text]) =>
      text.includes("AS runtime_ready"),
    );
    const livenessCalls = query.mock.calls.filter(
      ([text]) => text === "SELECT 1 AS ready",
    );
    expect(contractCalls).toHaveLength(2);
    expect(livenessCalls).toHaveLength(2);
  });

  it("invalidates a failed contract probe immediately so recovery can retry", async () => {
    const { query } = installPool([false, true]);

    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "not_ready",
    });
    await expect(probeProductDatabaseReadiness()).resolves.toEqual({
      status: "ready",
    });

    expect(
      query.mock.calls.filter(([text]) => text.includes("AS runtime_ready")),
    ).toHaveLength(2);
    expect(
      query.mock.calls.filter(([text]) => text === "SELECT 1 AS ready"),
    ).toHaveLength(1);
  });
});
