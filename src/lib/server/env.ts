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

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_VIDEO_MODEL = "seedance-2.0";
export const MIN_ACCESS_CODE_BYTES = 16;
export const MIN_SESSION_SECRET_BYTES = 32;

function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
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
    liveGeneration: envValue(env, "ENABLE_LIVE_GENERATION")?.toLowerCase() === "true",
    databaseConfigured: hasPostgresConnection(env),
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
