import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SETUP_SCRIPT = resolve(
  process.cwd(),
  "scripts/prepare-postgres-ledger-integration.mjs",
);
const POLICY_CONTRACT_MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260730213000_restore_media_ledger_policy_contract.sql",
);

describe("PostgreSQL ledger destructive-script guard", () => {
  it("rejects URL parameters that could override the validated authority", () => {
    const result = spawnSync(process.execPath, [SETUP_SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env,
        LEDGER_TEST_ADMIN_URL:
          "postgresql://postgres:dummy@127.0.0.1:5432/vixel_ledger_ci?host=remote.example.test&user=other",
        LEDGER_TEST_RUNTIME_PASSWORD: "vixel-ledger-ci-runtime-only",
      },
      timeout: 5_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "must not contain query parameters or a fragment",
    );
  });

  it("keeps the media ledger on its single reviewed runtime role", async () => {
    const migration = await readFile(POLICY_CONTRACT_MIGRATION, "utf8");

    expect(migration).toContain(
      "from vixel_ugc_runtime",
    );
    expect(migration).toContain(
      "drop policy if exists vixel_ugc_runtime_media_access",
    );
    expect(migration).toContain(
      "comment on policy vixel_koc_runtime_server_access",
    );
  });
});
