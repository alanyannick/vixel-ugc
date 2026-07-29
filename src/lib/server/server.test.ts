import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSessionToken,
  getAccessState,
  STUDIO_SESSION_COOKIE,
  verifySessionToken,
} from "./auth";
import { generateCreativeBrief } from "./creative";
import { getServerRuntimeConfig, normalizeNewApiBase } from "./env";
import {
  imageGenerationRequestSchema,
  requireLiveGeneration,
  videoGenerationRequestSchema,
} from "./media";
import {
  extractVideoTaskId,
  generateNewApiImage,
  isSafeVideoTaskId,
  normalizeImageProviderResponse,
  normalizeVideoProviderResponse,
  ProviderRequestError,
  submitNewApiVideo,
} from "./provider";

import {
  GET as accessStatus,
  POST as accessLogin,
} from "@/app/api/auth/access/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { POST as imageRoute } from "@/app/api/media/image/route";

const PNG_BASE64 = "iVBORw0KGgo=";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function stubProviderEnvironment() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1/");
  vi.stubEnv("NEWAPI_API_KEY", "unit-test-provider-key");
  vi.stubEnv("NEWAPI_IMAGE_MODEL", "newapi:gpt-image-2-customtools");
  vi.stubEnv("NEWAPI_VIDEO_MODEL", "dreamina-seedance-2-0-260128");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server environment", () => {
  it("normalizes a NewAPI root without duplicating /v1", () => {
    expect(
      normalizeNewApiBase("https://gateway.example.test/api/v1/"),
    ).toEqual({
      rootBaseUrl: "https://gateway.example.test/api",
      openAiBaseUrl: "https://gateway.example.test/api/v1",
    });
    expect(normalizeNewApiBase("file:///tmp/gateway")).toBeNull();
    expect(
      normalizeNewApiBase("https://user:pass@gateway.example.test/v1"),
    ).toBeNull();
  });

  it("reports missing credentials without returning the key", () => {
    const config = getServerRuntimeConfig({
      NODE_ENV: "production",
      NEWAPI_BASE_URL: "https://gateway.example.test/v1",
      NEWAPI_API_KEY: "never-serialize-this-key",
    });
    expect(config.newApi.configured).toBe(true);
    expect(JSON.stringify(config)).not.toContain("never-serialize-this-key");

    const missingKey = getServerRuntimeConfig({
      NODE_ENV: "test",
      NEWAPI_BASE_URL: "https://gateway.example.test/v1",
    });
    expect(missingKey.newApi.configured).toBe(false);

    const insecureProduction = getServerRuntimeConfig({
      NODE_ENV: "production",
      NEWAPI_BASE_URL: "http://gateway.example.test/v1",
      NEWAPI_API_KEY: "not-returned",
    });
    expect(insecureProduction.newApi.configured).toBe(false);
  });

  it("serves a secret-free health capability snapshot", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEWAPI_BASE_URL", "https://gateway.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "health-route-secret");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("DATABASE_APP_URL", "postgres://not-used-by-this-test");
    const response = await healthRoute();
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("health-route-secret");
    expect(JSON.parse(text)).toMatchObject({
      providerConfigured: true,
      liveGeneration: true,
      databaseConfigured: true,
      build: { environment: "production" },
    });
  });
});

