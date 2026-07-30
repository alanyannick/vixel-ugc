import { afterEach, describe, expect, it, vi } from "vitest";

import { lifecycleEmail } from "./email-templates";
import { withProductTransaction } from "./product-db";

vi.mock("./product-db", () => ({
  productQuery: vi.fn(),
  withProductTransaction: vi.fn(),
}));

describe("lifecycle email", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("escapes profile text in transactional templates", () => {
    const email = lifecycleEmail(
      "waitlist_confirmation",
      { displayName: "<script>alert(1)</script>" },
      "https://ugc.vixelai.com",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("<script>alert(1)</script>");
  });

  it("claims email jobs atomically with retry and abandoned-claim bounds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { claimEmailDeliveries } = await import("./lifecycle-email");
    await claimEmailDeliveries(200);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("attempts < 5");
    expect(sql).toContain("interval '15 minutes'");
    expect(query.mock.calls[0][1]).toEqual([25]);
  });

  it("uses a 48-hour first reminder and a 72-hour cooldown", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { enqueueInvitationReminders } = await import("./lifecycle-email");
    expect(await enqueueInvitationReminders()).toBe(0);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("interval '48 hours'");
    expect(sql).toContain("interval '72 hours'");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
  });

  it("treats a repeated Resend provider event as a no-op", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { projectResendWebhook } = await import("./lifecycle-email");
    const result = await projectResendWebhook({
      eventId: "evt_repeat",
      event: {
        type: "email.complained",
        data: { to: ["person@example.com"] },
      },
      rawBody: '{"type":"email.complained"}',
    });
    expect(result).toEqual({ duplicate: true, suppressed: 0 });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("forces product updates off after a verified suppression event projection", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "recorded" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    vi.mocked(withProductTransaction).mockImplementationOnce(async (operation) =>
      operation({ query } as never),
    );
    const { projectResendWebhook } = await import("./lifecycle-email");
    const result = await projectResendWebhook({
      eventId: "evt_suppressed",
      event: {
        type: "email.bounced",
        data: { to: ["Person@Example.com"] },
      },
      rawBody: '{"type":"email.bounced"}',
    });
    expect(result).toEqual({ duplicate: false, suppressed: 1 });
    expect(query.mock.calls[1][1]).toEqual([
      ["person@example.com"],
      "email.bounced",
    ]);
    expect(String(query.mock.calls[1][0])).toContain(
      "product_updates_opted_in = false",
    );
  });

  it("rejects a forged Resend webhook before projection", async () => {
    vi.stubEnv(
      "RESEND_WEBHOOK_SECRET",
      "whsec_dGVzdF9zaWduaW5nX3NlY3JldF90aGF0X2lzX2xvbmc=",
    );
    const { verifyResendWebhook } = await import("./lifecycle-email");
    expect(() =>
      verifyResendWebhook({
        rawBody: '{"type":"email.bounced","data":{}}',
        svixId: "msg_test",
        svixTimestamp: "1775000000",
        svixSignature: "v1,not-a-valid-signature",
      }),
    ).toThrow();
  });
});
