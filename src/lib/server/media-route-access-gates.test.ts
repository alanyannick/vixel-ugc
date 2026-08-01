import { afterEach, describe, expect, it, vi } from "vitest";

const accountSpies = vi.hoisted(() => ({
  authorize: vi.fn(),
  requireCurrentSession: vi.fn(),
}));

const productDatabaseSpies = vi.hoisted(() => ({
  query: vi.fn(),
}));

const ledgerSpies = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  readiness: vi.fn(),
}));

const providerSpies = vi.hoisted(() => ({
  generateImage: vi.fn(),
  submitVideo: vi.fn(),
}));

vi.mock("./accounts", () => ({
  authorizeAccount: accountSpies.authorize,
  requireCurrentStudioSession: accountSpies.requireCurrentSession,
}));

vi.mock("./product-db", () => ({
  productQuery: productDatabaseSpies.query,
  withProductTransaction: vi.fn(),
}));

vi.mock("./ledger", () => ({
  claimMediaSubmission: ledgerSpies.claim,
  completeMediaSubmission: ledgerSpies.complete,
  failMediaSubmission: ledgerSpies.fail,
  isTerminalMediaLedgerStatus: vi.fn(() => false),
  paidControlPlaneReadiness: ledgerSpies.readiness,
  publicLedgerEntry: vi.fn(),
  publicSubmissionReplay: vi.fn(),
  MediaLedgerError: class MediaLedgerError extends Error {},
}));

vi.mock("./provider", () => ({
  generateNewApiImage: providerSpies.generateImage,
  submitNewApiVideo: providerSpies.submitVideo,
  ProviderRequestError: class ProviderRequestError extends Error {},
}));

import { POST as imageGenerationRoute } from "@/app/api/media/image/route";
import { POST as videoGenerationRoute } from "@/app/api/media/video/route";

const USER_ID = "0f54f1be-129d-4adb-a731-6fd54cfc1bc1";

type GateCase = {
  code:
    | "account_auth_not_ready"
    | "billing_not_ready"
    | "subscription_required";
  status: 402 | 503;
  accountAuthEnabled: boolean;
  billingEnabled: boolean;
  expectAuthorization: boolean;
  expectSubscriptionRead: boolean;
};

const gateCases: GateCase[] = [
  {
    code: "account_auth_not_ready",
    status: 503,
    accountAuthEnabled: false,
    billingEnabled: true,
    expectAuthorization: false,
    expectSubscriptionRead: false,
  },
  {
    code: "billing_not_ready",
    status: 503,
    accountAuthEnabled: true,
    billingEnabled: false,
    expectAuthorization: true,
    expectSubscriptionRead: false,
  },
  {
    code: "subscription_required",
    status: 402,
    accountAuthEnabled: true,
    billingEnabled: true,
    expectAuthorization: true,
    expectSubscriptionRead: true,
  },
];

function configureProductRuntime(input: GateCase): void {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
  vi.stubEnv("ENABLE_ACCOUNT_AUTH", String(input.accountAuthEnabled));
  vi.stubEnv("ENABLE_BILLING", String(input.billingEnabled));
  vi.stubEnv("DATABASE_APP_URL", "postgres://runtime.test/vixel");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ugc.vixelai.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_test",
  );
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_safe");
  vi.stubEnv("STRIPE_PRICE_UGC_BETA", "price_safe");
}

function routeRequest(kind: "image" | "video"): Request {
  return new Request(`https://ugc.vixelai.com/api/media/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe.each([
  ["image", imageGenerationRoute],
  ["video", videoGenerationRoute],
] as const)("%s paid-generation route access gates", (kind, route) => {
  it.each(gateCases)(
    "returns $code before ledger claim or provider I/O",
    async (gate) => {
      configureProductRuntime(gate);
      accountSpies.requireCurrentSession.mockResolvedValue(null);
      accountSpies.authorize.mockResolvedValue({
        allowed: true,
        session: {},
        account: {
          userId: USER_ID,
          email: "creator@example.com",
        },
      });
      productDatabaseSpies.query.mockResolvedValue({ rows: [] });

      const response = await route(routeRequest(kind));

      expect(response.status).toBe(gate.status);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: gate.code },
      });
      expect(accountSpies.requireCurrentSession).toHaveBeenCalledTimes(1);
      expect(accountSpies.authorize).toHaveBeenCalledTimes(
        gate.expectAuthorization ? 1 : 0,
      );
      expect(productDatabaseSpies.query).toHaveBeenCalledTimes(
        gate.expectSubscriptionRead ? 1 : 0,
      );

      if (gate.expectAuthorization) {
        expect(
          accountSpies.requireCurrentSession.mock.invocationCallOrder[0],
        ).toBeLessThan(accountSpies.authorize.mock.invocationCallOrder[0]);
      }
      if (gate.expectSubscriptionRead) {
        expect(accountSpies.authorize.mock.invocationCallOrder[0]).toBeLessThan(
          productDatabaseSpies.query.mock.invocationCallOrder[0],
        );
      }

      expect(ledgerSpies.readiness).not.toHaveBeenCalled();
      expect(ledgerSpies.claim).not.toHaveBeenCalled();
      expect(ledgerSpies.complete).not.toHaveBeenCalled();
      expect(ledgerSpies.fail).not.toHaveBeenCalled();
      expect(providerSpies.generateImage).not.toHaveBeenCalled();
      expect(providerSpies.submitVideo).not.toHaveBeenCalled();
    },
  );
});
