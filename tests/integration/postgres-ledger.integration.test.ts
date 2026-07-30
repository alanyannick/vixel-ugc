import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool, type DatabaseError } from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  claimMediaSubmission,
  completeMediaSubmission,
  findOwnedMediaEntry,
  findOwnedVideoTask,
  listOwnedMediaEntries,
} from "@/lib/server/ledger";
import { probeMediaLedgerReadiness } from "@/lib/server/database-readiness";

const RUN_INTEGRATION =
  process.env.VIXEL_POSTGRES_INTEGRATION === "1";
const EXPECTED_DATABASE = "vixel_ledger_ci";
const EXPECTED_RUNTIME_USER = "vixel_koc_ci_runtime";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const BASE_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260730114500_create_media_generation_ledger.sql",
);
const HARDENING_MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260730193000_harden_media_generation_ledger.sql",
);

type LedgerTestGlobal = typeof globalThis & {
  __vixelMediaLedger?: {
    databaseUrl: string;
    pool: Pool;
    schemaReady: Promise<void> | null;
  };
};

function guardedIntegrationDatabaseUrl(
  envName: "DATABASE_APP_URL" | "LEDGER_TEST_ADMIN_URL",
  expectedUser: string,
): string {
  const rawUrl = process.env[envName]?.trim();
  if (!rawUrl) {
    throw new Error(
      `${envName} is required for the PostgreSQL ledger integration gate.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${envName} must be a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${envName} must use a PostgreSQL protocol.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      `${envName} must not contain query parameters or a fragment.`,
    );
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "Refusing ledger integration tests outside localhost/loopback.",
    );
  }
  if (decodeURIComponent(parsed.pathname.slice(1)) !== EXPECTED_DATABASE) {
    throw new Error(
      `Refusing ledger integration tests outside ${EXPECTED_DATABASE}.`,
    );
  }
  if (decodeURIComponent(parsed.username) !== expectedUser) {
    throw new Error(
      `${envName} must use the exact ${expectedUser} login.`,
    );
  }

  return rawUrl;
}

function signature(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

async function expectPostgresPermissionDenied(
  operation: Promise<unknown>,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect((error as DatabaseError).code).toBe("42501");
    return;
  }
  throw new Error("Expected PostgreSQL to reject a privileged operation.");
}

describe.skipIf(!RUN_INTEGRATION)(
  "PostgreSQL media ledger integration",
  () => {
    let databaseUrl = "";
    let adminDatabaseUrl = "";
    let runtimePool: Pool;
    let adminPool: Pool;

    beforeAll(async () => {
      databaseUrl = guardedIntegrationDatabaseUrl(
        "DATABASE_APP_URL",
        EXPECTED_RUNTIME_USER,
      );
      adminDatabaseUrl = guardedIntegrationDatabaseUrl(
        "LEDGER_TEST_ADMIN_URL",
        "postgres",
      );
      runtimePool = new Pool({
        connectionString: databaseUrl,
        max: 12,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
        allowExitOnIdle: true,
      });
      adminPool = new Pool({
        connectionString: adminDatabaseUrl,
        max: 2,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
        allowExitOnIdle: true,
      });

      const identity = await runtimePool.query<{
        database_name: string;
        user_name: string;
        is_superuser: boolean;
        can_create_database: boolean;
        can_create_role: boolean;
        bypasses_rls: boolean;
      }>(`
        SELECT
          current_database() AS database_name,
          current_user AS user_name,
          role.rolsuper AS is_superuser,
          role.rolcreatedb AS can_create_database,
          role.rolcreaterole AS can_create_role,
          role.rolbypassrls AS bypasses_rls
        FROM pg_roles role
        WHERE role.rolname = current_user
      `);

      expect(identity.rows[0]).toEqual({
        database_name: EXPECTED_DATABASE,
        user_name: EXPECTED_RUNTIME_USER,
        is_superuser: false,
        can_create_database: false,
        can_create_role: false,
        bypasses_rls: false,
      });
    }, 15_000);

    afterAll(async () => {
      const ledger = (globalThis as LedgerTestGlobal).__vixelMediaLedger;
      if (ledger?.databaseUrl === databaseUrl) {
        await ledger.pool.end().catch(() => undefined);
        delete (globalThis as LedgerTestGlobal).__vixelMediaLedger;
      }
      await runtimePool?.end().catch(() => undefined);
      await adminPool?.end().catch(() => undefined);
    });

    it(
      "matches the checked-in migration shape and revision contract",
      async () => {
        const baseMigrationSql = await readFile(BASE_MIGRATION_PATH, "utf8");
        const hardeningMigrationSql = await readFile(
          HARDENING_MIGRATION_PATH,
          "utf8",
        );
        expect(baseMigrationSql).toContain(
          "create table if not exists vixel_koc.media_generation_ledger",
        );
        expect(baseMigrationSql).not.toContain("revision bigint");
        expect(hardeningMigrationSql).toContain(
          "add column if not exists revision bigint not null default 0",
        );
        expect(baseMigrationSql).toContain(
          "grant select, insert, update",
        );

        const columns = await runtimePool.query<{
          column_name: string;
          data_type: string;
          is_nullable: "YES" | "NO";
          column_default: string | null;
        }>(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'vixel_koc'
            AND table_name = 'media_generation_ledger'
          ORDER BY ordinal_position
        `);

        expect(columns.rows.map((column) => column.column_name)).toEqual([
          "id",
          "session_identity",
          "kind",
          "idempotency_key",
          "input_signature",
          "approval_signature",
          "provider_model",
          "status",
          "provider_task_id",
          "provider_result",
          "error_code",
          "error_message",
          "created_at",
          "updated_at",
          "revision",
        ]);
        expect(
          columns.rows.find((column) => column.column_name === "revision"),
        ).toMatchObject({
          data_type: "bigint",
          is_nullable: "NO",
          column_default: "0",
        });

        const table = await runtimePool.query<{
          row_security: boolean;
          force_row_security: boolean;
        }>(`
          SELECT
            relrowsecurity AS row_security,
            relforcerowsecurity AS force_row_security
          FROM pg_class
          WHERE oid = 'vixel_koc.media_generation_ledger'::regclass
        `);
        expect(table.rows[0]).toEqual({
          row_security: true,
          force_row_security: true,
        });

        const shape = await runtimePool.query<{
          primary_keys: number;
          unique_constraints: number;
          check_constraints: number;
          runtime_role_can_login: boolean;
          runtime_policy_count: number;
        }>(`
          SELECT
            count(*) FILTER (WHERE constraint_type = 'p')::integer
              AS primary_keys,
            count(*) FILTER (WHERE constraint_type = 'u')::integer
              AS unique_constraints,
            count(*) FILTER (WHERE constraint_type = 'c')::integer
              AS check_constraints,
            coalesce(
              (
                SELECT rolcanlogin
                FROM pg_roles
                WHERE rolname = 'vixel_koc_runtime'
              ),
              true
            ) AS runtime_role_can_login,
            (
              SELECT count(*)::integer
              FROM pg_policies
              WHERE schemaname = 'vixel_koc'
                AND tablename = 'media_generation_ledger'
                AND policyname = 'vixel_koc_runtime_server_access'
                AND roles = ARRAY['vixel_koc_runtime']::name[]
                AND cmd = 'ALL'
            ) AS runtime_policy_count
          FROM (
            SELECT constraint_definition.contype AS constraint_type
            FROM pg_constraint constraint_definition
            WHERE constraint_definition.conrelid =
              'vixel_koc.media_generation_ledger'::regclass
          ) constraints
        `);
        expect(shape.rows[0]).toEqual({
          primary_keys: 1,
          unique_constraints: 2,
          check_constraints: 2,
          runtime_role_can_login: false,
          runtime_policy_count: 1,
        });

        const providerTaskIndex = await runtimePool.query<{
          index_definition: string;
        }>(`
          SELECT pg_get_indexdef(index_relation.oid) AS index_definition
          FROM pg_class index_relation
          JOIN pg_namespace index_namespace
            ON index_namespace.oid = index_relation.relnamespace
          WHERE index_namespace.nspname = 'vixel_koc'
            AND index_relation.relname =
              'media_generation_provider_task_unique'
        `);
        expect(providerTaskIndex.rows[0]?.index_definition).toContain(
          "UNIQUE INDEX",
        );
        expect(providerTaskIndex.rows[0]?.index_definition).toContain(
          "WHERE (provider_task_id IS NOT NULL)",
        );

        const quotaIndex = await runtimePool.query<{
          index_definition: string;
        }>(`
          SELECT pg_get_indexdef(index_relation.oid) AS index_definition
          FROM pg_class index_relation
          JOIN pg_namespace index_namespace
            ON index_namespace.oid = index_relation.relnamespace
          WHERE index_namespace.nspname = 'vixel_koc'
            AND index_relation.relname = 'media_generation_created_idx'
        `);
        expect(quotaIndex.rows[0]?.index_definition).toContain(
          "created_at DESC",
        );
      },
      15_000,
    );

    it(
      "fails closed when a restrictive runtime UPDATE policy drifts",
      async () => {
        const policyName = "vixel_koc_ci_deny_runtime_updates";
        const seed = randomUUID();
        const sessionIdentity = signature(`rls-drift-session:${seed}`);
        const idempotencyKey = `image:rls-drift:${seed}`;

        // Prime the process-level schema cache before introducing drift. The
        // claim must still re-check the exact policy set in its transaction.
        await expect(
          findOwnedMediaEntry(sessionIdentity, randomUUID()),
        ).resolves.toBeNull();

        await adminPool.query(
          `CREATE POLICY ${policyName}
           ON vixel_koc.media_generation_ledger
           AS RESTRICTIVE
           FOR UPDATE
           TO vixel_koc_runtime
           USING (revision = 0)
           WITH CHECK (true)`,
        );
        try {
          await expect(
            probeMediaLedgerReadiness({
              env: {
                NODE_ENV: "test",
                DATABASE_APP_URL: databaseUrl,
              },
              cacheTtlMs: 0,
            }),
          ).resolves.toEqual({ status: "not_ready" });

          await expect(
            claimMediaSubmission({
              sessionIdentity,
              kind: "image",
              idempotencyKey,
              inputSignature: signature(`rls-drift-input:${seed}`),
              approvalSignature: signature(`rls-drift-approval:${seed}`),
              providerModel: "image-rls-drift-test",
            }),
          ).rejects.toMatchObject({
            code: "database_unavailable",
          });

          const claims = await adminPool.query<{ count: string }>(
            `SELECT count(*)::bigint AS count
             FROM vixel_koc.media_generation_ledger
             WHERE session_identity = $1
               AND idempotency_key = $2`,
            [sessionIdentity, idempotencyKey],
          );
          expect(claims.rows[0]?.count).toBe("0");
        } finally {
          await adminPool.query(
            `DROP POLICY IF EXISTS ${policyName}
             ON vixel_koc.media_generation_ledger`,
          );
        }
      },
      20_000,
    );

    it(
      "keeps concurrent claims idempotent and protects CAS winners",
      async () => {
        const seed = randomUUID();
        const sessionIdentity = signature(`session:${seed}`);
        const inputSignature = signature(`input:${seed}`);
        const approvalSignature = signature(`approval:${seed}`);
        const idempotencyKey = `video:integration:${seed}`;
        const providerTaskId = `task_integration_${seed.replaceAll("-", "")}`;
        const claimInput = {
          sessionIdentity,
          kind: "video" as const,
          idempotencyKey,
          inputSignature,
          approvalSignature,
          providerModel: "veo-ledger-integration",
        };

        const claims = await Promise.all(
          Array.from({ length: 12 }, () =>
            claimMediaSubmission(claimInput),
          ),
        );
        expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
        expect(new Set(claims.map((claim) => claim.entry.id)).size).toBe(1);
        expect(
          new Set(claims.map((claim) => claim.entry.revision)),
        ).toEqual(new Set([1]));

        const claimed = claims[0].entry;
        expect(claimed).toMatchObject({
          status: "submitting",
          revision: 1,
        });

        await expect(
          claimMediaSubmission({
            ...claimInput,
            inputSignature: signature(`different:${seed}`),
          }),
        ).rejects.toMatchObject({
          code: "idempotency_conflict",
        });

        await expect(
          claimMediaSubmission({
            ...claimInput,
            idempotencyKey: `video:integration:reused:${seed}`,
          }),
        ).rejects.toMatchObject({
          code: "approval_reused",
        });

        const submitted = await completeMediaSubmission({
          entryId: claimed.id,
          sessionIdentity,
          expectedStatus: "submitting",
          expectedRevision: 1,
          status: "submitted",
          providerTaskId,
        });
        expect(submitted).toMatchObject({
          status: "submitted",
          revision: 2,
          providerTaskId,
        });

        const candidates = [
          { source: "poll-a", progress: 20 },
          { source: "poll-b", progress: 40 },
        ];
        const competingUpdates = await Promise.all(
          candidates.map((providerResult) =>
            completeMediaSubmission({
              entryId: claimed.id,
              sessionIdentity,
              expectedStatus: "submitted",
              expectedRevision: 2,
              status: "processing",
              providerTaskId,
              providerResult,
            }),
          ),
        );
        expect(
          new Set(competingUpdates.map((entry) => entry.revision)),
        ).toEqual(new Set([3]));
        expect(
          new Set(
            competingUpdates.map((entry) =>
              JSON.stringify(entry.providerResult),
            ),
          ).size,
        ).toBe(1);

        const staleFailure = await completeMediaSubmission({
          entryId: claimed.id,
          sessionIdentity,
          expectedStatus: "submitted",
          expectedRevision: 2,
          status: "failed",
          providerResult: { source: "stale-provider-response" },
        });
        expect(staleFailure).toMatchObject({
          status: "processing",
          revision: 3,
        });

        const succeeded = await completeMediaSubmission({
          entryId: claimed.id,
          sessionIdentity,
          expectedStatus: "processing",
          expectedRevision: 3,
          status: "succeeded",
          providerTaskId,
          providerResult: {
            source: "winner",
            progress: 100,
            url: "https://cdn.example.test/integration.mp4",
          },
        });
        expect(succeeded).toMatchObject({
          status: "succeeded",
          revision: 4,
          providerResult: {
            source: "winner",
            progress: 100,
          },
        });

        const byId = await findOwnedMediaEntry(
          sessionIdentity,
          claimed.id,
        );
        const byTask = await findOwnedVideoTask(
          sessionIdentity,
          providerTaskId,
        );
        const listed = await listOwnedMediaEntries(sessionIdentity, 5);
        const otherSession = await findOwnedMediaEntry(
          signature(`other:${seed}`),
          claimed.id,
        );

        expect(byId).toMatchObject({
          id: claimed.id,
          status: "succeeded",
          revision: 4,
        });
        expect(byTask?.id).toBe(claimed.id);
        expect(listed.map((entry) => entry.id)).toContain(claimed.id);
        expect(otherSession).toBeNull();
      },
      30_000,
    );

    it(
      "allows only SELECT, INSERT, and UPDATE for the runtime login",
      async () => {
        const privileges = await runtimePool.query<{
          schema_usage: boolean;
          schema_create: boolean;
          can_select: boolean;
          can_insert: boolean;
          can_update: boolean;
          can_delete: boolean;
        }>(`
          SELECT
            has_schema_privilege(
              current_user,
              'vixel_koc',
              'USAGE'
            ) AS schema_usage,
            has_schema_privilege(
              current_user,
              'vixel_koc',
              'CREATE'
            ) AS schema_create,
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
            has_table_privilege(
              current_user,
              'vixel_koc.media_generation_ledger',
              'DELETE'
            ) AS can_delete
        `);
        expect(privileges.rows[0]).toEqual({
          schema_usage: true,
          schema_create: false,
          can_select: true,
          can_insert: true,
          can_update: true,
          can_delete: false,
        });

        const seed = randomUUID();
        const id = randomUUID();
        const sessionIdentity = signature(`permission-session:${seed}`);
        const inserted = await runtimePool.query<{
          id: string;
          revision: string;
        }>(
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
            id,
            sessionIdentity,
            `image:permission:${seed}`,
            signature(`permission-input:${seed}`),
            signature(`permission-approval:${seed}`),
            "image-ledger-integration",
          ],
        );
        expect(inserted.rows[0]).toEqual({ id, revision: "0" });

        const updated = await runtimePool.query<{
          id: string;
          status: string;
          revision: string;
        }>(
          `UPDATE vixel_koc.media_generation_ledger
           SET status = 'submitted',
               revision = revision + 1,
               updated_at = now()
           WHERE id = $1
           RETURNING id, status, revision`,
          [id],
        );
        expect(updated.rows[0]).toEqual({
          id,
          status: "submitted",
          revision: "1",
        });

        const selected = await runtimePool.query<{ id: string }>(
          `SELECT id
           FROM vixel_koc.media_generation_ledger
           WHERE id = $1`,
          [id],
        );
        expect(selected.rows[0]?.id).toBe(id);

        await expectPostgresPermissionDenied(
          runtimePool.query(
            `DELETE FROM vixel_koc.media_generation_ledger WHERE id = $1`,
            [id],
          ),
        );
        await expectPostgresPermissionDenied(
          runtimePool.query(
            "CREATE TABLE vixel_koc.runtime_must_not_create (id integer)",
          ),
        );
      },
      15_000,
    );
  },
);
