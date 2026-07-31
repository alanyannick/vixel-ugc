import { jsonResponse } from "@/lib/server/api";
import { probeMediaLedgerReadiness } from "@/lib/server/database-readiness";
import { getServerRuntimeConfig } from "@/lib/server/env";
import { probeProductDatabaseReadiness } from "@/lib/server/product-db";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FEATURE_ISSUES = {
  waitlist: "waitlist_not_ready",
  accountAuth: "account_auth_not_ready",
  cloudCampaigns: "cloud_campaigns_not_ready",
  lifecycleEmail: "lifecycle_email_not_ready",
  billing: "billing_not_ready",
} as const;

export async function GET(): Promise<Response> {
  const runtimeConfig = getServerRuntimeConfig();
  const issues: string[] = [];
  const productFeatures = runtimeConfig.product.features;
  const productDatabaseRequired = Object.values(productFeatures).some(
    (feature) => feature.enabled,
  );
  const [ledgerReadiness, productDatabaseReadiness] = await Promise.all([
    runtimeConfig.databaseConfigured
      ? probeMediaLedgerReadiness()
      : Promise.resolve(null),
    productDatabaseRequired && runtimeConfig.databaseConfigured
      ? probeProductDatabaseReadiness()
      : Promise.resolve(null),
  ]);
  const productDatabaseReady =
    productDatabaseReadiness?.status === "ready";
  const featureChecks = Object.fromEntries(
    Object.entries(productFeatures).map(([name, feature]) => [
      name,
      feature.enabled
        ? feature.ready && productDatabaseReady
          ? "ready"
          : "not_ready"
        : "disabled",
    ]),
  ) as Record<keyof typeof productFeatures, "ready" | "not_ready" | "disabled">;

  if (runtimeConfig.access.required && !runtimeConfig.access.configured) {
    issues.push("studio_access_not_ready");
  }
  if (productDatabaseRequired && !productDatabaseReady) {
    issues.push("product_database_not_ready");
  }
  for (const name of Object.keys(productFeatures) as Array<
    keyof typeof productFeatures
  >) {
    if (featureChecks[name] === "not_ready") {
      issues.push(FEATURE_ISSUES[name]);
    }
  }
  if (
    runtimeConfig.liveGeneration &&
    featureChecks.accountAuth !== "ready"
  ) {
    issues.push("live_generation_account_auth_not_ready");
  }
  if (
    runtimeConfig.liveGeneration &&
    featureChecks.billing !== "ready"
  ) {
    issues.push("live_generation_billing_not_ready");
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

  const liveGenerationReady =
    runtimeConfig.liveGeneration &&
    featureChecks.accountAuth === "ready" &&
    featureChecks.billing === "ready" &&
    runtimeConfig.newApi.configured &&
    ledgerReadiness?.status === "ready";

  const ready = issues.length === 0;
  return jsonResponse(
    {
      status: ready ? "ok" : "degraded",
      checks: {
        liveness: true,
        readiness: ready,
        features: featureChecks,
        productDatabase: productDatabaseRequired
          ? productDatabaseReady
            ? "ready"
            : "not_ready"
          : "not_required",
        liveGeneration: runtimeConfig.liveGeneration
          ? liveGenerationReady
            ? "ready"
            : "not_ready"
          : "disabled",
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
