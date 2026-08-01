import type { PoolClient } from "pg";

import type { AccountStatus, AppRole } from "./auth";

export type LockedAdminActor = {
  user_id: string;
  account_status: AccountStatus;
  app_role: AppRole;
};

/**
 * Serializes account-affecting admin mutations and rechecks the actor against
 * the database after acquiring the lock. Bootstrap IDs are intentionally not
 * consulted here: authorizeAccount also relies on the persisted role that
 * ensureAccountProfile grants to a bootstrap administrator.
 */
export async function lockAndGetApprovedAdminActor(
  client: PoolClient,
  actorUserId: string,
): Promise<LockedAdminActor | null> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('vixel_ugc.admin_user_mutation', 0))",
  );
  const result = await client.query<LockedAdminActor>(
    `
      SELECT user_id, account_status, app_role
      FROM vixel_ugc.user_profiles
      WHERE user_id = $1
      FOR SHARE
    `,
    [actorUserId.toLowerCase()],
  );
  const actor = result.rows[0];
  return actor?.account_status === "approved" && actor.app_role === "admin"
    ? actor
    : null;
}
