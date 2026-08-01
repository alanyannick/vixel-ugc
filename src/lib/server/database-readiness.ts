import { createHash, randomUUID } from "node:crypto";

import { Client, type ClientConfig } from "pg";

const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const MIN_PROBE_TIMEOUT_MS = 250;
const MAX_PROBE_TIMEOUT_MS = 5_000;
const DEFAULT_PROBE_CACHE_TTL_MS = 15_000;
const MAX_PROBE_CACHE_TTL_MS = 60_000;

const LEDGER_ACCESS_QUERY = `
  SELECT
    to_regnamespace('vixel_koc') IS NOT NULL AS schema_exists,
    to_regclass('vixel_koc.media_generation_ledger') IS NOT NULL AS table_exists,
    has_schema_privilege(current_user, 'vixel_koc', 'USAGE') AS schema_usage,
    has_table_privilege(
      current_user,
      'vixel_koc.media_generation_ledger',
      'SELECT'
    ) AS can_select,
    has_table_privilege(
      current_user,
      'vixel_koc.media_generation_ledger',
      'INSERT'
    ) AS can_insert,
    has_table_privilege(
      current_user,
      'vixel_koc.media_generation_ledger',
      'UPDATE'
    ) AS can_update,
    NOT has_table_privilege(
      current_user,
      'vixel_koc.media_generation_ledger',
      'DELETE'
    ) AS delete_denied,
    NOT has_schema_privilege(
      current_user,
      'vixel_koc',
      'CREATE'
    ) AS schema_create_denied,
    pg_has_role(current_user, 'vixel_koc_runtime', 'USAGE') AS runtime_role,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = current_user
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolbypassrls
    ) AS runtime_role_restricted,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'vixel_koc'
        AND relation.relname = 'media_generation_ledger'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
    ) AS row_security_ready,
    EXISTS (
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
    ) = 1 AS runtime_policy_exists
`;

const LEDGER_SHAPE_QUERY = `
  SELECT
    id,
    session_identity,
    account_user_id,
    kind,
    idempotency_key,
    input_signature,
    approval_signature,
    provider_model,
    status,
    provider_task_id,
    provider_result,
    error_code,
    error_message,
    revision,
    created_at,
    updated_at
  FROM vixel_koc.media_generation_ledger
  LIMIT 0
`;

type LedgerAccessRow = {
  schema_exists: boolean;
  table_exists: boolean;
  schema_usage: boolean;
  can_select: boolean;
  can_insert: boolean;
  can_update: boolean;
  delete_denied: boolean;
  schema_create_denied: boolean;
  runtime_role: boolean;
  runtime_role_restricted: boolean;
  row_security_ready: boolean;
  runtime_policy_exists: boolean;
};

type ProbeQueryResult = {
  rows: unknown[];
};

type ReadinessClient = {
  connect(): Promise<void>;
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<ProbeQueryResult>;
  end(): Promise<void>;
};

type ReadinessClientFactory = (config: ClientConfig) => ReadinessClient;

export type MediaLedgerReadiness =
  | { status: "ready" }
  | { status: "not_configured" }
  | { status: "not_ready" };

export type MediaLedgerProbeOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  createClient?: ReadinessClientFactory;
  cacheTtlMs?: number;
};

type ReadinessCacheEntry = {
  result: MediaLedgerReadiness | null;
  expiresAt: number;
  inFlight: Promise<MediaLedgerReadiness> | null;
};

type ReadinessGlobal = typeof globalThis & {
  __vixelLedgerReadiness?: Map<string, ReadinessCacheEntry>;
};

const readinessGlobal = globalThis as ReadinessGlobal;

function configuredDatabaseUrl(env: NodeJS.ProcessEnv): string | null {
  for (const candidate of [
    env.DATABASE_APP_URL,
    env.DATABASE_URL,
  ]) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (["postgres:", "postgresql:"].includes(parsed.protocol)) {
        return value;
      }
    } catch {
      // Continue to a valid fallback connection string when available.
    }
  }
  return null;
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PROBE_TIMEOUT_MS;
  return Math.max(
    MIN_PROBE_TIMEOUT_MS,
    Math.min(Math.trunc(value ?? DEFAULT_PROBE_TIMEOUT_MS), MAX_PROBE_TIMEOUT_MS),
  );
}

function boundedCacheTtl(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PROBE_CACHE_TTL_MS;
  return Math.max(
    0,
    Math.min(
      Math.trunc(value ?? DEFAULT_PROBE_CACHE_TTL_MS),
      MAX_PROBE_CACHE_TTL_MS,
    ),
  );
}

function defaultClientFactory(config: ClientConfig): ReadinessClient {
  const client = new Client(config);
  return {
    connect: async () => {
      await client.connect();
    },
    query: async (text, values) => {
      const result = await client.query(text, values as unknown[]);
      return { rows: result.rows };
    },
    end: () => client.end(),
  };
}

function hasRequiredAccess(row: unknown): row is LedgerAccessRow {
  if (!row || typeof row !== "object") return false;
  const access = row as Partial<LedgerAccessRow>;
  return [
    access.schema_exists,
    access.table_exists,
    access.schema_usage,
    access.can_select,
    access.can_insert,
    access.can_update,
    access.delete_denied,
    access.schema_create_denied,
    access.runtime_role,
    access.runtime_role_restricted,
    access.row_security_ready,
    access.runtime_policy_exists,
  ].every((value) => value === true);
}

