import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SETUP_SCRIPT = resolve(
  process.cwd(),
  "scripts/prepare-postgres-ledger-integration.mjs",
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
});
