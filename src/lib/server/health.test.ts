import { beforeEach, describe, expect, it, vi } from "vitest";

const { probeMediaLedgerReadinessMock } = vi.hoisted(() => ({
  probeMediaLedgerReadinessMock: vi.fn(),
}));

vi.mock("@/lib/server/database-readiness", () => ({
  probeMediaLedgerReadiness: probeMediaLedgerReadinessMock,
}));

import { GET as healthRoute } from "@/app/api/health/route";

function configureLiveRuntime(): void {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
  vi.stubEnv("NEWAPI_BASE_URL", "https://gateway.example.test/v1");
  vi.stubEnv("NEWAPI_API_KEY", "server-only-provider-key");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  probeMediaLedgerReadinessMock.mockReset();
  probeMediaLedgerReadinessMock.mockResolvedValue({ status: "ready" });
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
      issues: ["live_generation_ledger_not_ready"],
      databaseConfigured: false,
    });
    expect(probeMediaLedgerReadinessMock).not.toHaveBeenCalled();
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
  });
});