describe("access-code session", () => {
  it("creates and verifies an HMAC session without exposing the secret", () => {
    vi.stubEnv("STUDIO_SESSION_SECRET", "unit-test-session-secret");
    const token = createSessionToken(1_800_000_000_000);
    expect(token).toBeTruthy();
    expect(token).not.toContain("unit-test-session-secret");
    expect(verifySessionToken(token, 1_800_000_000_000)).toBe(true);
    expect(verifySessionToken(`${token}tampered`, 1_800_000_000_000)).toBe(
      false,
    );
  });

  it("fails closed in production when access configuration is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "");
    vi.stubEnv("STUDIO_SESSION_SECRET", "");
    const state = getAccessState(
      new Request("https://studio.example.test/api/auth/access"),
    );
    expect(state).toMatchObject({
      allowed: false,
      reason: "not_configured",
    });
  });

  it("rejects a wrong code and accepts the right code with an HttpOnly cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "test-access-code");
    vi.stubEnv("STUDIO_SESSION_SECRET", "test-session-secret-long-enough");

    const rejected = await accessLogin(
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "wrong-code" }),
      }),
    );
    expect(rejected.status).toBe(401);
    expect(await rejected.text()).not.toContain("test-access-code");

    const accepted = await accessLogin(
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "test-access-code" }),
      }),
    );
    expect(accepted.status).toBe(200);
    const setCookie = accepted.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");

    const cookiePair = setCookie.split(";")[0];
    const status = await accessStatus(
      new Request("https://studio.example.test/api/auth/access", {
        headers: { cookie: cookiePair },
      }),
    );
    expect(await status.json()).toMatchObject({
      authenticated: true,
      required: true,
      configured: true,
    });
    expect(cookiePair.startsWith(`${STUDIO_SESSION_COOKIE}=`)).toBe(true);
  });
});

describe("creative fallback", () => {
  it("is deterministic, disclosed, and always returns five hooks and three personas", async () => {
    vi.stubEnv("NEWAPI_BASE_URL", "");
    vi.stubEnv("NEWAPI_API_KEY", "");
    const input = {
      productName: "Source Bottle",
      facts: ["Made from stainless steel."],
      audience: "commuters",
      platform: "TikTok",
      goal: "product consideration",
      language: "English",
    };
    const first = await generateCreativeBrief(input, "request-one");
    const second = await generateCreativeBrief(input, "request-two");

    expect(first.provider).toBe("fallback");
    expect(first.brief.hooks).toHaveLength(5);
    expect(first.brief.personas).toHaveLength(3);
    expect(first.brief.productTruth).toEqual(input.facts);
    expect(first.groundingWarnings.length).toBeGreaterThan(0);
    expect(first.brief).toEqual(second.brief);
  });
});

