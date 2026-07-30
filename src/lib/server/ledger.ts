import { randomUUID } from "node:crypto";

import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";

import type { MediaKind } from "./approval";
import { verifyMediaLedgerRuntimeMutation } from "./database-readiness";
import { getServerRuntimeConfig } from "./env";

export type MediaLedgerStatus =
  | "submitting"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed"
  | "submit_unknown"
  | "cancelled"
  | "reconciliation_required";

export type MediaLedgerEntry = {
  id: string;
  sessionIdentity: string;
  kind: MediaKind;
  idempotencyKey: string;
  inputSignature: string;
  approvalSignature: string;
  providerModel: string;
  status: MediaLedgerStatus;
  providerTaskId: string | null;
  providerResult: unknown | null;
  errorCode: string | null;
  errorMessage: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type LedgerRow = QueryResultRow & {
  id: string;
  session_identity: string;
  kind: MediaKind;
  idempotency_key: string;
  input_signature: string;
  approval_signature: string;
  provider_model: string;
  status: MediaLedgerStatus;
  provider_task_id: string | null;
  provider_result: unknown | null;
  error_code: string | null;
  error_message: string | null;
  revision: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

type PaidSubmissionQuotaRow = QueryResultRow & {
  identity_count: number | string;
  global_count: number | string;
};

export class MediaLedgerError extends Error {
  constructor(
    readonly code:
      | "database_not_configured"
      | "database_unavailable"
      | "idempotency_conflict"
      | "approval_reused"
      | "ledger_entry_missing"
      | "paid_submission_quota_exceeded",
    message: string,
  ) {
    super(message);
    this.name = "MediaLedgerError";
  }
}

const TABLE = "vixel_koc.media_generation_ledger";
const SELECT_COLUMNS = `
  id, session_identity, kind, idempotency_key, input_signature,
  approval_signature, provider_model, status, provider_task_id,
  provider_result, error_code, error_message, revision, created_at, updated_at
`;

export const SUBMISSION_RECONCILIATION_LEASE_SECONDS = 10 * 60;
export const DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT = 4;
export const DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT = 20;
export const MAX_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT = 100;
export const MAX_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT = 500;

const PAID_SUBMISSION_QUOTA_LOCK_NAMESPACE = 1_448_718_411;
const PAID_SUBMISSION_GLOBAL_LOCK_KEY = 1;

const RUNTIME_POLICY_READY_QUERY = `
  SELECT
    count(*) = 1
    AND count(*) FILTER (
      WHERE policyname = 'vixel_koc_runtime_server_access'
        AND permissive = 'PERMISSIVE'
        AND cmd = 'ALL'
        AND roles = ARRAY['vixel_koc_runtime']::name[]
        AND qual = 'true'
        AND with_check = 'true'
    ) = 1 AS runtime_policy_ready
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'vixel_koc'
    AND tablename = 'media_generation_ledger'
`;

export type PaidSubmissionQuotaConfig = {
  identityDailyLimit: number;
  globalDailyLimit: number;
};

type PaidSubmissionQuotaEnv = {
  PAID_SUBMISSION_DAILY_IDENTITY_LIMIT?: string;
  PAID_SUBMISSION_DAILY_GLOBAL_LIMIT?: string;
};

function boundedDailyLimit(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const normalized = value?.trim();
  if (!normalized || !/^[1-9][0-9]*$/.test(normalized)) return fallback;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed <= maximum
    ? parsed
    : fallback;
}

export function getPaidSubmissionQuotaConfig(
  env: PaidSubmissionQuotaEnv = {
    PAID_SUBMISSION_DAILY_IDENTITY_LIMIT:
      process.env.PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
    PAID_SUBMISSION_DAILY_GLOBAL_LIMIT:
      process.env.PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
  },
): PaidSubmissionQuotaConfig {
  const globalDailyLimit = boundedDailyLimit(
    env.PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
    DEFAULT_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
    MAX_PAID_SUBMISSION_DAILY_GLOBAL_LIMIT,
  );
  const configuredIdentityLimit = boundedDailyLimit(
    env.PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
    DEFAULT_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
    MAX_PAID_SUBMISSION_DAILY_IDENTITY_LIMIT,
  );
  return {
    // A per-identity override can never exceed the deployment-wide ceiling.
    identityDailyLimit: Math.min(
      configuredIdentityLimit,
      globalDailyLimit,
    ),
    globalDailyLimit,
  };
}

const TERMINAL_STATUSES = new Set<MediaLedgerStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "reconciliation_required",
]);

