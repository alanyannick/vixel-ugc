/**
 * Server runtime configuration.
 *
 * Keep this module below `src/lib/server` and never import it from a client
 * component. The public shape intentionally contains only capability state and
 * non-secret provider settings. API keys and session secrets are never returned.
 */

import { env as nodeEnvironment } from "node:process";
import { Buffer } from "node:buffer";

export type ServerRuntimeConfig = {
  production: boolean;
  liveGeneration: boolean;
  databaseConfigured: boolean;
  product: {
    siteUrl: string | null;
    supabase: {
      configured: boolean;
      url: string | null;
      publishableKeyConfigured: boolean;
      secretKeyConfigured: boolean;
    };
    turnstile: {
      configured: boolean;
      siteKey: string | null;
      secretKeyConfigured: boolean;
    };
    resend: {
      configured: boolean;
      webhookConfigured: boolean;
    };
    stripe: {
      configured: boolean;
      webhookConfigured: boolean;
      priceConfigured: boolean;
    };
    features: {
      waitlist: FeatureReadiness;
      accountAuth: FeatureReadiness;
      cloudCampaigns: FeatureReadiness;
      lifecycleEmail: FeatureReadiness;
      billing: FeatureReadiness;
    };
  };
  newApi: {
    configured: boolean;
    transportSecure: boolean;
    rootBaseUrl: string | null;
    openAiBaseUrl: string | null;
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  access: {
    configured: boolean;
    required: boolean;
    codeStrong: boolean;
    sessionSecretStrong: boolean;
    misconfigured: boolean;
  };
  build: {
    version: string;
    commit: string | null;
    environment: string;
  };
};

export type FeatureReadiness = {
  enabled: boolean;
  ready: boolean;
  missing: string[];
};

export type PublicProductConfig = {
  siteUrl: string | null;
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  turnstileSiteKey: string | null;
};

const DEFAULT_TEXT_MODEL = "gpt-5.4-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-preview";
export const MIN_ACCESS_CODE_BYTES = 16;
export const MIN_SESSION_SECRET_BYTES = 32;

export function envValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function enabled(env: NodeJS.ProcessEnv, name: string): boolean {
  return envValue(env, name)?.toLowerCase() === "true";
}

function validHttpUrl(
  value: string | null,
  production: boolean,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (production && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function featureReadiness(
  featureEnabled: boolean,
  requirements: Array<[configured: boolean, name: string]>,
): FeatureReadiness {
  const missing = requirements
    .filter(([configured]) => !configured)
    .map(([, name]) => name);
  return {
    enabled: featureEnabled,
    ready: featureEnabled && missing.length === 0,
    missing,
  };
}

function hasMinimumBytes(value: string | null, minimum: number): boolean {
  return Boolean(value && Buffer.byteLength(value, "utf8") >= minimum);
}

function hasPostgresConnection(env: NodeJS.ProcessEnv): boolean {
  const value =
    envValue(env, "DATABASE_APP_URL") ?? envValue(env, "DATABASE_URL");
  if (!value) return false;
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function normalizeNewApiBase(
  configuredBase: string | null | undefined,
): { rootBaseUrl: string; openAiBaseUrl: string } | null {
  const raw = configuredBase?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  const segments = url.pathname
    .split("/")
    .filter(Boolean);
  if (segments.at(-1)?.toLowerCase() === "v1") segments.pop();
  url.pathname = segments.length ? `/${segments.join("/")}` : "";

  const rootBaseUrl = url.toString().replace(/\/+$/, "");
  return {
    rootBaseUrl,
    openAiBaseUrl: `${rootBaseUrl}/v1`,
  };
}

export function getServerRuntimeConfig(
  env: NodeJS.ProcessEnv = nodeEnvironment,
): ServerRuntimeConfig {
  const production = env.NODE_ENV === "production";
  const databaseConfigured = hasPostgresConnection(env);
  const siteUrl = validHttpUrl(
    envValue(env, "NEXT_PUBLIC_SITE_URL"),
    production,
  );
  const supabaseUrl = validHttpUrl(
    envValue(env, "NEXT_PUBLIC_SUPABASE_URL"),
    production,
  );
  const supabasePublishableKey = envValue(
    env,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const supabaseSecretKey = envValue(env, "SUPABASE_SECRET_KEY");
  const turnstileSiteKey = envValue(
    env,
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  );
  const turnstileSecretKey = envValue(env, "TURNSTILE_SECRET_KEY");
  const resendApiKey = envValue(env, "RESEND_API_KEY");
  const resendFrom = envValue(env, "RESEND_TRANSACTIONAL_FROM");
  const resendWebhookSecret = envValue(env, "RESEND_WEBHOOK_SECRET");
  const stripeSecret = envValue(env, "STRIPE_SECRET_KEY");
  const stripeWebhookSecret = envValue(env, "STRIPE_WEBHOOK_SECRET");
  const stripePrice = envValue(env, "STRIPE_PRICE_UGC_BETA");
  const cronSecret = envValue(env, "CRON_SECRET");
  const supabaseConfigured = Boolean(
    supabaseUrl && supabasePublishableKey && supabaseSecretKey,
  );
  const turnstileConfigured = Boolean(
    turnstileSiteKey && turnstileSecretKey,
  );
  const resendConfigured = Boolean(resendApiKey && resendFrom);
  const stripeConfigured = Boolean(stripeSecret && siteUrl);
  const normalizedBase = normalizeNewApiBase(envValue(env, "NEWAPI_BASE_URL"));
  const providerTransportSecure = Boolean(
    normalizedBase?.rootBaseUrl.startsWith("https://"),
  );
  const providerTransportAllowed = Boolean(
    normalizedBase && (!production || providerTransportSecure),
  );
  const providerConfigured = Boolean(
    providerTransportAllowed && envValue(env, "NEWAPI_API_KEY"),
  );
  const accessCode = envValue(env, "STUDIO_ACCESS_CODE");
  const sessionSecret = envValue(env, "STUDIO_SESSION_SECRET");
  const accessCodePresent = Boolean(accessCode);
  const sessionSecretPresent = Boolean(sessionSecret);
  const codeStrong = hasMinimumBytes(accessCode, MIN_ACCESS_CODE_BYTES);
  const sessionSecretStrong = hasMinimumBytes(
    sessionSecret,
    MIN_SESSION_SECRET_BYTES,
  );
  const accessRequired =
    production || accessCodePresent || sessionSecretPresent;
  const accessConfigured = codeStrong && sessionSecretStrong;

  return {
    production,
    liveGeneration: enabled(env, "ENABLE_LIVE_GENERATION"),
    databaseConfigured,
    product: {
      siteUrl,
      supabase: {
        configured: supabaseConfigured,
        url: supabaseUrl,
        publishableKeyConfigured: Boolean(supabasePublishableKey),
        secretKeyConfigured: Boolean(supabaseSecretKey),
      },
      turnstile: {
        configured: turnstileConfigured,
        siteKey: turnstileSiteKey,
        secretKeyConfigured: Boolean(turnstileSecretKey),
      },
      resend: {
        configured: resendConfigured,
        webhookConfigured: Boolean(resendWebhookSecret),
      },
      stripe: {
        configured: stripeConfigured,
        webhookConfigured: Boolean(stripeWebhookSecret),
        priceConfigured: Boolean(stripePrice),
      },
      features: {
        waitlist: featureReadiness(
          enabled(env, "ENABLE_PUBLIC_WAITLIST"),
          [
            [databaseConfigured, "database"],
            [!production || turnstileConfigured, "turnstile"],
          ],
        ),
        accountAuth: featureReadiness(
          enabled(env, "ENABLE_ACCOUNT_AUTH"),
          [
            [databaseConfigured, "database"],
            [supabaseConfigured, "supabase"],
            [!production || turnstileConfigured, "turnstile"],
          ],
        ),
        cloudCampaigns: featureReadiness(
          enabled(env, "ENABLE_CLOUD_CAMPAIGNS"),
          [
            [databaseConfigured, "database"],
            [supabaseConfigured, "supabase"],
          ],
        ),
        lifecycleEmail: featureReadiness(
          enabled(env, "ENABLE_LIFECYCLE_EMAIL"),
          [
            [databaseConfigured, "database"],
            [resendConfigured, "resend"],
            [Boolean(cronSecret), "cron"],
          ],
        ),
        billing: featureReadiness(
          enabled(env, "ENABLE_BILLING"),
          [
            [databaseConfigured, "database"],
            [stripeConfigured, "stripe"],
            [Boolean(stripeWebhookSecret), "stripe_webhook"],
            [Boolean(stripePrice), "stripe_price"],
          ],
        ),
      },
    },
    newApi: {
      configured: providerConfigured,
      transportSecure: providerTransportSecure,
      rootBaseUrl: normalizedBase?.rootBaseUrl ?? null,
      openAiBaseUrl: normalizedBase?.openAiBaseUrl ?? null,
      textModel: envValue(env, "NEWAPI_TEXT_MODEL") ?? DEFAULT_TEXT_MODEL,
      imageModel: envValue(env, "NEWAPI_IMAGE_MODEL") ?? DEFAULT_IMAGE_MODEL,
      videoModel: envValue(env, "NEWAPI_VIDEO_MODEL") ?? DEFAULT_VIDEO_MODEL,
    },
    access: {
      configured: accessConfigured,
      required: accessRequired,
      codeStrong,
      sessionSecretStrong,
      misconfigured: accessRequired && !accessConfigured,
    },
    build: {
      version: envValue(env, "npm_package_version") ?? "0.1.0",
      commit:
        envValue(env, "VERCEL_GIT_COMMIT_SHA") ??
        envValue(env, "GIT_COMMIT_SHA") ??
        null,
      environment:
        envValue(env, "VERCEL_ENV") ??
        envValue(env, "NODE_ENV") ??
        "development",
    },
  };
}

export function getPublicProductConfig(
  env: NodeJS.ProcessEnv = nodeEnvironment,
): PublicProductConfig {
  const config = getServerRuntimeConfig(env);
  return {
    siteUrl: config.product.siteUrl,
    supabaseUrl: config.product.supabase.url,
    supabasePublishableKey:
      envValue(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    turnstileSiteKey: config.product.turnstile.siteKey,
  };
}
