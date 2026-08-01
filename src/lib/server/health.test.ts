import { beforeEach, describe, expect, it, vi } from "vitest";

const { probeMediaLedgerReadinessMock, probeProductDatabaseReadinessMock } =
  vi.hoisted(() => ({
    probeMediaLedgerReadinessMock: vi.fn(),
    probeProductDatabaseReadinessMock: vi.fn(),
  }));

vi.mock("@/lib/server/database-readiness", () => ({
  probeMediaLedgerReadiness: probeMediaLedgerReadinessMock,
}));

vi.mock("@/lib/server/product-db", () => ({
  probeProductDatabaseReadiness: probeProductDatabaseReadinessMock,
}));

import { GET as healthRoute } from "@/app/api/health/route";
import { getServerRuntimeConfig } from "@/lib/server/env";

function configureLiveRuntime(): void {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
  vi.stubEnv("NEWAPI_BASE_URL", "https://gateway.example.test/v1");
  vi.stubEnv("NEWAPI_API_KEY", "server-only-provider-key");
  vi.stubEnv("ENABLE_ACCOUNT_AUTH", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "turnstile-site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret-key");
  vi.stubEnv("ENABLE_BILLING", "true");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ugc.example.test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_health");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "stripe-webhook-secret");
  vi.stubEnv("STRIPE_PRICE_UGC_BETA", "price_beta");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  probeMediaLedgerReadinessMock.mockReset();
  probeMediaLedgerReadinessMock.mockResolvedValue({ status: "ready" });
  probeProductDatabaseReadinessMock.mockReset();
  probeProductDatabaseReadinessMock.mockResolvedValue({ status: "ready" });
});

describe("health ledger readiness", () => {
  it("probes a configured candidate database while live generation is off", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    vi.stubEnv(
      "DATABASE_APP_URL",
      "postgresql://runtime:secret@database.example.test/postgres",
    );

    const response = await healthRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: {
        readiness: true,
        ledger: "ready",
      },
      databaseConfigured: true,
      liveGeneration: false,
    });
    expect(probeMediaLedgerReadinessMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("vercel-cdn-cache-control")).toBe(
      "s-maxage=15, stale-while-revalidate=30",
    );
  });

  it("exposes a failed candidate probe without degrading planning mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    vi.stubEnv(
      "DATABASE_APP_URL",
      "postgresql://runtime:secret@database.example.test/postgres",
    );
    probeMediaLedgerReadinessMock.mockResolvedValueOnce({
      status: "not_ready",
    });

    const response = await healthRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: {
        readiness: true,
        ledger: "not_ready",
      },
      issues: [],
      databaseConfigured: true,
      liveGeneration: false,
    });
    expect(probeMediaLedgerReadinessMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a connection when the database is not configured", async () => {
    configureLiveRuntime();
    vi.stubEnv("DATABASE_APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    const response = await healthRoute();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      checks: {
        readiness: false,
        ledger: "not_ready",
      },
      issues: expect.arrayContaining([
        "product_database_not_ready",
        "account_auth_not_ready",
        "billing_not_ready",
        "live_generation_account_auth_not_ready",
        "live_generation_billing_not_ready",
        "live_generation_ledger_not_ready",
      ]),
      databaseConfigured: false,
    });
    expect(probeMediaLedgerReadinessMock).not.toHaveBeenCalled();
    expect(probeProductDatabaseReadinessMock).not.toHaveBeenCalled();
  });

  it("reports a configured but unreachable ledger as not ready", async () => {
    configureLiveRuntime();
    vi.stubEnv(
      "DATABASE_APP_URL",
      "postgresql://runtime:secret@database.example.test/postgres",
    );
    probeMediaLedgerReadinessMock.mockResolvedValueOnce({
      status: "not_ready",
    });

    const response = await healthRoute();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      status: "degraded",
      checks: {
        readiness: false,
        ledger: "not_ready",
      },
      issues: ["live_generation_ledger_not_ready"],
      databaseConfigured: true,
    });
    expect(probeMediaLedgerReadinessMock).toHaveBeenCalledTimes(1);
    expect(probeProductDatabaseReadinessMock).toHaveBeenCalledTimes(1);
    expect(text).not.toContain("runtime:secret");
    expect(text).not.toContain("database.example.test");
  });

  it("reports the ledger ready only after the live probe succeeds", async () => {
    configureLiveRuntime();
    vi.stubEnv(
      "DATABASE_APP_URL",
      "postgresql://runtime:secret@database.example.test/postgres",
    );

    const response = await healthRoute();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: {
        readiness: true,
        ledger: "ready",
      },
      issues: [],
      databaseConfigured: true,
    });
    expect(probeMediaLedgerReadinessMock).toHaveBeenCalledTimes(1);
    expect(probeProductDatabaseReadinessMock).toHaveBeenCalledTimes(1);
  });

  it("degrades enabled product features when the product schema probe fails", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_ACCOUNT_AUTH", "true");
    vi.stubEnv(
      "DATABASE_APP_URL",
      "postgresql://runtime:secret@database.example.test/postgres",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    probeProductDatabaseReadinessMock.mockResolvedValueOnce({
      status: "not_ready",
    });

    const response = await healthRoute();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      checks: {
        readiness: false,
        productDatabase: "not_ready",
        features: { accountAuth: "not_ready" },
      },
      issues: ["product_database_not_ready", "account_auth_not_ready"],
    });
    expect(probeProductDatabaseReadinessMock).toHaveBeenCalledTimes(1);
  });

  it("requires account auth for cloud campaigns and billing", () => {
    const runtime = getServerRuntimeConfig({
      NODE_ENV: "test",
      DATABASE_APP_URL: "postgresql://runtime@example.test/postgres",
      NEXT_PUBLIC_SITE_URL: "https://ugc.example.test",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      ENABLE_CLOUD_CAMPAIGNS: "true",
      ENABLE_BILLING: "true",
      STRIPE_SECRET_KEY: "sk_test_health",
      STRIPE_WEBHOOK_SECRET: "stripe-webhook-secret",
      STRIPE_PRICE_UGC_BETA: "price_beta",
    });

    expect(runtime.product.features.cloudCampaigns).toMatchObject({
      enabled: true,
      ready: false,
      missing: ["account_auth"],
    });
    expect(runtime.product.features.billing).toMatchObject({
      enabled: true,
      ready: false,
      missing: ["account_auth"],
    });
  });
});