const PRIOR_STATUSES: Record<
  Exclude<MediaLedgerStatus, "submitting">,
  readonly MediaLedgerStatus[]
> = {
  submitted: ["submitting", "submitted"],
  processing: ["submitting", "submitted", "processing"],
  succeeded: ["submitting", "submitted", "processing", "submit_unknown"],
  failed: ["submitting", "submitted", "processing", "submit_unknown"],
  submit_unknown: ["submitting"],
  cancelled: ["submitting", "submitted", "processing", "submit_unknown"],
  reconciliation_required: [
    "submitting",
    "submitted",
    "processing",
    "submit_unknown",
  ],
};

export function isTerminalMediaLedgerStatus(
  status: MediaLedgerStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransitionMediaLedgerStatus(
  current: MediaLedgerStatus,
  next: Exclude<MediaLedgerStatus, "submitting">,
): boolean {
  return PRIOR_STATUSES[next].includes(current);
}

type LedgerGlobal = {
  databaseUrl: string;
  pool: Pool;
  schemaReady: Promise<void> | null;
};

const globalLedger = globalThis as typeof globalThis & {
  __vixelMediaLedger?: LedgerGlobal;
};

function databaseUrl(): string | null {
  for (const candidate of [
    process.env.DATABASE_APP_URL,
    process.env.DATABASE_URL,
  ]) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (["postgres:", "postgresql:"].includes(parsed.protocol)) return value;
    } catch {
      // A valid fallback connection can still be used.
    }
  }
  return null;
}

export function paidControlPlaneReadiness():
  | { ready: true }
  | {
      ready: false;
      code:
        | "live_generation_disabled"
        | "secure_provider_required"
        | "provider_not_configured"
        | "database_not_configured";
      message: string;
    } {
  const runtime = getServerRuntimeConfig();
  if (!runtime.liveGeneration) {
    return {
      ready: false,
      code: "live_generation_disabled",
      message: "Live generation is disabled on this deployment.",
    };
  }
  if (
    runtime.newApi.rootBaseUrl &&
    !runtime.newApi.transportSecure
  ) {
    return {
      ready: false,
      code: "secure_provider_required",
      message: "Live generation requires an HTTPS provider endpoint.",
    };
  }
  if (!runtime.newApi.configured || !runtime.newApi.rootBaseUrl) {
    return {
      ready: false,
      code: "provider_not_configured",
      message: "The generation provider is not configured.",
    };
  }
  if (!databaseUrl()) {
    return {
      ready: false,
      code: "database_not_configured",
      message: "Live generation requires a durable PostgreSQL ledger.",
    };
  }
  return { ready: true };
}

function state(): LedgerGlobal {
  const url = databaseUrl();
  if (!url) {
    throw new MediaLedgerError(
      "database_not_configured",
      "The durable media ledger is not configured.",
    );
  }
  if (
    !globalLedger.__vixelMediaLedger?.pool ||
    globalLedger.__vixelMediaLedger.databaseUrl !== url
  ) {
    globalLedger.__vixelMediaLedger = {
      databaseUrl: url,
      pool: new Pool({
        connectionString: url,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
        query_timeout: 12_000,
        idle_in_transaction_session_timeout: 10_000,
        allowExitOnIdle: true,
      }),
      schemaReady: null,
    };
  }
  return globalLedger.__vixelMediaLedger;
}