/**
 * Proves that RLS still permits the exact INSERT -> SELECT -> UPDATE sequence
 * required before a paid provider call. The probe is fully rolled back.
 */
export async function verifyMediaLedgerRuntimeMutation(
  client: Pick<ReadinessClient, "query">,
): Promise<void> {
  const probeId = randomUUID();
  const probeSeed = createHash("sha256")
    .update(`vixel-ledger-readiness:${probeId}`)
    .digest("hex");
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const inserted = await client.query(
      `INSERT INTO vixel_koc.media_generation_ledger (
         id,
         session_identity,
         kind,
         idempotency_key,
         input_signature,
         approval_signature,
         provider_model,
         status
       ) VALUES ($1, $2, 'image', $3, $4, $5, $6, 'submitting')
       RETURNING id, revision`,
      [
        probeId,
        probeSeed,
        `health:${probeId}`,
        probeSeed,
        createHash("sha256").update(`approval:${probeId}`).digest("hex"),
        "ledger-readiness-probe",
      ],
    );
    const insertedRow = inserted.rows[0] as
      | { id?: unknown; revision?: unknown }
      | undefined;
    if (
      insertedRow?.id !== probeId ||
      Number(insertedRow.revision) !== 0
    ) {
      throw new Error("The ledger INSERT capability probe did not persist.");
    }

    const selected = await client.query(
      `SELECT id, revision
       FROM vixel_koc.media_generation_ledger
       WHERE id = $1`,
      [probeId],
    );
    const selectedRow = selected.rows[0] as
      | { id?: unknown; revision?: unknown }
      | undefined;
    if (
      selectedRow?.id !== probeId ||
      Number(selectedRow.revision) !== 0
    ) {
      throw new Error("The ledger SELECT capability probe was hidden by RLS.");
    }

    const updated = await client.query(
      `UPDATE vixel_koc.media_generation_ledger
       SET revision = revision + 1,
           updated_at = now()
       WHERE id = $1
         AND revision = 0
       RETURNING id, revision`,
      [probeId],
    );
    const updatedRow = updated.rows[0] as
      | { id?: unknown; revision?: unknown }
      | undefined;
    if (
      updatedRow?.id !== probeId ||
      Number(updatedRow.revision) !== 1
    ) {
      throw new Error("The ledger UPDATE capability probe was blocked by RLS.");
    }
  } finally {
    if (transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  }
}

/**
 * Performs a live readiness probe against the runtime ledger. Its capability
 * row is transactional and always rolled back, so no health data is retained.
 *
 * The result intentionally contains no connection or database error details:
 * `/api/health` is public, while database diagnostics belong in private logs.
 */
async function runMediaLedgerReadinessProbe(
  databaseUrl: string,
  options: MediaLedgerProbeOptions = {},
): Promise<MediaLedgerReadiness> {
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const client = (options.createClient ?? defaultClientFactory)({
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    query_timeout: timeoutMs,
    application_name: "vixel-health-readiness",
  });

  try {
    await client.connect();
    const accessResult = await client.query(LEDGER_ACCESS_QUERY);
    if (!hasRequiredAccess(accessResult.rows[0])) {
      return { status: "not_ready" };
    }

    // This validates that the runtime role can resolve and select every column
    // the application ledger depends on without reading any customer rows.
    await client.query(LEDGER_SHAPE_QUERY);
    await verifyMediaLedgerRuntimeMutation(client);
    return { status: "ready" };
  } catch {
    return { status: "not_ready" };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function probeMediaLedgerReadiness(
  options: MediaLedgerProbeOptions = {},
): Promise<MediaLedgerReadiness> {
  const databaseUrl = configuredDatabaseUrl(options.env ?? process.env);
  if (!databaseUrl) return { status: "not_configured" };

  // Custom clients default to no cache so unit tests and private diagnostics
  // always exercise the supplied connection. The public health path uses a
  // short process-local cache and coalesces concurrent probes.
  const cacheTtlMs = boundedCacheTtl(
    options.cacheTtlMs ??
      (options.createClient ? 0 : DEFAULT_PROBE_CACHE_TTL_MS),
  );
  if (cacheTtlMs === 0) {
    return runMediaLedgerReadinessProbe(databaseUrl, options);
  }

  const cacheKey = createHash("sha256").update(databaseUrl).digest("hex");
  const cache =
    readinessGlobal.__vixelLedgerReadiness ??
    (readinessGlobal.__vixelLedgerReadiness = new Map());
  const now = Date.now();
  const existing = cache.get(cacheKey);
  if (existing?.result && existing.expiresAt > now) {
    return existing.result;
  }
  if (existing?.inFlight) return existing.inFlight;

  const entry: ReadinessCacheEntry = existing ?? {
    result: null,
    expiresAt: 0,
    inFlight: null,
  };
  const inFlight = runMediaLedgerReadinessProbe(databaseUrl, options).then(
    (result) => {
      entry.result = result;
      entry.expiresAt = Date.now() + cacheTtlMs;
      entry.inFlight = null;
      return result;
    },
  );
  entry.inFlight = inFlight;
  cache.set(cacheKey, entry);
  return inFlight;
}
