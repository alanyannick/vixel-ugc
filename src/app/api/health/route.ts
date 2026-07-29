import { jsonResponse } from "@/lib/server/api";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(): Promise<Response> {
  const runtimeConfig = getServerRuntimeConfig();
  return jsonResponse({
    status: "ok",
    providerConfigured: runtimeConfig.newApi.configured,
    liveGeneration: runtimeConfig.liveGeneration,
    databaseConfigured: runtimeConfig.databaseConfigured,
    build: runtimeConfig.build,
  });
}