async function ensureSchema(): Promise<Pool> {
  const ledger = state();
  if (!ledger.schemaReady) {
    ledger.schemaReady = ledger.pool
      // Runtime credentials only verify the migrated schema. DDL is applied
      // separately through the checked-in Supabase migration so a cold
      // function cannot silently create or drift production tables.
      .query<{ runtime_ready: boolean }>(`
        SELECT
          has_schema_privilege(current_user, 'vixel_koc', 'USAGE')
          AND NOT has_schema_privilege(current_user, 'vixel_koc', 'CREATE')
          AND has_table_privilege(current_user, '${TABLE}', 'SELECT')
          AND has_table_privilege(current_user, '${TABLE}', 'INSERT')
          AND has_table_privilege(current_user, '${TABLE}', 'UPDATE')
          AND NOT has_table_privilege(current_user, '${TABLE}', 'DELETE')
          AND pg_has_role(current_user, 'vixel_koc_runtime', 'USAGE')
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles
            WHERE rolname = current_user
              AND NOT rolsuper
              AND NOT rolcreatedb
              AND NOT rolcreaterole
              AND NOT rolbypassrls
          )
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'vixel_koc'
              AND relation.relname = 'media_generation_ledger'
              AND relation.relrowsecurity
              AND relation.relforcerowsecurity
          )
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'vixel_koc'
              AND tablename = 'media_generation_ledger'
              AND policyname = 'vixel_koc_runtime_server_access'
              AND permissive = 'PERMISSIVE'
              AND cmd = 'ALL'
              AND roles = ARRAY['vixel_koc_runtime']::name[]
              AND qual = 'true'
              AND with_check = 'true'
          )
          AND (
            SELECT count(*)
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'vixel_koc'
              AND tablename = 'media_generation_ledger'
          ) = 1
          AS runtime_ready
      `)
      .then(async (result) => {
        if (!result.rows[0]?.runtime_ready) {
          throw new Error(
            "The database login is not a member of vixel_koc_runtime.",
          );
        }
        const client = await ledger.pool.connect();
        try {
          await verifyMediaLedgerRuntimeMutation(client);
        } finally {
          client.release();
        }
      })
      .catch((error: unknown) => {
        ledger.schemaReady = null;
        throw new MediaLedgerError(
          "database_unavailable",
          error instanceof Error
            ? "The durable media ledger is unavailable."
            : "The durable media ledger could not be initialized.",
        );
      });
  }
  await ledger.schemaReady;
  return ledger.pool;
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toEntry(row: LedgerRow): MediaLedgerEntry {
  return {
    id: row.id,
    sessionIdentity: row.session_identity.trim(),
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    inputSignature: row.input_signature.trim(),
    approvalSignature: row.approval_signature.trim(),
    providerModel: row.provider_model,
    status: row.status,
    providerTaskId: row.provider_task_id,
    providerResult: row.provider_result,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

const STALE_SUBMISSION_ERROR_CODE = "submission_lease_expired";
const STALE_SUBMISSION_ERROR_MESSAGE =
  "The provider submission lease expired without a durable task or result. Reconciliation is required before any retry.";

async function reconcileStaleOwnedSubmissions(
  pool: Pool,
  sessionIdentity: string,
  entryId?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ${TABLE}
     SET status = 'reconciliation_required',
         error_code = $3,
         error_message = $4,
         revision = revision + 1,
         updated_at = now()
     WHERE session_identity = $1
       AND ($2::uuid IS NULL OR id = $2::uuid)
       AND status = 'submitting'
       AND provider_task_id IS NULL
       AND provider_result IS NULL
       AND updated_at <= now() - make_interval(secs => $5)`,
    [
      sessionIdentity,
      entryId ?? null,
      STALE_SUBMISSION_ERROR_CODE,
      STALE_SUBMISSION_ERROR_MESSAGE,
      SUBMISSION_RECONCILIATION_LEASE_SECONDS,
    ],
  );
}

async function currentOwnedEntry(
  pool: Pool,
  entryId: string,
  sessionIdentity: string,
): Promise<MediaLedgerEntry> {
  const current = await pool.query<LedgerRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
     WHERE id = $1 AND session_identity = $2
     LIMIT 1`,
    [entryId, sessionIdentity],
  );
  if (!current.rows[0]) {
    throw new MediaLedgerError(
      "ledger_entry_missing",
      "The media ledger entry no longer exists.",
    );
  }
  return toEntry(current.rows[0]);
}

type MediaSubmissionClaimInput = {
  sessionIdentity: string;
  kind: MediaKind;
  idempotencyKey: string;
  inputSignature: string;
  approvalSignature: string;
  providerModel: string;
};

async function existingIdempotentClaim(
  client: PoolClient,
  input: MediaSubmissionClaimInput,
): Promise<MediaLedgerEntry | null> {
  const existingByKey = await client.query<LedgerRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
     WHERE session_identity = $1 AND idempotency_key = $2
     FOR UPDATE`,
    [input.sessionIdentity, input.idempotencyKey],
  );
  const byKey = existingByKey.rows[0];
  if (!byKey) return null;

  if (
    byKey.kind !== input.kind ||
    byKey.input_signature.trim() !== input.inputSignature ||
    byKey.provider_model !== input.providerModel
  ) {
    throw new MediaLedgerError(
      "idempotency_conflict",
      "This idempotency key is already bound to different paid input.",
    );
  }
  if (
    byKey.status === "submitting" &&
    byKey.provider_task_id === null &&
    byKey.provider_result === null
  ) {
    const reconciled = await client.query<LedgerRow>(
      `UPDATE ${TABLE}
       SET status = 'reconciliation_required',
           error_code = $4,
           error_message = $5,
           revision = revision + 1,
           updated_at = now()
       WHERE id = $1
         AND session_identity = $2
         AND revision = $3
         AND status = 'submitting'
         AND provider_task_id IS NULL
         AND provider_result IS NULL
         AND updated_at <= now() - make_interval(secs => $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        byKey.id,
        input.sessionIdentity,
        Number(byKey.revision),
        STALE_SUBMISSION_ERROR_CODE,
        STALE_SUBMISSION_ERROR_MESSAGE,
        SUBMISSION_RECONCILIATION_LEASE_SECONDS,
      ],
    );
    if (reconciled.rows[0]) return toEntry(reconciled.rows[0]);
  }
  return toEntry(byKey);
}

