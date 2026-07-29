/**
 * Server runtime configuration.
 *
 * Keep this module below `src/lib/server` and never import it from a client
 * component. The public shape intentionally contains only capability state and
 * non-secret provider settings. API keys and session secrets are never returned.
 */

import { env as nodeEnvironment } from "node:process";

export type ServerRuntimeConfig = {
  production: boolean;
  liveGeneration: boolean;
  databaseConfigured: boolean;
  newApi: {
    configured: boolean;
    rootBaseUrl: string | null;
    openAiBaseUrl: string | null;
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  access: {
    configured: boolean;
    required: boolean;
  };
  build: {
    version: string;
    commit: string | null;
    environment: string;
  };
};

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_VIDEO_MODEL = "seedance-2.0";

function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
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
  const normalizedBase = normalizeNewApiBase(envValue(env, "NEWAPI_BASE_URL"));
  const providerTransportAllowed = Boolean(
    normalizedBase &&
      (!production || normalizedBase.rootBaseUrl.startsWith("https://")),
  );
  const providerConfigured = Boolean(
    providerTransportAllowed && envValue(env, "NEWAPI_API_KEY"),
  );
  const accessCodeConfigured = Boolean(envValue(env, "STUDIO_ACCESS_CODE"));
  const sessionSecretConfigured = Boolean(envValue(env, "STUDIO_SESSION_SECRET"));

  return {
    production,
    liveGeneration: envValue(env, "ENABLE_LIVE_GENERATION")?.toLowerCase() === "true",
    databaseConfigured: Boolean(
      envValue(env, "DATABASE_URL") || envValue(env, "DATABASE_APP_URL"),
    ),
    newApi: {
      configured: providerConfigured,
      rootBaseUrl: normalizedBase?.rootBaseUrl ?? null,
      openAiBaseUrl: normalizedBase?.openAiBaseUrl ?? null,
      textModel: envValue(env, "NEWAPI_TEXT_MODEL") ?? DEFAULT_TEXT_MODEL,
      imageModel: envValue(env, "NEWAPI_IMAGE_MODEL") ?? DEFAULT_IMAGE_MODEL,
      videoModel: envValue(env, "NEWAPI_VIDEO_MODEL") ?? DEFAULT_VIDEO_MODEL,
    },
    access: {
      configured: accessCodeConfigured && sessionSecretConfigured,
      required: production || accessCodeConfigured || sessionSecretConfigured,
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
