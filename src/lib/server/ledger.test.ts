import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/billing", () => ({
  requirePaidGenerationAccess: vi.fn(async () => null),
}));

import { POST as imageGenerationRoute } from "@/app/api/media/image/route";
import { GET as pollVideoRoute } from "@/app/api/media/video/[taskId]/route";
import { POST as videoGenerationRoute } from "@/app/api/media/video/route";

import {
  createSessionToken,
  STUDIO_SESSION_COOKIE,
} from "./auth";
import {
  canonicalImageApprovalInput,
  canonicalVideoApprovalInput,
  issueMediaApproval,
  mediaInputSignature,
  providerModelFor,
} from "./approval";
import {
  canTransitionMediaLedgerStatus,
  claimMediaSubmission,
  completeMediaSubmission,
  DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
  DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
  failMediaSubmission,
  findOwnedMediaEntry,
  getPaidSubmissionQuotaConfig,
  isTerminalMediaLedgerStatus,
  listOwnedMediaEntries,
  MAX_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
  MAX_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
  MediaLedgerError,
  noteMediaLedgerError,
  SUBMISSION_RECONCILIATION_LEASE_SECONDS,
  type MediaLedgerStatus,
} from "./ledger";
import {
  imageGenerationRequestSchema,
  videoGenerationRequestSchema,
} from "./media";

type TestLedgerRow = {
  id: string;
  session_identity: string;
  kind: "image" | "video";
  idempotency_key: string;
  input_signature: string;
  approval_signature: string;
  provider_model: string;
  status: MediaLedgerStatus;
  provider_task_id: string | null;
  provider_result: unknown | null;
  error_code: string | null;
  error_message: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

type LedgerTestGlobal = typeof globalThis & {
  __vixelMediaLedger?: {
    databaseUrl: string;
    pool: Pool;
    schemaReady: Promise<void> | null;
  };
};

const DATABASE_URL = "postgres://ledger.test/vixel";
const SESSION_IDENTITY = "a".repeat(64);

function row(overrides: Partial<TestLedgerRow> = {}): TestLedgerRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    session_identity: SESSION_IDENTITY,
    kind: "video",
    idempotency_key: "video:test:stable-key",
    input_signature: "b".repeat(64),
    approval_signature: "c".repeat(64),
    provider_model: "veo-3.1-fast-generate-preview",
    status: "submitting",
    provider_task_id: null,
    provider_result: null,
    error_code: null,
    error_message: null,
    revision: 0,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:01.000Z",
    ...overrides,
  };
}

function installPool(pool: Pool): void {
  vi.stubEnv("DATABASE_APP_URL", DATABASE_URL);
  (globalThis as LedgerTestGlobal).__vixelMediaLedger = {
    databaseUrl: DATABASE_URL,
    pool,
    schemaReady: Promise.resolve(),
  };
}

function configurePaidRoute(pool: Pool): string {
  installPool(pool);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv(
    "STUDIO_ACCESS_CODE",
    "ledger-test-access-code-with-release-strength",
  );
  vi.stubEnv(
    "STUDIO_SESSION_SECRET",
    "ledger-test-session-secret-with-at-least-thirty-two-bytes",
  );
  vi.stubEnv("ENABLE_LIVE_GENERATION", "true");
  vi.stubEnv("NEWAPI_BASE_URL", "https://newapi.example.test/v1");
  vi.stubEnv("NEWAPI_API_KEY", "ledger-test-provider-key");
  const token = createSessionToken();
  if (!token) throw new Error("Expected a signed test session.");
  return token;
}