export async function claimMediaSubmission(
  input: MediaSubmissionClaimInput,
): Promise<{ acquired: boolean; entry: MediaLedgerEntry }> {
  const pool = await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // `schemaReady` is process-cached, but policy drift can occur while a warm
    // function remains alive. Requiring the exact one-policy set inside every
    // new paid-claim transaction prevents a newly-added restrictive policy
    // from permitting claim acquisition while hiding the later result update.
    const runtimePolicy = await client.query<{
      runtime_policy_ready: boolean;
    }>(RUNTIME_POLICY_READY_QUERY);
    if (!runtimePolicy.rows[0]?.runtime_policy_ready) {
      throw new MediaLedgerError(
        "database_unavailable",
        "The durable media ledger policy is not ready.",
      );
    }

    // Idempotent reads are deliberately evaluated before quota enforcement.
    // A caller can always recover its durable result even after a daily limit
    // is exhausted, and a replay never creates another paid provider call.
    const replay = await existingIdempotentClaim(client, input);
    if (replay) {
      await client.query("COMMIT");
      return { acquired: false, entry: replay };
    }

    await client.query(
      "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      [
        PAID_SUBMISSION_QUOTA_LOCK_NAMESPACE,
        PAID_SUBMISSION_GLOBAL_LOCK_KEY,
      ],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock($1::integer, hashtext($2::text))",
      [PAID_SUBMISSION_QUOTA_LOCK_NAMESPACE, input.sessionIdentity],
    );

    // A concurrent first submission may have committed while this transaction
    // waited for the advisory lock. Re-check before reading the quota so that
    // the loser is still treated as a free replay at the limit boundary.
    const concurrentReplay = await existingIdempotentClaim(client, input);
    if (concurrentReplay) {
      await client.query("COMMIT");
      return { acquired: false, entry: concurrentReplay };
    }

    const existingApproval = await client.query<LedgerRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
       WHERE session_identity = $1 AND approval_signature = $2
       FOR UPDATE`,
      [input.sessionIdentity, input.approvalSignature],
    );
    if (existingApproval.rows[0]) {
      throw new MediaLedgerError(
        "approval_reused",
        "This paid approval was already used for another submission.",
      );
    }

    const quota = getPaidSubmissionQuotaConfig();
    const counts = await client.query<PaidSubmissionQuotaRow>(
      `SELECT
         count(*) FILTER (WHERE session_identity = $1)::bigint
           AS identity_count,
         count(*)::bigint AS global_count
       FROM ${TABLE}
       WHERE created_at >= (
         date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
         AT TIME ZONE 'UTC'
       )
         AND created_at < (
           date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
           AT TIME ZONE 'UTC'
         ) + interval '1 day'`,
      [input.sessionIdentity],
    );
    const identityCount = Number(counts.rows[0]?.identity_count ?? 0);
    const globalCount = Number(counts.rows[0]?.global_count ?? 0);
    if (
      !Number.isSafeInteger(identityCount) ||
      !Number.isSafeInteger(globalCount) ||
      identityCount < 0 ||
      globalCount < 0
    ) {
      throw new MediaLedgerError(
        "database_unavailable",
        "The paid submission quota could not be verified.",
      );
    }
    if (
      identityCount >= quota.identityDailyLimit ||
      globalCount >= quota.globalDailyLimit
    ) {
      throw new MediaLedgerError(
        "paid_submission_quota_exceeded",
        "The daily paid generation quota has been reached. Try again after 00:00 UTC.",
      );
    }

    const id = randomUUID();
    const inserted = await client.query<LedgerRow>(
      `INSERT INTO ${TABLE} (
        id, session_identity, kind, idempotency_key, input_signature,
        approval_signature, provider_model, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitting')
      ON CONFLICT DO NOTHING
      RETURNING ${SELECT_COLUMNS}`,
      [
        id,
        input.sessionIdentity,
        input.kind,
        input.idempotencyKey,
        input.inputSignature,
        input.approvalSignature,
        input.providerModel,
      ],
    );
    if (inserted.rows[0]) {
      // Before any paid provider I/O, prove this exact durable claim remains
      // visible and updateable under the current RLS policy. A restrictive
      // drifted UPDATE policy therefore rolls back the claim and fails closed.
      const verifiedClaim = await client.query<LedgerRow>(
        `UPDATE ${TABLE}
         SET revision = revision + 1,
             updated_at = now()
         WHERE id = $1
           AND session_identity = $2
           AND status = 'submitting'
           AND revision = 0
         RETURNING ${SELECT_COLUMNS}`,
        [id, input.sessionIdentity],
      );
      if (!verifiedClaim.rows[0]) {
        throw new MediaLedgerError(
          "database_unavailable",
          "The durable paid-media claim could not be verified.",
        );
      }
      await client.query("COMMIT");
      return { acquired: true, entry: toEntry(verifiedClaim.rows[0]) };
    }

    // This path is defensive for deployments with an older writer that does
    // not yet participate in the advisory-lock protocol.
    const racedReplay = await existingIdempotentClaim(client, input);
    if (racedReplay) {
      await client.query("COMMIT");
      return { acquired: false, entry: racedReplay };
    }
    const racedApproval = await client.query<LedgerRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
       WHERE session_identity = $1 AND approval_signature = $2
       FOR UPDATE`,
      [input.sessionIdentity, input.approvalSignature],
    );
    if (racedApproval.rows[0]) {
      throw new MediaLedgerError(
        "approval_reused",
        "This paid approval was already used for another submission.",
      );
    }
    throw new MediaLedgerError(
      "database_unavailable",
      "The durable media ledger could not reconcile the submission.",
    );
  } catch (error) {
    await rollback(client);
    throw error instanceof MediaLedgerError
      ? error
      : new MediaLedgerError(
          "database_unavailable",
          "The durable media ledger could not claim the submission.",
        );
  } finally {
    client.release();
  }
}

