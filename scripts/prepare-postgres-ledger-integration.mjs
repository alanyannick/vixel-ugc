import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const EXPECTED_DATABASE = "vixel_ledger_ci";
const EXPECTED_ADMIN_USER = "postgres";
const RUNTIME_LOGIN = "vixel_koc_ci_runtime";
const DEFAULT_RUNTIME_PASSWORD = "vixel-ledger-ci-runtime-only";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const BASE_MIGRATION_URL = new URL(
  "../supabase/migrations/20260730114500_create_media_generation_ledger.sql",
  import.meta.url,
);
const HARDENING_MIGRATION_URL = new URL(
  "../supabase/migrations/20260730193000_harden_media_generation_ledger.sql",
  import.meta.url,
);
const UPGRADE_SENTINEL_ID = "00000000-0000-4000-8000-000000000001";

function fail(message) {
  throw new Error(`[postgres-ledger-setup] ${message}`);
}

function validateLocalTestUrl(rawUrl, label, expectedUser) {
  if (!rawUrl) fail(`${label} is required.`);

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail(`${label} must use the postgres or postgresql protocol.`);
  }
  if (parsed.search || parsed.hash) {
    fail(`${label} must not contain query parameters or a fragment.`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    fail(`${label} must use a literal loopback host or localhost.`);
  }
  if (decodeURIComponent(parsed.pathname.slice(1)) !== EXPECTED_DATABASE) {
    fail(`${label} must target the exact database ${EXPECTED_DATABASE}.`);
  }
  if (decodeURIComponent(parsed.username) !== expectedUser) {
    fail(`${label} must authenticate as ${expectedUser}.`);
  }

  return parsed;
}

const adminUrl = process.env.LEDGER_TEST_ADMIN_URL?.trim();
const runtimePassword =
  process.env.LEDGER_TEST_RUNTIME_PASSWORD?.trim() ||
  DEFAULT_RUNTIME_PASSWORD;

validateLocalTestUrl(
  adminUrl,
  "LEDGER_TEST_ADMIN_URL",
  EXPECTED_ADMIN_USER,
);
if (runtimePassword.length < 16) {
  fail("LEDGER_TEST_RUNTIME_PASSWORD must contain at least 16 characters.");
}

const baseMigrationSql = await readFile(BASE_MIGRATION_URL, "utf8");
const hardeningMigrationSql = await readFile(HARDENING_MIGRATION_URL, "utf8");
if (
  !baseMigrationSql.includes(
    "create table if not exists vixel_koc.media_generation_ledger",
  ) ||
  baseMigrationSql.includes("revision bigint") ||
  !hardeningMigrationSql.includes(
    "add column if not exists revision bigint not null default 0",
  ) ||
  !baseMigrationSql.includes("create role vixel_koc_runtime nologin")
) {
  fail(
    "The checked-in base and incremental migrations do not preserve the ledger upgrade contract.",
  );
}

const client = new Client({ connectionString: adminUrl });

try {
  await client.connect();

  const identity = await client.query(`
    SELECT
      current_database() AS database_name,
      current_user AS user_name,
      current_setting('server_version_num')::integer AS server_version_num
  `);
  const databaseIdentity = identity.rows[0];
  if (
    databaseIdentity?.database_name !== EXPECTED_DATABASE ||
    databaseIdentity?.user_name !== EXPECTED_ADMIN_USER
  ) {
    fail("The connected database identity did not match the isolated CI target.");
  }
  if (Number(databaseIdentity.server_version_num) < 150000) {
    fail("PostgreSQL 15 or newer is required for the ledger integration gate.");
  }

  // The checked-in Supabase migration revokes these platform roles. Vanilla
  // PostgreSQL CI images do not include them, so create inert NOLOGIN stand-ins.
  await client.query(`
    DO $bootstrap$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
      ) THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END
    $bootstrap$;
  `);

  const ledgerBeforeSetup = await client.query(
    "SELECT to_regclass('vixel_koc.media_generation_ledger') AS ledger",
  );
  const isFreshDatabase = ledgerBeforeSetup.rows[0]?.ledger === null;

  await client.query(baseMigrationSql);

  if (isFreshDatabase) {
    const preUpgradeShape = await client.query(`
      SELECT count(*)::integer AS revision_columns
      FROM information_schema.columns
      WHERE table_schema = 'vixel_koc'
        AND table_name = 'media_generation_ledger'
        AND column_name = 'revision'
    `);
    if (preUpgradeShape.rows[0]?.revision_columns !== 0) {
      fail("The immutable base migration unexpectedly includes revision.");
    }

    await client.query(
      `INSERT INTO vixel_koc.media_generation_ledger (
         id,
         session_identity,
         kind,
         idempotency_key,
         input_signature,
         approval_signature,
         provider_model,
         status
       ) VALUES ($1, $2, 'image', $3, $4, $5, $6, 'submitting')`,
      [
        UPGRADE_SENTINEL_ID,
        "a".repeat(64),
        "upgrade-sentinel",
        "b".repeat(64),
        "c".repeat(64),
        "upgrade-contract-model",
      ],
    );
  }

  await client.query(hardeningMigrationSql);

  if (isFreshDatabase) {
    const upgradedSentinel = await client.query(
      `SELECT revision
       FROM vixel_koc.media_generation_ledger
       WHERE id = $1`,
      [UPGRADE_SENTINEL_ID],
    );
    if (
      upgradedSentinel.rows.length !== 1 ||
      Number(upgradedSentinel.rows[0].revision) !== 0
    ) {
      fail("The incremental migration did not preserve an existing ledger row.");
    }
  }

  // The URL guard above makes this safe only for the dedicated local CI
  // database. Reset test claims so repeated local runs cannot inherit quota
  // counters or idempotency rows from an earlier run.
  await client.query("TRUNCATE TABLE vixel_koc.media_generation_ledger");

  await client.query(`
    DO $bootstrap$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_LOGIN}'
      ) THEN
        CREATE ROLE ${RUNTIME_LOGIN}
          LOGIN
          INHERIT
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOREPLICATION;
      END IF;
    END
    $bootstrap$;
  `);

  const passwordStatement = await client.query(
    `SELECT format(
       'ALTER ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
       $1::text,
       $2::text
     ) AS sql`,
    [RUNTIME_LOGIN, runtimePassword],
  );
  await client.query(passwordStatement.rows[0].sql);
  await client.query(`GRANT vixel_koc_runtime TO ${RUNTIME_LOGIN}`);

  const baseMigrationDigest = createHash("sha256")
    .update(baseMigrationSql)
    .digest("hex");
  const hardeningMigrationDigest = createHash("sha256")
    .update(hardeningMigrationSql)
    .digest("hex");

  process.stdout.write(
    [
      `Prepared ${EXPECTED_DATABASE} with PostgreSQL ${databaseIdentity.server_version_num}.`,
      `Applied ${fileURLToPath(BASE_MIGRATION_URL)} (sha256:${baseMigrationDigest}).`,
      `Applied ${fileURLToPath(HARDENING_MIGRATION_URL)} (sha256:${hardeningMigrationDigest}).`,
      isFreshDatabase
        ? "Verified base-to-incremental upgrade row preservation."
        : "Re-applied idempotent migrations to an existing isolated test ledger.",
      `Runtime login ${RUNTIME_LOGIN} inherits vixel_koc_runtime.`,
    ].join("\n") + "\n",
  );
} finally {
  await client.end().catch(() => undefined);
}
