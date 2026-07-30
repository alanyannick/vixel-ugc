import { jsonResponse } from "@/lib/server/api";
import { probeMediaLedgerReadiness } from "@/lib/server/database-readiness";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const runtimeConfig = getServerRuntimeConfig();
  const issues: string[] = [];
  const ledgerReadiness =
    runtimeConfig.databaseConfigured
      ? await probeMediaLedgerReadiness()
      : null;

  if (runtimeConfig.access.required && !runtimeConfig.access.configured) {
    issues.push("studio_access_not_ready");
  }
  if (
    runtimeConfig.liveGeneration &&
    !runtimeConfig.newApi.configured
  ) {
    issues.push("live_generation_provider_not_ready");
  }
  if (
    runtimeConfig.liveGeneration &&
    (
      !runtimeConfig.databaseConfigured ||
      ledgerReadiness?.status !== "ready"
    )
  ) {
    issues.push("live_generation_ledger_not_ready");
  }

  const ready = issues.length === 0;
  return jsonResponse(
    {
      status: ready ? "ok" : "degraded",
      checks: {
        liveness: true,
        readiness: ready,
        studioAccess: runtimeConfig.access.configured
          ? "ready"
          : runtimeConfig.access.required
            ? "not_ready"
            : "not_required",
        provider: runtimeConfig.newApi.configured
          ? "ready"
          : runtimeConfig.liveGeneration
            ? "not_ready"
            : "disabled",
        ledger: runtimeConfig.databaseConfigured
          ? ledgerReadiness?.status === "ready"
            ? "ready"
            : "not_ready"
          : runtimeConfig.liveGeneration
            ? "not_ready"
            : "not_required",
      },
      issues,
      providerConfigured: runtimeConfig.newApi.configured,
      providerTransportSecure: runtimeConfig.newApi.transportSecure,
      liveGeneration: runtimeConfig.liveGeneration,
      databaseConfigured: runtimeConfig.databaseConfigured,
      build: runtimeConfig.build,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "cdn-cache-control": "s-maxage=15, stale-while-revalidate=30",
        "vercel-cdn-cache-control":
          "s-maxage=15, stale-while-revalidate=30",
      },
    },
  );
}
