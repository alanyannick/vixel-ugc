import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/database-readiness", () => ({
  probeMediaLedgerReadiness: vi.fn(async () => ({ status: "ready" })),
}));

vi.mock("@/lib/server/billing", () => ({
  requirePaidGenerationAccess: vi.fn(async () => null),
}));

import {
  createSessionToken,
  getAccessState,
  getStudioSessionIdentity,
  STUDIO_IDENTITY_COOKIE,
  STUDIO_IDENTITY_TTL_SECONDS,
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_TTL_SECONDS,
  verifySessionToken,
} from "./auth";
import {
  approvalFingerprint,
  issueMediaApproval,
  verifyMediaApproval,
} from "./approval";
import { generateCreativeBrief } from "./creative";
import { getServerRuntimeConfig, normalizeNewApiBase } from "./env";
import { paidControlPlaneReadiness } from "./ledger";
import {
  imageGenerationRequestSchema,
  requireLiveGeneration,
  videoGenerationRequestSchema,
} from "./media";
import { publicLedgerEntry } from "./ledger";
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
  DELETE as accessLogout,
  GET as accessStatus,
  POST as accessLogin,
} from "@/app/api/auth/access/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { POST as approvalRoute } from "@/app/api/media/approval/route";
import { POST as imageRoute } from "@/app/api/media/image/route";
import { GET as mediaJobsRoute } from "@/app/api/media/jobs/route";

const PNG_BASE64 = "iVBORw0KGgo=";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function setCookieValues(response: Response): string[] {
  return response.headers.getSetCookie();
}

function responseCookiePair(response: Response, name: string): string {
  const cookie = setCookieValues(response).find((value) =>
    value.startsWith(`${name}=`),
  );
  expect(cookie).toBeTruthy();
  return cookie!.split(";", 1)[0];
}

function requestCookies(...pairs: string[]): { cookie: string } {
  return { cookie: pairs.join("; ") };
}

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

  it("uses the canary-proven NewAPI models when overrides are absent", () => {
    const config = getServerRuntimeConfig({
      NODE_ENV: "production",
      NEWAPI_BASE_URL: "https://gateway.example.test/v1",
      NEWAPI_API_KEY: "not-returned",
    });

    expect(config.newApi).toMatchObject({
      textModel: "gpt-5.4-mini",
      imageModel: "gpt-image-2",
      videoModel: "veo-3.1-fast-generate-preview",
    });
  });

  it("serves a secret-free health capability snapshot", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEWAPI_BASE_URL", "https://gateway.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "health-route-secret");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("DATABASE_APP_URL", "postgres://not-used-by-this-test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "health-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "health-session-secret-long-enough-for-production",
    );
    const response = await healthRoute();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).not.toContain("health-route-secret");
    expect(JSON.parse(text)).toMatchObject({
      providerConfigured: true,
      liveGeneration: true,
      databaseConfigured: true,
      checks: {
        liveGeneration: "not_ready",
        provider: "configured",
      },
      issues: [
        "live_generation_account_auth_not_ready",
        "live_generation_billing_not_ready",
      ],
      build: { environment: "production" },
    });
  });
});

