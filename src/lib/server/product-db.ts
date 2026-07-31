import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

const EXPECTED_TABLES = [
  "user_profiles",
  "waitlist_entries",
  "email_preferences",
  "campaign_snapshots",
  "email_delivery_ledger",
  "subscriptions",
  "provider_webhook_events",
  "audit_events",
] as const;

export class ProductDatabaseError extends Error {
  constructor(
    readonly code: "database_not_configured" | "database_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ProductDatabaseError";
  }
}

export type ProductDatabaseReadiness =
  | { status: "ready" }
  | { status: "not_configured" }
  | { status: "not_ready" };

type ProductDatabaseGlobal = {
  databaseUrl: string;
  pool: Pool;
  ready: Promise<void> | null;
};

const productDatabaseGlobal = globalThis as typeof globalThis & {
  __vixelProductDatabase?: ProductDatabaseGlobal;
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
      // Continue to the next configured connection.
    }
  }
  return null;
}

function state(): ProductDatabaseGlobal {
  const url = databaseUrl();
  if (!url) {
    throw new ProductDatabaseError(
      "database_not_configured",
      "The Vixel UGC product database is not configured.",
    );
  }
  if (
    !productDatabaseGlobal.__vixelProductDatabase?.pool ||
    productDatabaseGlobal.__vixelProductDatabase.databaseUrl !== url
  ) {
    productDatabaseGlobal.__vixelProductDatabase = {
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
      ready: null,
    };
  }
  return productDatabaseGlobal.__vixelProductDatabase;
}

async function ensureReady(): Promise<Pool> {
  const database = state();
  if (!database.ready) {
    const tableNames = EXPECTED_TABLES.map(
      (name) => `vixel_ugc.${name}`,
    );
    database.ready = database.pool
      .query<{ runtime_ready: boolean }>(
        `
          SELECT
            has_schema_privilege(current_user, 'vixel_ugc', 'USAGE')
            AND NOT has_schema_privilege(current_user, 'vixel_ugc', 'CREATE')
            AND pg_has_role(current_user, 'vixel_ugc_runtime', 'USAGE')
            AND EXISTS (
              SELECT 1
              FROM pg_catalog.pg_roles
              WHERE rolname = current_user
                AND NOT rolsuper
                AND NOT rolcreatedb
                AND NOT rolcreaterole
                AND NOT rolbypassrls
            )
            AND (
              SELECT count(*) = $1
              FROM pg_catalog.pg_class relation
              JOIN pg_catalog.pg_namespace namespace
                ON namespace.oid = relation.relnamespace
              WHERE namespace.nspname = 'vixel_ugc'
                AND relation.relname = ANY($2::text[])
                AND relation.relrowsecurity
                AND relation.relforcerowsecurity
            )
            AND (
              SELECT count(*) = $1
              FROM pg_catalog.pg_policies
              WHERE schemaname = 'vixel_ugc'
                AND tablename = ANY($2::text[])
                AND policyname = 'vixel_ugc_runtime_server_access'
                AND permissive = 'PERMISSIVE'
                AND cmd = 'ALL'
                AND roles = ARRAY['vixel_ugc_runtime']::name[]
                AND qual = 'true'
                AND with_check = 'true'
            )
            AND (
              SELECT bool_and(
                has_table_privilege(current_user, relation_name, 'SELECT')
                AND has_table_privilege(current_user, relation_name, 'INSERT')
              )
              FROM unnest($3::text[]) relation_name
            )
            AS runtime_ready
        `,
        [EXPECTED_TABLES.length, [...EXPECTED_TABLES], tableNames],
      )
      .then((result) => {
        if (!result.rows[0]?.runtime_ready) {
          throw new Error(
            "The database login does not have the expected Vixel UGC runtime boundary.",
          );
        }
      })
      .catch(() => {
        database.ready = null;
        throw new ProductDatabaseError(
          "database_unavailable",
          "The Vixel UGC product database is unavailable.",
        );
      });
  }
  await database.ready;
  return database.pool;
}

export async function productQuery<Row extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<Row>> {
  const pool = await ensureReady();
  try {
    return await pool.query<Row>(text, values);
  } catch {
    throw new ProductDatabaseError(
      "database_unavailable",
      "The Vixel UGC product database query failed.",
    );
  }
}

/**
 * Reuses the product runtime-boundary verification performed by ensureReady
 * and exposes only a secret-free readiness state to the health endpoint.
 */
export async function probeProductDatabaseReadiness(): Promise<ProductDatabaseReadiness> {
  if (!databaseUrl()) return { status: "not_configured" };
  try {
    const pool = await ensureReady();
    const result = await pool.query<{ ready: number }>("SELECT 1 AS ready");
    return result.rows[0]?.ready === 1
      ? { status: "ready" }
      : { status: "not_ready" };
  } catch {
    return { status: "not_ready" };
  }
}

export async function withProductTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await ensureReady();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof ProductDatabaseError) throw error;
    throw error;
  } finally {
    client.release();
  }
}

export function installProductPoolForTests(
  pool: Pool | null,
  databaseUrlForTest = "postgres://product.test/vixel",
): void {
  productDatabaseGlobal.__vixelProductDatabase = pool
    ? {
        databaseUrl: databaseUrlForTest,
        pool,
        ready: Promise.resolve(),
      }
    : undefined;
}