function quotaPool(input: {
  identityCount: number;
  globalCount: number;
  replay?: TestLedgerRow;
  inserted?: TestLedgerRow;
  policyReady?: boolean;
}): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  let idempotencyReads = 0;
  const query = vi.fn(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [] };
    }
    if (sql.includes("runtime_policy_ready")) {
      return {
        rows: [
          {
            runtime_policy_ready: input.policyReady ?? true,
          },
        ],
      };
    }
    if (sql.includes("idempotency_key = $2")) {
      idempotencyReads += 1;
      return {
        rows:
          input.replay && idempotencyReads === 1
            ? [input.replay]
            : [],
      };
    }
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("approval_signature = $2")) return { rows: [] };
    if (sql.includes("AS identity_count")) {
      return {
        rows: [
          {
            identity_count: String(input.identityCount),
            global_count: String(input.globalCount),
          },
        ],
      };
    }
    if (sql.includes("INSERT INTO")) {
      return { rows: input.inserted ? [input.inserted] : [] };
    }
    if (sql.includes("SET revision = revision + 1")) {
      return {
        rows: input.inserted
          ? [{ ...input.inserted, revision: input.inserted.revision + 1 }]
          : [],
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    pool: {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool,
    query,
  };
}

function quotaRequest(
  kind: "image" | "video",
  token: string,
): Request {
  const sessionIdentity = token.split(".")[2];
  const idempotencyKey = `${kind}:quota-route-test`;
  let input: Record<string, unknown>;
  let canonicalInput: ReturnType<typeof canonicalImageApprovalInput>;
  if (kind === "image") {
    const parsed = imageGenerationRequestSchema.parse({
      prompt: "A source-grounded product frame.",
      aspectRatio: "9:16",
      idempotencyKey,
    });
    input = parsed;
    canonicalInput = canonicalImageApprovalInput(parsed);
  } else {
    const parsed = videoGenerationRequestSchema.parse({
      prompt: "A source-grounded product demo.",
      durationSec: 8,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
      idempotencyKey,
    });
    input = parsed;
    canonicalInput = canonicalVideoApprovalInput(parsed);
  }
  const approval = issueMediaApproval({
    sessionIdentity,
    kind,
    inputSignature: mediaInputSignature(canonicalInput),
    providerModel: providerModelFor(kind),
    idempotencyKey,
    nonce: "quota-route-approval",
  });
  if (!approval) throw new Error("Expected a signed media approval.");
  return new Request(
    `https://studio.example.test/api/media/${kind}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      },
      body: JSON.stringify({
        ...input,
        approvalToken: approval.token,
      }),
    },
  );
}

afterEach(() => {
  delete (globalThis as LedgerTestGlobal).__vixelMediaLedger;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("paid submission quota", () => {
  it("uses conservative defaults and rejects malformed or out-of-bounds overrides", () => {
    expect(getPaidSubmissionQuotaConfig({})).toEqual({
      identityDailyLimit:
        DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
      globalDailyLimit: DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
    });
    expect(
      getPaidSubmissionQuotaConfig({
        PAID_SUBMISSION_DAILY_IDENTITY_LIMIT: "2.5",
        PAID_SUBMISSION_DAILY_GLOBAL_LIMIT: "unlimited",
      }),
    ).toEqual({
      identityDailyLimit:
        DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
      globalDailyLimit: DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
    });
    expect(
      getPaidSubmissionQuotaConfig({
        PAID_SUBMISSION_DAILY_IDENTITY_LIMIT: String(
          MAX_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT + 1,
        ),
        PAID_SUBMISSION_DAILY_GLOBAL_LIMIT: String(
          MAX_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT + 1,
        ),
      }),
    ).toEqual({
      identityDailyLimit:
        DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
      globalDailyLimit: DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
    });
    expect(
      getPaidSubmissionQuotaConfig({
        PAID_SUBMISSION_DAILY_IDENTITY_LIMIT: "12",
        PAID_SUBMISSION_DAILY_GLOBAL_LIMIT: "7",
      }),
    ).toEqual({
      identityDailyLimit: 7,
      globalDailyLimit: 7,
    });
  });

  it("always returns an existing idempotent claim without checking an exhausted quota", async () => {
    const persisted = row({
      status: "succeeded",
      provider_result: {
        url: "https://cdn.example.test/existing.png",
      },
      revision: 1,
    });
    vi.stubEnv("PAID_SUBMISSION_DAILY_IDENTITY_LIMIT", "1");
    vi.stubEnv("PAID_SUBMISSION_DAILY_GLOBAL_LIMIT", "1");
    const { pool, query } = quotaPool({
      identityCount: 1,
      globalCount: 1,
      replay: persisted,
    });
    installPool(pool);

    const claim = await claimMediaSubmission({
      sessionIdentity: SESSION_IDENTITY,
      kind: persisted.kind,
      idempotencyKey: persisted.idempotency_key,
      inputSignature: persisted.input_signature,
      approvalSignature: persisted.approval_signature,
      providerModel: persisted.provider_model,
    });

    expect(claim).toMatchObject({
      acquired: false,
      entry: { id: persisted.id, status: "succeeded" },
    });
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqlCalls.some((sql) => sql.includes("pg_advisory_xact_lock")),
    ).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes("AS identity_count"))).toBe(
      false,
    );
    expect(sqlCalls.some((sql) => sql.includes("INSERT INTO"))).toBe(
      false,
    );
    expect(sqlCalls.at(-1)).toBe("COMMIT");
  });

  it("atomically rejects a new claim at the daily limit before insert", async () => {
    vi.stubEnv("PAID_SUBMISSION_DAILY_IDENTITY_LIMIT", "1");
    vi.stubEnv("PAID_SUBMISSION_DAILY_GLOBAL_LIMIT", "5");
    const { pool, query } = quotaPool({
      identityCount: 1,
      globalCount: 1,
    });
    installPool(pool);

    const error = await claimMediaSubmission({
      sessionIdentity: SESSION_IDENTITY,
      kind: "video",
      idempotencyKey: "video:new-quota-limited",
      inputSignature: "b".repeat(64),
      approvalSignature: "d".repeat(64),
      providerModel: "veo-3.1-fast-generate-preview",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MediaLedgerError);
    expect(error).toMatchObject({
      code: "paid_submission_quota_exceeded",
    });
    expect(String((error as Error).message)).not.toContain(
      SESSION_IDENTITY,
    );
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    const globalLockIndex = sqlCalls.findIndex(
      (sql) =>
        sql.includes("pg_advisory_xact_lock") &&
        !sql.includes("hashtext"),
    );
    const identityLockIndex = sqlCalls.findIndex((sql) =>
      sql.includes("hashtext"),
    );
    const countIndex = sqlCalls.findIndex((sql) =>
      sql.includes("AS identity_count"),
    );
    expect(globalLockIndex).toBeGreaterThan(0);
    expect(identityLockIndex).toBeGreaterThan(globalLockIndex);
    expect(countIndex).toBeGreaterThan(identityLockIndex);
    expect(sqlCalls.some((sql) => sql.includes("INSERT INTO"))).toBe(
      false,
    );
    expect(sqlCalls.at(-1)).toBe("ROLLBACK");
    expect(sqlCalls.join("\n")).not.toContain(SESSION_IDENTITY);
  });

  it("rejects policy drift inside the claim transaction before provider ownership", async () => {
    const { pool, query } = quotaPool({
      identityCount: 0,
      globalCount: 0,
      policyReady: false,
    });
    installPool(pool);

    await expect(
      claimMediaSubmission({
        sessionIdentity: SESSION_IDENTITY,
        kind: "image",
        idempotencyKey: "image:policy-drift",
        inputSignature: "b".repeat(64),
        approvalSignature: "d".repeat(64),
        providerModel: "gpt-image-2",
      }),
    ).rejects.toMatchObject({
      code: "database_unavailable",
    });

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls[0]).toBe("BEGIN");
    expect(sqlCalls[1]).toContain("runtime_policy_ready");
    expect(sqlCalls.some((sql) => sql.includes("INSERT INTO"))).toBe(
      false,
    );
    expect(sqlCalls.at(-1)).toBe("ROLLBACK");
  });

  it("holds ordered transaction advisory locks through count and insert", async () => {
    const inserted = row({
      idempotency_key: "image:new-quota-allowed",
      kind: "image",
      input_signature: "e".repeat(64),
      approval_signature: "f".repeat(64),
      provider_model: "gpt-image-2",
    });
    const { pool, query } = quotaPool({
      identityCount: 0,
      globalCount: 0,
      inserted,
    });
    installPool(pool);

    const claim = await claimMediaSubmission({
      sessionIdentity: SESSION_IDENTITY,
      kind: inserted.kind,
      idempotencyKey: inserted.idempotency_key,
      inputSignature: inserted.input_signature,
      approvalSignature: inserted.approval_signature,
      providerModel: inserted.provider_model,
    });

    expect(claim).toMatchObject({
      acquired: true,
      entry: { id: inserted.id, status: "submitting" },
    });
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    const globalLockIndex = sqlCalls.findIndex(
      (sql) =>
        sql.includes("pg_advisory_xact_lock") &&
        !sql.includes("hashtext"),
    );
    const identityLockIndex = sqlCalls.findIndex((sql) =>
      sql.includes("hashtext"),
    );
    const countIndex = sqlCalls.findIndex((sql) =>
      sql.includes("AS identity_count"),
    );
    const insertIndex = sqlCalls.findIndex((sql) =>
      sql.includes("INSERT INTO"),
    );
    const verifyIndex = sqlCalls.findIndex((sql) =>
      sql.includes("SET revision = revision + 1"),
    );
    expect(sqlCalls[0]).toBe("BEGIN");
    expect(identityLockIndex).toBeGreaterThan(globalLockIndex);
    expect(countIndex).toBeGreaterThan(identityLockIndex);
    expect(insertIndex).toBeGreaterThan(countIndex);
    expect(verifyIndex).toBeGreaterThan(insertIndex);
    expect(sqlCalls.at(-1)).toBe("COMMIT");
    expect(sqlCalls[countIndex]).toContain("AT TIME ZONE 'UTC'");
  });

  it.each([
    ["image", imageGenerationRoute],
    ["video", videoGenerationRoute],
  ] as const)(
    "maps a %s quota denial to 429 without provider I/O",
    async (kind, route) => {
      vi.stubEnv("PAID_SUBMISSION_DAILY_IDENTITY_LIMIT", "1");
      vi.stubEnv("PAID_SUBMISSION_DAILY_GLOBAL_LIMIT", "1");
      const { pool } = quotaPool({
        identityCount: 1,
        globalCount: 1,
      });
      const token = configurePaidRoute(pool);
      const fetchMock = vi.spyOn(globalThis, "fetch");

      const response = await route(quotaRequest(kind, token));

      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({
        error: {
          code: "paid_submission_quota_exceeded",
          retryable: true,
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("media ledger state machine", () => {
  it("allows forward progress but never leaves a protected terminal state", () => {
    expect(canTransitionMediaLedgerStatus("submitted", "processing")).toBe(
      true,
    );
    expect(canTransitionMediaLedgerStatus("processing", "submitted")).toBe(
      false,
    );
    expect(canTransitionMediaLedgerStatus("processing", "succeeded")).toBe(
      true,
    );

    for (const terminal of [
      "succeeded",
      "failed",
      "cancelled",
      "reconciliation_required",
    ] as const) {
      expect(isTerminalMediaLedgerStatus(terminal)).toBe(true);
      expect(canTransitionMediaLedgerStatus(terminal, "processing")).toBe(
        false,
      );
      expect(canTransitionMediaLedgerStatus(terminal, "failed")).toBe(false);
    }
  });

  it("returns the persisted winner when a stale completion loses its CAS", async () => {
    const winner = row({
      status: "succeeded",
      provider_task_id: "task_cas_123",
      provider_result: {
        taskId: "task_cas_123",
        status: "succeeded",
        progress: 100,
        url: "https://cdn.example.test/final.mp4",
        error: null,
      },
      revision: 2,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [winner] });
    installPool({ query } as unknown as Pool);

    const entry = await completeMediaSubmission({
      entryId: winner.id,
      sessionIdentity: SESSION_IDENTITY,
      expectedStatus: "processing",
      expectedRevision: 1,
      status: "processing",
      providerTaskId: "task_cas_123",
      providerResult: {
        taskId: "task_cas_123",
        status: "processing",
        progress: 20,
        url: null,
        error: null,
      },
    });

    expect(entry).toMatchObject({
      status: "succeeded",
      revision: 2,
      providerResult: { progress: 100 },
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("revision = revision + 1");
    expect(sql).toContain("AND status = $6");
    expect(sql).toContain("AND revision = $7");
    expect(parameters[5]).toBe("processing");
    expect(parameters[6]).toBe(1);
    expect(parameters[7]).toEqual([
      "submitting",
      "submitted",
      "processing",
    ]);
  });

  it("does not let a stale provider failure overwrite cancellation", async () => {
    const cancelled = row({
      status: "cancelled",
      error_code: "operator_cancelled",
      error_message: "Cancelled by the operator.",
      revision: 1,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cancelled] });
    installPool({ query } as unknown as Pool);

    const entry = await failMediaSubmission({
      entryId: cancelled.id,
      sessionIdentity: SESSION_IDENTITY,
      expectedStatus: "submitting",
      expectedRevision: 0,
      status: "failed",
      errorCode: "provider_failed",
      errorMessage: "A stale provider failure.",
    });

    expect(entry).toMatchObject({
      status: "cancelled",
      revision: 1,
      errorCode: "operator_cancelled",
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("AND status = $6");
    expect(sql).toContain("AND revision = $7");
    expect(parameters[7]).toEqual([
      "submitting",
      "submitted",
      "processing",
      "submit_unknown",
    ]);
  });

  it("records transient poll errors without consuming the state revision", async () => {
    const processing = row({
      status: "processing",
      provider_task_id: "task_poll_error_123",
      revision: 3,
    });
    const noted = row({
      ...processing,
      error_code: "provider_unavailable",
      error_message: "The provider status endpoint is temporarily unavailable.",
    });
    const query = vi.fn().mockResolvedValueOnce({ rows: [noted] });
    installPool({ query } as unknown as Pool);

    const entry = await noteMediaLedgerError({
      entryId: processing.id,
      sessionIdentity: SESSION_IDENTITY,
      expectedStatus: "processing",
      expectedRevision: 3,
      errorCode: "provider_unavailable",
      errorMessage:
        "The provider status endpoint is temporarily unavailable.",
    });

    expect(entry).toMatchObject({
      status: "processing",
      revision: 3,
      errorCode: "provider_unavailable",
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("revision = revision + 1");
    expect(sql).toContain("AND revision = $6");
    expect(parameters[5]).toBe(3);
  });

  it("turns an expired duplicate claim into reconciliation without reacquiring it", async () => {
    const stale = row({
      updated_at: "2026-07-30T00:00:00.000Z",
    });
    const reconciled = row({
      status: "reconciliation_required",
      error_code: "submission_lease_expired",
      error_message:
        "The provider submission lease expired without a durable task or result. Reconciliation is required before any retry.",
      revision: 1,
      updated_at: "2026-07-31T01:00:00.000Z",
    });
    const clientQuery = vi.fn(
      async (sqlValue: unknown, parameters?: unknown[]) => {
        void parameters;
        const sql = String(sqlValue);
        if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
        if (sql.includes("runtime_policy_ready")) {
          return { rows: [{ runtime_policy_ready: true }] };
        }
        if (sql.includes("INSERT INTO")) return { rows: [] };
        if (sql.includes("idempotency_key = $2")) {
          return { rows: [stale] };
        }
        if (sql.includes("SET status = 'reconciliation_required'")) {
          return { rows: [reconciled] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    );
    const client = {
      query: clientQuery,
      release: vi.fn(),
    };
    installPool({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool);

    const claim = await claimMediaSubmission({
      sessionIdentity: SESSION_IDENTITY,
      kind: "video",
      idempotencyKey: stale.idempotency_key,
      inputSignature: stale.input_signature,
      approvalSignature: stale.approval_signature,
      providerModel: stale.provider_model,
    });

    expect(claim).toMatchObject({
      acquired: false,
      entry: {
        status: "reconciliation_required",
        errorCode: "submission_lease_expired",
        revision: 1,
      },
    });
    const staleUpdate = clientQuery.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes("submission lease"),
    );
    const updateCall =
      staleUpdate ??
      clientQuery.mock.calls.find(([sqlValue]) =>
        String(sqlValue).includes("make_interval"),
      );
    expect(updateCall).toBeTruthy();
    if (!updateCall) throw new Error("Expected the stale lease update.");
    const sql = String(updateCall[0]);
    const parameters = updateCall[1] as unknown[];
    expect(sql).toContain("provider_task_id IS NULL");
    expect(sql).toContain("provider_result IS NULL");
    expect(sql).toContain("revision = $3");
    expect(parameters[5]).toBe(
      SUBMISSION_RECONCILIATION_LEASE_SECONDS,
    );
  });

  it("reconciles stale owned submissions before reload recovery lists them", async () => {
    const reconciled = row({
      status: "reconciliation_required",
      error_code: "submission_lease_expired",
      revision: 1,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [reconciled] });
    installPool({ query } as unknown as Pool);

    const entries = await listOwnedMediaEntries(SESSION_IDENTITY);

    expect(entries[0]).toMatchObject({
      status: "reconciliation_required",
      errorCode: "submission_lease_expired",
    });
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'submitting'");
    expect(sql).toContain("provider_task_id IS NULL");
    expect(sql).toContain("provider_result IS NULL");
    expect(parameters[4]).toBe(
      SUBMISSION_RECONCILIATION_LEASE_SECONDS,
    );
  });

  it("reconciles a stale submission before reading its recovery detail", async () => {
    const reconciled = row({
      status: "reconciliation_required",
      error_code: "submission_lease_expired",
      revision: 1,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [reconciled] });
    installPool({ query } as unknown as Pool);

    const entry = await findOwnedMediaEntry(
      SESSION_IDENTITY,
      reconciled.id,
    );

    expect(entry).toMatchObject({
      id: reconciled.id,
      status: "reconciliation_required",
      errorCode: "submission_lease_expired",
    });
    const [, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(parameters[1]).toBe(reconciled.id);
  });
});

describe("video poll ledger protection", () => {
  it("treats cancellation as terminal without polling the provider", async () => {
    const cancelled = row({
      status: "cancelled",
      provider_task_id: "task_cancelled_123",
      error_code: "operator_cancelled",
      error_message: "Cancelled by the operator.",
      revision: 2,
    });
    const query = vi.fn().mockResolvedValue({ rows: [cancelled] });
    const token = configurePaidRoute({ query } as unknown as Pool);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await pollVideoRoute(
      new Request(
        "https://studio.example.test/api/media/video/task_cancelled_123",
        {
          headers: {
            cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token)}`,
          },
        },
      ),
      { params: Promise.resolve({ taskId: "task_cancelled_123" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      replayed: true,
      job: { status: "cancelled" },
      result: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves the durable winner instead of a stale processing poll", async () => {
    const processing = row({
      status: "processing",
      provider_task_id: "task_race_123",
      provider_result: {
        taskId: "task_race_123",
        status: "processing",
        progress: 10,
        url: null,
        error: null,
      },
      revision: 1,
    });
    const succeeded = row({
      status: "succeeded",
      provider_task_id: "task_race_123",
      provider_result: {
        taskId: "task_race_123",
        status: "succeeded",
        progress: 100,
        url: "https://cdn.example.test/winner.mp4",
        error: null,
      },
      revision: 2,
    });
    const query = vi.fn(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.startsWith("SELECT") && sql.includes("provider_task_id = $2")) {
        return { rows: [processing] };
      }
      if (sql.startsWith("UPDATE")) return { rows: [] };
      if (sql.startsWith("SELECT") && sql.includes("WHERE id = $1")) {
        return { rows: [succeeded] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const token = configurePaidRoute({ query } as unknown as Pool);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            task_id: "task_race_123",
            status: "processing",
            progress: 20,
          },
        }),
        { status: 200 },
      ),
    );

    const response = await pollVideoRoute(
      new Request(
        "https://studio.example.test/api/media/video/task_race_123",
        {
          headers: {
            cookie: `${STUDIO_SESSION_COOKIE}=${encodeURIComponent(token)}`,
          },
        },
      ),
      { params: Promise.resolve({ taskId: "task_race_123" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      job: { status: "succeeded" },
      result: {
        status: "succeeded",
        progress: 100,
        url: "https://cdn.example.test/winner.mp4",
      },
    });
  });
});