describe("image provider", () => {
  it("rejects arbitrary reference URLs before provider IO", () => {
    const parsed = imageGenerationRequestSchema.safeParse({
      prompt: "Keep the product centered.",
      references: [{ url: "http://127.0.0.1/private.png" }],
    });
    expect(parsed.success).toBe(false);
    expect(
      videoGenerationRequestSchema.safeParse({
        prompt: "Animate the product.",
        image: "http://169.254.169.254/latest/meta-data",
      }).success,
    ).toBe(false);
  });

  it("normalizes base64 and URL provider responses", () => {
    expect(
      normalizeImageProviderResponse({
        data: [{ b64_json: PNG_BASE64 }],
      }),
    ).toEqual({
      type: "data_url",
      dataUrl: PNG_DATA_URL,
      url: PNG_DATA_URL,
      mimeType: "image/png",
    });
    expect(
      normalizeImageProviderResponse({
        data: [{ url: "https://cdn.example.test/result.png" }],
      }),
    ).toEqual({
      type: "url",
      url: "https://cdn.example.test/result.png",
      mimeType: null,
    });
  });

  it("retries one transient response and forwards the idempotency key", async () => {
    stubProviderEnvironment();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":"temporary"}', { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const generated = await generateNewApiImage({
      prompt: "A clean product still life.",
      size: "1024x1024",
      references: [],
      idempotencyKey: "image:test-retry-key",
      fetchImpl: fetchMock,
      retryDelayMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(generated.attempts).toBe(2);
    expect(generated.model).toBe("gpt-image-2");
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "image:test-retry-key",
    );
  });

  it("uses multipart edits for uploaded references and caps them at four", async () => {
    stubProviderEnvironment();
    expect(
      imageGenerationRequestSchema.safeParse({
        prompt: "Edit the composition.",
        references: Array.from({ length: 5 }, () => ({
          dataUrl: PNG_DATA_URL,
        })),
      }).success,
    ).toBe(false);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), {
        status: 200,
      }),
    );
    const generated = await generateNewApiImage({
      prompt: "Edit the composition.",
      size: "1024x1024",
      references: [
        {
          mimeType: "image/png",
          bytes: new Uint8Array(Buffer.from(PNG_BASE64, "base64")),
        },
      ],
      idempotencyKey: "image:edit-reference-key",
      fetchImpl: fetchMock,
      retryDelayMs: 0,
    });
    expect(generated.mode).toBe("edit");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://newapi.example.test/v1/images/edits",
    );
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("does not expose a provider error body or key", async () => {
    stubProviderEnvironment();
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    const providerSecret = "provider-response-secret-value";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: `${providerSecret} unit-test-provider-key`,
          }),
          { status: 400 },
        ),
      );
    const response = await imageRoute(
      new Request("https://studio.example.test/api/media/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "A clean product still life.",
          references: [],
        }),
      }),
    );
    const responseText = await response.text();
    expect(response.status).toBe(502);
    expect(responseText).not.toContain(providerSecret);
    expect(responseText).not.toContain("unit-test-provider-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails before fetch when the provider key is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await imageRoute(
      new Request("https://studio.example.test/api/media/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "A product frame." }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "provider_not_configured", retryable: false },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires both authentication and the live flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected");
    vi.stubEnv("STUDIO_SESSION_SECRET", "protected-session-secret");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "provider-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await imageRoute(
      new Request("https://studio.example.test/api/media/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "A product frame." }),
      }),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "");
    vi.stubEnv("STUDIO_SESSION_SECRET", "");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    expect(requireLiveGeneration("request-id")?.status).toBe(503);
  });
});

describe("video provider", () => {
  it("extracts documented nested task IDs and rejects unsafe IDs", () => {
    expect(
      extractVideoTaskId({
        code: "success",
        data: { task_id: "task_ABC-123" },
      }),
    ).toBe("task_ABC-123");
    expect(extractVideoTaskId({ data: { task_id: "../metadata" } })).toBeNull();
    expect(isSafeVideoTaskId("task_ABC-123")).toBe(true);
    expect(isSafeVideoTaskId("../metadata")).toBe(false);
  });

  it("normalizes video status, progress, and result URL", () => {
    expect(
      normalizeVideoProviderResponse({
        data: [{
          task_id: "task_video_123",
          status: "SUCCESS",
          progress: "100%",
          result_url: "https://cdn.example.test/video.mp4",
        }],
      }),
    ).toEqual({
      taskId: "task_video_123",
      status: "succeeded",
      progress: 100,
      url: "https://cdn.example.test/video.mp4",
      error: null,
    });
  });

  it("submits once and forwards a stable idempotency key", async () => {
    stubProviderEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { task_id: "task_submit_123", status: "queued" },
        }),
        { status: 200 },
      ),
    );
    const submitted = await submitNewApiVideo({
      prompt: "A restrained camera push.",
      imageDataUrl: PNG_DATA_URL,
      durationSec: 5,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: false,
      idempotencyKey: "video:stable-submit-key",
      fetchImpl: fetchMock,
    });
    expect(submitted.result.taskId).toBe("task_submit_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://newapi.example.test/v1/video/generations",
    );
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "video:stable-submit-key",
    );
  });

  it("uses a sanitized error for rejected video submissions", async () => {
    stubProviderEnvironment();
    const hidden = "hidden-provider-diagnostic";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: hidden }), { status: 500 }),
    );
    const error = await submitNewApiVideo({
      prompt: "A restrained camera push.",
      durationSec: 5,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: false,
      idempotencyKey: "video:sanitized-error",
      fetchImpl: fetchMock,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(String((error as Error).message)).not.toContain(hidden);
  });
});
