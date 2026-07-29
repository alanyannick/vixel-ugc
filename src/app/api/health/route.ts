import { jsonResponse } from "@/lib/server/api";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const runtimeConfig = getServerRuntimeConfig();
  const issues: string[] = [];

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
    !runtimeConfig.databaseConfigured
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
          ? "ready"
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
    { status: ready ? 200 : 503 },
  );
}