export async function completeMediaSubmission(input: {
  entryId: string;
  sessionIdentity: string;
  expectedStatus: MediaLedgerStatus;
  expectedRevision: number;
  status: Exclude<MediaLedgerStatus, "submitting">;
  providerTaskId?: string | null;
  providerResult?: unknown | null;
}): Promise<MediaLedgerEntry> {
  const pool = await ensureSchema();
  const allowedPriorStatuses = PRIOR_STATUSES[input.status];
  const result = await pool.query<LedgerRow>(
    `UPDATE ${TABLE}
     SET status = $3,
         provider_task_id = COALESCE($4, provider_task_id),
         provider_result = COALESCE($5::jsonb, provider_result),
         error_code = NULL,
         error_message = NULL,
         revision = revision + 1,
         updated_at = now()
     WHERE id = $1
       AND session_identity = $2
       AND status = $6
       AND revision = $7
       AND status = ANY($8::text[])
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.status,
      input.providerTaskId ?? null,
      input.providerResult === undefined
        ? null
        : JSON.stringify(input.providerResult),
      input.expectedStatus,
      input.expectedRevision,
      allowedPriorStatuses,
    ],
  );
  if (!result.rows[0]) {
    return currentOwnedEntry(pool, input.entryId, input.sessionIdentity);
  }
  return toEntry(result.rows[0]);
}

export async function failMediaSubmission(input: {
  entryId: string;
  sessionIdentity: string;
  expectedStatus: MediaLedgerStatus;
  expectedRevision: number;
  status: "failed" | "submit_unknown";
  errorCode: string;
  errorMessage: string;
}): Promise<MediaLedgerEntry> {
  const pool = await ensureSchema();
  const result = await pool.query<LedgerRow>(
    `UPDATE ${TABLE}
     SET status = $3,
         error_code = $4,
         error_message = $5,
         revision = revision + 1,
         updated_at = now()
     WHERE id = $1
       AND session_identity = $2
       AND status = $6
       AND revision = $7
       AND status = ANY($8::text[])
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.status,
      input.errorCode.slice(0, 120),
      input.errorMessage.slice(0, 1_000),
      input.expectedStatus,
      input.expectedRevision,
      PRIOR_STATUSES[input.status],
    ],
  );
  if (!result.rows[0]) {
    return currentOwnedEntry(pool, input.entryId, input.sessionIdentity);
  }
  return toEntry(result.rows[0]);
}

