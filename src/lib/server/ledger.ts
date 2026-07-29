import { randomUUID } from "node:crypto";

import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";

import type { MediaKind } from "./approval";
import { getServerRuntimeConfig } from "./env";

export type MediaLedgerStatus =
  | "submitting"
  | "submitted"
  | "processing"
  | "succeeded"
  | "failed"
  | "submit_unknown";

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
  created_at: Date | string;
  updated_at: Date | string;
};

export class MediaLedgerError extends Error {
  constructor(
    readonly code:
      | "database_not_configured"
      | "database_unavailable"
      | "idempotency_conflict"
      | "approval_reused"
      | "ledger_entry_missing",
    message: string,
  ) {
    super(message);
    this.name = "MediaLedgerError";
  }
}

const TABLE = "vixel_media_generation_ledger";
const SELECT_COLUMNS = `
  id, session_identity, kind, idempotency_key, input_signature,
  approval_signature, provider_model, status, provider_task_id,
  provider_result, error_code, error_message, created_at, updated_at
`;

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
      .query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          id uuid PRIMARY KEY,
          session_identity char(64) NOT NULL,
          kind text NOT NULL CHECK (kind IN ('image', 'video')),
          idempotency_key varchar(128) NOT NULL,
          input_signature char(64) NOT NULL,
          approval_signature char(64) NOT NULL,
          provider_model varchar(240) NOT NULL,
          status text NOT NULL CHECK (
            status IN (
              'submitting', 'submitted', 'processing', 'succeeded',
              'failed', 'submit_unknown'
            )
          ),
          provider_task_id varchar(128),
          provider_result jsonb,
          error_code varchar(120),
          error_message varchar(1000),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (session_identity, idempotency_key),
          UNIQUE (session_identity, approval_signature)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS
          vixel_media_generation_provider_task_unique
          ON ${TABLE} (provider_task_id)
          WHERE provider_task_id IS NOT NULL;
      `)
      .then(() => undefined)
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
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export async function claimMediaSubmission(input: {
  sessionIdentity: string;
  kind: MediaKind;
  idempotencyKey: string;
  inputSignature: string;
  approvalSignature: string;
  providerModel: string;
}): Promise<{ acquired: boolean; entry: MediaLedgerEntry }> {
  const pool = await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
      await client.query("COMMIT");
      return { acquired: true, entry: toEntry(inserted.rows[0]) };
    }

    const existingByKey = await client.query<LedgerRow>(
      `SELECT ${SELECT_COLUMNS} FROM ${TABLE}
       WHERE session_identity = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [input.sessionIdentity, input.idempotencyKey],
    );
    const byKey = existingByKey.rows[0];
    if (byKey) {
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
      await client.query("COMMIT");
      return { acquired: false, entry: toEntry(byKey) };
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
  status: Exclude<MediaLedgerStatus, "submitting">;
  providerTaskId?: string | null;
  providerResult?: unknown | null;
}): Promise<MediaLedgerEntry> {
  const pool = await ensureSchema();
  const result = await pool.query<LedgerRow>(
    `UPDATE ${TABLE}
     SET status = $3,
         provider_task_id = COALESCE($4, provider_task_id),
         provider_result = COALESCE($5::jsonb, provider_result),
         error_code = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1 AND session_identity = $2
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.status,
      input.providerTaskId ?? null,
      input.providerResult === undefined
        ? null
        : JSON.stringify(input.providerResult),
    ],
  );
  if (!result.rows[0]) {
    throw new MediaLedgerError(
      "ledger_entry_missing",
      "The media ledger entry no longer exists.",
    );
  }
  return toEntry(result.rows[0]);
}

export async function failMediaSubmission(input: {
  entryId: string;
  sessionIdentity: string;
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
         updated_at = now()
     WHERE id = $1 AND session_identity = $2
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.status,
      input.errorCode.slice(0, 120),
      input.errorMessage.slice(0, 1_000),
    ],
  );
  if (!result.rows[0]) {
    throw new MediaLedgerError(
      "ledger_entry_missing",
      "The media ledger entry no longer exists.",
    );
  }
  return toEntry(result.rows[0]);
}

export async function noteMediaLedgerError(input: {
  entryId: string;
  sessionIdentity: string;
  errorCode: string;
  errorMessage: string;
}): Promise<MediaLedgerEntry> {
  const pool = await ensureSchema();
  const result = await pool.query<LedgerRow>(
    `UPDATE ${TABLE}
     SET error_code = $3,
         error_message = $4,
         updated_at = now()
     WHERE id = $1 AND session_identity = $2
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.entryId,
      input.sessionIdentity,
      input.errorCode.slice(0, 120),
      input.errorMessage.slice(0, 1_000),
    ],
  );
  if (!result.rows[0]) {
    throw new MediaLedgerError(
      "ledger_entry_missing",
      "The media ledger entry no longer exists.",
    );
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
