import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DELETE as accessLogout,
  POST as accessLogin,
} from "@/app/api/auth/access/route";
import { GET as healthRoute } from "@/app/api/health/route";

import {
  MAX_JSON_REQUEST_BYTES,
  readJsonBody,
} from "./api";
import {
  MAX_REFERENCE_BYTES,
  parseImageDataUrl,
} from "./data-url";
import { getServerRuntimeConfig } from "./env";

const STRONG_ACCESS_CODE = "release-access-code";
const STRONG_SESSION_SECRET =
  "release-session-secret-with-at-least-thirty-two-bytes";

function configureProductionAccess(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STUDIO_ACCESS_CODE", STRONG_ACCESS_CODE);
  vi.stubEnv("STUDIO_SESSION_SECRET", STRONG_SESSION_SECRET);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("release runtime readiness", () => {
  it("treats weak production access credentials as not configured", () => {
    const runtime = getServerRuntimeConfig({
      NODE_ENV: "production",
      STUDIO_ACCESS_CODE: "short",
      STUDIO_SESSION_SECRET: "also-short",
    });

    expect(runtime.access).toMatchObject({
      required: true,
      configured: false,
      codeStrong: false,
      sessionSecretStrong: false,
      misconfigured: true,
    });
    expect(
      getServerRuntimeConfig({
        NODE_ENV: "test",
        DATABASE_APP_URL: "https://not-postgres.example.test/database",
      }).databaseConfigured,
    ).toBe(false);
  });

  it("reports a safe preview as ready when access is strong and live generation is off", async () => {
    configureProductionAccess();
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    vi.stubEnv("NEWAPI_BASE_URL", "");
    vi.stubEnv("NEWAPI_API_KEY", "");

    const response = await healthRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: {
        liveness: true,
        readiness: true,
        studioAccess: "ready",
        provider: "disabled",
      },
      issues: [],
      liveGeneration: false,
    });
  });

  it("returns 503 readiness when live generation has no secure provider", async () => {
    configureProductionAccess();
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "http://provider.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "server-only-provider-key");

    const response = await healthRoute();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: {
        liveness: true,
        readiness: false,
        provider: "not_ready",
        ledger: "not_ready",
      },
      providerConfigured: false,
      providerTransportSecure: false,
    });
    expect(body.issues).toEqual(
      expect.arrayContaining([
        "live_generation_provider_not_ready",
        "live_generation_ledger_not_ready",
      ]),
    );
    expect(JSON.stringify(body)).not.toContain("server-only-provider-key");
  });
});

describe("bounded JSON and image inputs", () => {
  it("rejects an announced oversized JSON body before reading it", async () => {
    const request = new Request("https://studio.example.test/api/test", {
      method: "POST",
      headers: {
        "content-length": String(MAX_JSON_REQUEST_BYTES + 1),
        "content-type": "application/json",
      },
      body: "{}",
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "request_too_large",
    });
  });

  it("stops a chunked request as soon as the aggregate limit is exceeded", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_REQUEST_BYTES + 1));
        controller.close();
      },
    });
    const request = new Request(
      "https://studio.example.test/api/test",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "request_too_large",
    });
  });

  it("rejects a single base64 reference above the release-safe byte limit", () => {
    const bytes = Buffer.alloc(MAX_REFERENCE_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;

    expect(parseImageDataUrl(dataUrl)).toBeNull();
  });
});

describe("access route request hardening", () => {
  it("rejects cross-site login and logout mutations", async () => {
    const headers = {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    };
    const login = await accessLogin(
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ code: STRONG_ACCESS_CODE }),
      }),
    );
    const logout = await accessLogout(
      new Request("https://studio.example.test/api/auth/access", {
        method: "DELETE",
        headers,
      }),
    );

    expect(login.status).toBe(403);
    expect(logout.status).toBe(403);
    expect(await login.json()).toMatchObject({
      error: { code: "cross_site_request_blocked" },
    });
  });

  it("applies a best-effort burst limit to repeated failed access codes", async () => {
    configureProductionAccess();
    const requestFor = () =>
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://studio.example.test",
          "sec-fetch-site": "same-origin",
          "x-forwarded-for": "203.0.113.77",
        },
        body: JSON.stringify({ code: "wrong-access-code" }),
      });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await accessLogin(requestFor())).status).toBe(401);
    }
    const limited = await accessLogin(requestFor());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(await limited.json()).toMatchObject({
      error: { code: "access_rate_limited", retryable: true },
    });
  });
});