export async function noteMediaLedgerError(input: {
  entryId: string;
  sessionIdentity: string;
  expectedStatus: MediaLedgerStatus;
  expectedRevision: number;
  errorCode: string;
  errorMessage: string;
}): Promise<MediaLedgerEntry> {
  const pool = await ensureSchema();
  const result = await pool.query<LedgerRow>(
    `UPDATE ${TABLE}
     SET error_code = $3,
         error_message = $4,
         updated_at = now()
     WHERE id = $1
       AND session_identity = $2
       AND status = $5
       AND revision = $6
       AND status <> ALL($7::text[])
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.errorCode.slice(0, 120),
      input.errorMessage.slice(0, 1_000),
      input.expectedStatus,
      input.expectedRevision,
      [...TERMINAL_STATUSES],
    ],
  );
  if (!result.rows[0]) {
    return currentOwnedEntry(pool, input.entryId, input.sessionIdentity);
  }
  return toEntry(result.rows[0]);
}

export async function findOwnedVideoTask(
  sessionIdentity: string,
  providerTaskId: string,
): Promise<MediaLedgerEntry | null> {
  const pool = await ensureSchema();
  const result = await pool.query<LedgerRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
     WHERE session_identity = $1
       AND kind = 'video'
       AND provider_task_id = $2
     LIMIT 1`,
    [sessionIdentity, providerTaskId],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export async function listOwnedMediaEntries(
  sessionIdentity: string,
  limit = 50,
): Promise<MediaLedgerEntry[]> {
  const pool = await ensureSchema();
  await reconcileStaleOwnedSubmissions(pool, sessionIdentity);
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const result = await pool.query<LedgerRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
     WHERE session_identity = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionIdentity, safeLimit],
  );
  return result.rows.map(toEntry);
}

export async function findOwnedMediaEntry(
  sessionIdentity: string,
  entryId: string,
): Promise<MediaLedgerEntry | null> {
  const pool = await ensureSchema();
  await reconcileStaleOwnedSubmissions(pool, sessionIdentity, entryId);
  const result = await pool.query<LedgerRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
     WHERE session_identity = $1 AND id = $2
     LIMIT 1`,
    [sessionIdentity, entryId],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

export function publicLedgerEntry(entry: MediaLedgerEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    provider: "newapi" as const,
    model: entry.providerModel,
    inputSignature: entry.inputSignature,
    idempotencyKey: entry.idempotencyKey,
    taskId: entry.providerTaskId,
    hasResult: entry.providerResult !== null,
    error:
      entry.errorCode && entry.errorMessage
        ? { code: entry.errorCode, message: entry.errorMessage }
        : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function publicSubmissionReplay(entry: MediaLedgerEntry) {
  const state =
    entry.providerResult !== null
      ? "result_available"
      : entry.status === "submit_unknown" ||
          entry.status === "reconciliation_required"
        ? "reconciliation_required"
        : isTerminalMediaLedgerStatus(entry.status)
          ? "terminal"
          : "in_progress";
  return {
    state,
    entryId: entry.id,
    status: entry.status,
    taskId: entry.providerTaskId,
    providerRetryAllowed: false,
  } as const;
}