describe("access-code session", () => {
  it("creates and verifies an HMAC session without exposing the secret", () => {
    vi.stubEnv("STUDIO_SESSION_SECRET", "unit-test-session-secret");
    const token = createSessionToken(1_800_000_000_000);
    expect(token).toBeTruthy();
    expect(token).toMatch(/^v2\./);
    expect(token).not.toContain("unit-test-session-secret");
    expect(verifySessionToken(token, 1_800_000_000_000)).toBe(true);
    expect(verifySessionToken(`${token}tampered`, 1_800_000_000_000)).toBe(
      false,
    );
    expect(
      verifySessionToken(token!.replace(/^v2\./, "v3."), 1_800_000_000_000),
    ).toBe(false);
    expect(verifySessionToken("v2." + "x".repeat(600))).toBe(false);
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

  it("rejects a wrong code and accepts the right code with hardened cookies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "test-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "test-session-secret-long-enough-for-production",
    );

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
    const setCookies = setCookieValues(accepted);
    expect(setCookies).toHaveLength(2);
    for (const cookie of setCookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Secure");
      expect(cookie).not.toContain("test-access-code");
      expect(cookie).not.toContain(
        "test-session-secret-long-enough-for-production",
      );
    }
    expect(
      setCookies.find((cookie) =>
        cookie.startsWith(`${STUDIO_IDENTITY_COOKIE}=`),
      ),
    ).toContain(`Max-Age=${STUDIO_IDENTITY_TTL_SECONDS}`);

    const sessionPair = responseCookiePair(accepted, STUDIO_SESSION_COOKIE);
    const identityPair = responseCookiePair(accepted, STUDIO_IDENTITY_COOKIE);
    const status = await accessStatus(
      new Request("https://studio.example.test/api/auth/access", {
        headers: requestCookies(sessionPair, identityPair),
      }),
    );
    expect(await status.json()).toMatchObject({
      authenticated: true,
      required: true,
      configured: true,
    });
    expect(sessionPair.startsWith(`${STUDIO_SESSION_COOKIE}=`)).toBe(true);
  });

  it("keeps the same recovery owner across logout and re-login", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "durable-test-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "durable-session-secret-long-enough-for-production",
    );
    const loginRequest = (cookie?: string) =>
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ code: "durable-test-access-code" }),
      });

    const firstLogin = await accessLogin(loginRequest());
    const firstSession = responseCookiePair(
      firstLogin,
      STUDIO_SESSION_COOKIE,
    );
    const recoveryIdentity = responseCookiePair(
      firstLogin,
      STUDIO_IDENTITY_COOKIE,
    );
    const firstOwner = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(firstSession, recoveryIdentity),
      }),
    );

    const logout = await accessLogout(
      new Request("https://studio.example.test/api/auth/access", {
        method: "DELETE",
        headers: requestCookies(firstSession, recoveryIdentity),
      }),
    );
    const logoutCookies = setCookieValues(logout);
    expect(logoutCookies).toHaveLength(1);
    expect(logoutCookies[0]).toMatch(
      new RegExp(`^${STUDIO_SESSION_COOKIE}=.*Max-Age=0`),
    );
    expect(logoutCookies[0]).not.toContain(STUDIO_IDENTITY_COOKIE);

    const secondLogin = await accessLogin(loginRequest(recoveryIdentity));
    expect(
      setCookieValues(secondLogin).some((cookie) =>
        cookie.startsWith(`${STUDIO_IDENTITY_COOKIE}=`),
      ),
    ).toBe(false);
    const secondSession = responseCookiePair(
      secondLogin,
      STUDIO_SESSION_COOKIE,
    );
    const secondOwner = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(secondSession, recoveryIdentity),
      }),
    );
    expect(firstOwner).toMatch(/^[a-f0-9]{64}$/);
    expect(secondOwner).toBe(firstOwner);
  });

  it("assigns different owners to different browsers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "browser-test-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "browser-session-secret-long-enough-for-production",
    );
    const loginRequest = () =>
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "browser-test-access-code" }),
      });

    const browserA = await accessLogin(loginRequest());
    const browserB = await accessLogin(loginRequest());
    const ownerFor = (response: Response) =>
      getStudioSessionIdentity(
        new Request("https://studio.example.test/studio", {
          headers: requestCookies(
            responseCookiePair(response, STUDIO_SESSION_COOKIE),
            responseCookiePair(response, STUDIO_IDENTITY_COOKIE),
          ),
        }),
      );
    expect(ownerFor(browserA)).toMatch(/^[a-f0-9]{64}$/);
    expect(ownerFor(browserB)).not.toBe(ownerFor(browserA));
  });

  it("repairs a mismatched recovery identity from the active signed session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "mismatch-test-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "mismatch-session-secret-long-enough-for-production",
    );
    const loginRequest = (cookie?: string) =>
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ code: "mismatch-test-access-code" }),
      });

    const browserA = await accessLogin(loginRequest());
    const browserB = await accessLogin(loginRequest());
    const sessionA = responseCookiePair(
      browserA,
      STUDIO_SESSION_COOKIE,
    );
    const identityA = responseCookiePair(
      browserA,
      STUDIO_IDENTITY_COOKIE,
    );
    const identityB = responseCookiePair(
      browserB,
      STUDIO_IDENTITY_COOKIE,
    );
    const ownerA = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(sessionA, identityA),
      }),
    );

    const repairedStatus = await accessStatus(
      new Request("https://studio.example.test/api/auth/access", {
        headers: requestCookies(sessionA, identityB),
      }),
    );
    const repairedIdentity = responseCookiePair(
      repairedStatus,
      STUDIO_IDENTITY_COOKIE,
    );
    expect(
      getStudioSessionIdentity(
        new Request("https://studio.example.test/studio", {
          headers: requestCookies(sessionA, repairedIdentity),
        }),
      ),
    ).toBe(ownerA);

    const relogin = await accessLogin(
      loginRequest(requestCookies(sessionA, identityB).cookie),
    );
    const repairedSession = responseCookiePair(
      relogin,
      STUDIO_SESSION_COOKIE,
    );
    const reloginIdentity = responseCookiePair(
      relogin,
      STUDIO_IDENTITY_COOKIE,
    );
    expect(
      getStudioSessionIdentity(
        new Request("https://studio.example.test/studio", {
          headers: requestCookies(repairedSession, reloginIdentity),
        }),
      ),
    ).toBe(ownerA);
  });

  it("rejects a tampered recovery identity instead of trusting its subject", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "tamper-test-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "tamper-session-secret-long-enough-for-production",
    );
    const loginRequest = (cookie?: string) =>
      new Request("https://studio.example.test/api/auth/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ code: "tamper-test-access-code" }),
      });

    const original = await accessLogin(loginRequest());
    const originalOwner = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(
          responseCookiePair(original, STUDIO_SESSION_COOKIE),
          responseCookiePair(original, STUDIO_IDENTITY_COOKIE),
        ),
      }),
    );
    const originalIdentity = responseCookiePair(
      original,
      STUDIO_IDENTITY_COOKIE,
    );
    const lastCharacter = originalIdentity.at(-1);
    const tamperedIdentity = `${originalIdentity.slice(0, -1)}${
      lastCharacter === "A" ? "B" : "A"
    }`;

    const afterTamper = await accessLogin(loginRequest(tamperedIdentity));
    const replacementIdentity = responseCookiePair(
      afterTamper,
      STUDIO_IDENTITY_COOKIE,
    );
    const replacementSession = responseCookiePair(
      afterTamper,
      STUDIO_SESSION_COOKIE,
    );
    const replacementOwner = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(replacementSession, replacementIdentity),
      }),
    );
    expect(replacementIdentity).not.toBe(originalIdentity);
    expect(replacementOwner).toMatch(/^[a-f0-9]{64}$/);
    expect(replacementOwner).not.toBe(originalOwner);
  });

  it("migrates a valid v1 session without changing its ledger owner", async () => {
    const secret = "legacy-session-secret-long-enough-for-production";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "legacy-test-access-code");
    vi.stubEnv("STUDIO_SESSION_SECRET", secret);
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const payload = `v1.${nowSeconds + STUDIO_SESSION_TTL_SECONDS}.${Buffer.alloc(
      18,
      7,
    ).toString("base64url")}`;
    const signature = createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("base64url");
    const legacyToken = `${payload}.${signature}`;
    const legacySession = `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(
      legacyToken,
    )}`;
    const legacyRequest = new Request(
      "https://studio.example.test/api/auth/access",
      { headers: requestCookies(legacySession) },
    );
    const legacyOwner = getStudioSessionIdentity(legacyRequest);
    expect(verifySessionToken(legacyToken)).toBe(true);

    const migration = await accessStatus(legacyRequest);
    expect(migration.status).toBe(200);
    const upgradedSession = responseCookiePair(
      migration,
      STUDIO_SESSION_COOKIE,
    );
    const durableIdentity = responseCookiePair(
      migration,
      STUDIO_IDENTITY_COOKIE,
    );
    expect(decodeURIComponent(upgradedSession)).toContain("v2.");
    const migratedOwner = getStudioSessionIdentity(
      new Request("https://studio.example.test/studio", {
        headers: requestCookies(upgradedSession, durableIdentity),
      }),
    );
    expect(migratedOwner).toBe(legacyOwner);
  });
});

describe("server-signed paid approval", () => {
  it("binds the token to session, kind, exact signature, model, and idempotency key", () => {
    vi.stubEnv("STUDIO_SESSION_SECRET", "unit-test-session-secret");
    const expected = {
      sessionIdentity: "a".repeat(64),
      kind: "image" as const,
      inputSignature: "b".repeat(64),
      providerModel: "gpt-image-2",
      idempotencyKey: "image:approval-test",
    };
    const issued = issueMediaApproval({
      ...expected,
      now: 1_800_000_000_000,
      nonce: "approval-test-nonce",
    });
    expect(issued).toBeTruthy();
    expect(
      verifyMediaApproval(issued?.token, expected, 1_800_000_001_000),
    ).toMatchObject(expected);
    expect(
      verifyMediaApproval(
        issued?.token,
        { ...expected, inputSignature: "c".repeat(64) },
        1_800_000_001_000,
      ),
    ).toBeNull();
    expect(
      verifyMediaApproval(
        issued?.token,
        { ...expected, providerModel: "another-model" },
        1_800_000_001_000,
      ),
    ).toBeNull();
    expect(
      verifyMediaApproval(
        issued?.token,
        { ...expected, adapterVersion: "another-adapter-build" },
        1_800_000_001_000,
      ),
    ).toBeNull();
    expect(
      verifyMediaApproval(issued?.token, expected, 1_800_000_301_000),
    ).toBeNull();
    expect(approvalFingerprint(issued!.token)).toMatch(/^[a-f0-9]{64}$/);
    expect(issued?.token).not.toContain("unit-test-session-secret");
  });

  it("derives a pseudonymous identity without returning the raw session cookie", () => {
    vi.stubEnv("STUDIO_SESSION_SECRET", "unit-test-session-secret");
    const token = createSessionToken();
    const request = new Request("https://studio.example.test", {
      headers: {
        cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token!)}`,
      },
    });
    const identity = getStudioSessionIdentity(request);
    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    expect(identity).not.toContain(token!);
  });

  it("requires live mode, HTTPS provider, and PostgreSQL before signing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "protected-session-secret-at-least-thirty-two-bytes",
    );
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "provider-key");
    vi.stubEnv("DATABASE_URL", "");
    expect(paidControlPlaneReadiness()).toMatchObject({
      ready: false,
      code: "database_not_configured",
    });

    const token = createSessionToken();
    const response = await approvalRoute(
      new Request("https://studio.example.test/api/media/approval", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token!)}`,
        },
        body: JSON.stringify({
          kind: "image",
          input: {
            prompt: "A source-grounded product frame.",
            aspectRatio: "9:16",
            idempotencyKey: "image:approval-route",
          },
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "database_not_configured" },
    });

    vi.stubEnv("DATABASE_URL", "postgres://ledger.example.test/vixel");
    vi.stubEnv("NEWAPI_BASE_URL", "http://newapi.example.test/v1");
    expect(paidControlPlaneReadiness()).toMatchObject({
      ready: false,
      code: "secure_provider_required",
    });
  });

  it("rejects exact-input tampering before database or provider IO", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "protected-session-secret-at-least-thirty-two-bytes",
    );
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "provider-key");
    vi.stubEnv("DATABASE_URL", "postgres://unreachable.example.test/vixel");
    const token = createSessionToken();
    const cookie = `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token!)}`;
    const approvedInput = {
      prompt: "A source-grounded product frame.",
      aspectRatio: "9:16",
      idempotencyKey: "image:unsigned-route",
    };
    const approvalResponse = await approvalRoute(
      new Request("https://studio.example.test/api/media/approval", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ kind: "image", input: approvedInput }),
      }),
    );
    expect(approvalResponse.status).toBe(200);
    const approved = (await approvalResponse.json()) as {
      approvalToken: string;
      inputSignature: string;
      providerModel: string;
    };
    expect(approved.approvalToken).toMatch(/^ma1\./);
    expect(approved.inputSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(approved.providerModel).toBe("gpt-image-2");

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await imageRoute(
      new Request("https://studio.example.test/api/media/image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          ...approvedInput,
          prompt: "A tampered product frame.",
          approvalToken: approved.approvalToken,
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_media_approval" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(
      first.brief.hooks.every(
        (hook) =>
          hook.claims.length === 1 &&
          hook.claims[0].factId === "fact-1" &&
          hook.script.includes(input.facts[0]),
      ),
    ).toBe(true);
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

  it("fails closed on ambiguous or unsupported Veo inputs", () => {
    expect(
      videoGenerationRequestSchema.safeParse({
        prompt: "Animate the product.",
        imageDataUrl: PNG_DATA_URL,
        firstFrameDataUrl: "data:image/png;base64,iVBORw0KGgoA",
      }).success,
    ).toBe(false);
    expect(
      videoGenerationRequestSchema.safeParse({
        prompt: "Animate the product.",
        imageDataUrl: PNG_DATA_URL,
        lastFrameDataUrl: PNG_DATA_URL,
      }).success,
    ).toBe(false);
    expect(
      videoGenerationRequestSchema.safeParse({
        prompt: "Animate the product.",
        durationSec: 4,
        resolution: "1080p",
      }).success,
    ).toBe(false);
    expect(
      videoGenerationRequestSchema.safeParse({
        prompt: "Animate the product.",
        generateAudio: false,
      }).success,
    ).toBe(false);
    expect(
      videoGenerationRequestSchema.parse({
        prompt: "Animate the product.",
      }).generateAudio,
    ).toBe(true);
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

  it("never automatically resubmits an ambiguous paid image request", async () => {
    stubProviderEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":"temporary"}', { status: 503 }),
    );

    await expect(
      generateNewApiImage({
        prompt: "A clean product still life.",
        size: "1024x1024",
        references: [],
        idempotencyKey: "image:test-single-submit-key",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      "image:test-single-submit-key",
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
    const providerSecret = "provider-response-secret-value";
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: `${providerSecret} unit-test-provider-key`,
          }),
          { status: 400 },
        ),
      );
    const error = await generateNewApiImage({
      prompt: "A clean product still life.",
      size: "1024x1024",
      references: [],
      idempotencyKey: "image:sanitized-provider-error",
      fetchImpl: fetchMock,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(String((error as Error).message)).not.toContain(providerSecret);
    expect(String((error as Error).message)).not.toContain(
      "unit-test-provider-key",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails before fetch when the provider key is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "protected-session-secret-at-least-thirty-two-bytes",
    );
    vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
    vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
    vi.stubEnv("NEWAPI_API_KEY", "");
    vi.stubEnv("DATABASE_URL", "postgres://ledger.example.test/vixel");
    const token = createSessionToken();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await imageRoute(
      new Request("https://studio.example.test/api/media/image", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token!)}`,
        },
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
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "protected-session-secret-long-enough-for-production",
    );
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

describe("media ledger projection", () => {
  it("does not require a session identity for an unprotected empty recovery surface", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STUDIO_ACCESS_CODE", "");
    vi.stubEnv("STUDIO_SESSION_SECRET", "");
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    vi.stubEnv("DATABASE_APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");

    const response = await mediaJobsRoute(
      new Request("https://studio.example.test/api/media/jobs"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jobs: [],
      recovery: "not_configured",
    });
  });

  it("treats server recovery as an empty capability in planning-only mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_ACCESS_CODE", "protected-access-code");
    vi.stubEnv(
      "STUDIO_SESSION_SECRET",
      "protected-session-secret-long-enough-for-production",
    );
    vi.stubEnv("ENABLE_LIVE_GENERATION", "false");
    vi.stubEnv("DATABASE_APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    const token = createSessionToken();

    const response = await mediaJobsRoute(
      new Request("https://studio.example.test/api/media/jobs", {
        headers: {
          cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token!)}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jobs: [],
      recovery: "not_configured",
    });
  });

  it("keeps large provider results out of repeated job metadata envelopes", () => {
    const projected = publicLedgerEntry({
      id: "11111111-1111-4111-8111-111111111111",
      sessionIdentity: "a".repeat(64),
      kind: "image",
      idempotencyKey: "image:test-ledger-envelope",
      inputSignature: "b".repeat(64),
      approvalSignature: "c".repeat(64),
      providerModel: "gpt-image-2",
      status: "succeeded",
      providerTaskId: null,
      providerResult: { url: `data:image/png;base64,${"A".repeat(1_000)}` },
      errorCode: null,
      errorMessage: null,
      revision: 1,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:01.000Z",
    });

    expect(projected.hasResult).toBe(true);
    expect(projected).not.toHaveProperty("result");
    expect(JSON.stringify(projected)).not.toContain("data:image");
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
      durationSec: 4,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
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
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      model: "dreamina-seedance-2-0-260128",
      duration: 4,
      size: "720x1280",
      metadata: {
        durationSeconds: 4,
        aspectRatio: "9:16",
        resolution: "720p",
        personGeneration: "allow_adult",
      },
    });
    expect(payload.metadata).not.toHaveProperty("generateAudio");
  });

  it("uses a sanitized error for rejected video submissions", async () => {
    stubProviderEnvironment();
    const hidden = "hidden-provider-diagnostic";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: hidden }), { status: 500 }),
    );
    const error = await submitNewApiVideo({
      prompt: "A restrained camera push.",
      durationSec: 4,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
      idempotencyKey: "video:sanitized-error",
      fetchImpl: fetchMock,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(String((error as Error).message)).not.toContain(hidden);
  });
});
