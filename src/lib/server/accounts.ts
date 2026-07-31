import { apiError, type ApiErrorBody } from "./api";
import {
  type AccountSession,
  type AccountStatus,
  type AppRole,
  getAccountSession,
  requireStudioSession,
} from "./auth";
import { productQuery, withProductTransaction } from "./product-db";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AccountProfile = {
  userId: string;
  email: string;
  displayName: string | null;
  company: string | null;
  useCase: string | null;
  expectedVolume: string | null;
  accountStatus: AccountStatus;
  appRole: AppRole;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AccountRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  company: string | null;
  use_case: string | null;
  expected_volume: string | null;
  account_status: AccountStatus;
  app_role: AppRole;
  approved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AccountWaitlistRow = {
  id: string;
  display_name: string | null;
  status: "pending" | "approved" | "invited" | "rejected" | "converted";
  converted_user_id: string | null;
};

const ACCOUNT_COLUMNS = `
  user_id, email, display_name, company, use_case, expected_volume,
  account_status, app_role, approved_at, created_at, updated_at
`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function accountFromRow(row: AccountRow): AccountProfile {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    company: row.company,
    useCase: row.use_case,
    expectedVolume: row.expected_volume,
    accountStatus: row.account_status,
    appRole: row.app_role,
    approvedAt: iso(row.approved_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function bootstrapAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  );
}

export async function ensureAccountProfile(input: {
  userId: string;
  email: string;
}): Promise<AccountProfile> {
  const userId = input.userId.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!UUID_PATTERN.test(userId) || !email || email.length > 320) {
    throw new Error("invalid_account_identity");
  }
  const bootstrapRole = bootstrapAdminIds().has(userId) ? "admin" : "user";
  return withProductTransaction(async (client) => {
    const result = await client.query<AccountRow>(
      `
        INSERT INTO vixel_ugc.user_profiles (user_id, email, app_role)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE
        SET
          email = EXCLUDED.email,
          app_role = CASE
            WHEN EXCLUDED.app_role = 'admin' THEN 'admin'
            ELSE vixel_ugc.user_profiles.app_role
          END
        RETURNING ${ACCOUNT_COLUMNS}
      `,
      [userId, email, bootstrapRole],
    );
    let account = accountFromRow(result.rows[0]);

    const linkedWaitlist = await client.query<AccountWaitlistRow>(
      `
        INSERT INTO vixel_ugc.waitlist_entries (
          email,
          source,
          converted_user_id
        )
        VALUES ($1, 'account-signup', $2)
        ON CONFLICT (email) DO UPDATE
        SET converted_user_id = EXCLUDED.converted_user_id
        WHERE vixel_ugc.waitlist_entries.converted_user_id IS NULL
        RETURNING id, display_name, status, converted_user_id
      `,
      [email, userId],
    );

    let waitlist = linkedWaitlist.rows[0];
    if (!waitlist) {
      const existingWaitlist = await client.query<AccountWaitlistRow>(
        `
          SELECT id, display_name, status, converted_user_id
          FROM vixel_ugc.waitlist_entries
          WHERE email = $1
          LIMIT 1
        `,
        [email],
      );
      waitlist = existingWaitlist.rows[0];
    }
    if (!waitlist || waitlist.converted_user_id !== userId) {
      throw new Error("account_waitlist_identity_conflict");
    }

    if (
      account.accountStatus !== "approved" &&
      ["approved", "invited", "converted"].includes(waitlist.status)
    ) {
      const approvedAccount = await client.query<AccountRow>(
        `
          UPDATE vixel_ugc.user_profiles
          SET
            account_status = 'approved',
            approved_at = COALESCE(approved_at, now())
          WHERE user_id = $1
          RETURNING ${ACCOUNT_COLUMNS}
        `,
        [userId],
      );
      account = accountFromRow(approvedAccount.rows[0]);
    }

    await client.query(
      `
        INSERT INTO vixel_ugc.email_delivery_ledger (
          event_type,
          recipient_email,
          user_id,
          waitlist_entry_id,
          idempotency_key,
          template_payload
        )
        VALUES (
          'waitlist_confirmation',
          $1,
          $2,
          $3,
          $4,
          jsonb_build_object('displayName', $5::text)
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        email,
        userId,
        waitlist.id,
        `waitlist_confirmation:${waitlist.id}:v1`,
        waitlist.display_name,
      ],
    );

    await client.query(
      `
        INSERT INTO vixel_ugc.email_delivery_ledger (
          event_type,
          recipient_email,
          user_id,
          idempotency_key,
          template_payload
        )
        VALUES (
          'welcome',
          $1,
          $2,
          $3,
          jsonb_build_object('displayName', $4::text)
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        email,
        userId,
        `welcome:${userId}:v1`,
        account.displayName,
      ],
    );
    return account;
  });
}

export async function getAccountProfile(
  userId: string,
): Promise<AccountProfile | null> {
  if (!UUID_PATTERN.test(userId)) return null;
  const result = await productQuery<AccountRow>(
    `
      SELECT ${ACCOUNT_COLUMNS}
      FROM vixel_ugc.user_profiles
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId.toLowerCase()],
  );
  return result.rows[0] ? accountFromRow(result.rows[0]) : null;
}

export type AccountAuthorization =
  | {
      allowed: true;
      session: AccountSession;
      account: AccountProfile;
    }
  | {
      allowed: false;
      response: Response;
    };

export async function authorizeAccount(
  request: Request,
  requestId: string,
  options: { approved?: boolean; admin?: boolean } = {},
): Promise<AccountAuthorization> {
  const session = getAccountSession(request);
  if (!session) {
    return {
      allowed: false,
      response: apiError(
        401,
        "account_authentication_required",
        "A valid account session is required.",
        false,
        requestId,
      ),
    };
  }
  const account = await getAccountProfile(session.userId);
  if (!account) {
    return {
      allowed: false,
      response: apiError(
        401,
        "account_not_found",
        "The account session is no longer valid.",
        false,
        requestId,
      ),
    };
  }
  if (account.accountStatus === "suspended") {
    return {
      allowed: false,
      response: apiError(
        403,
        "account_suspended",
        "This account is suspended.",
        false,
        requestId,
      ),
    };
  }
  if (options.approved && account.accountStatus !== "approved") {
    return {
      allowed: false,
      response: apiError(
        403,
        "waitlist_approval_required",
        "Waitlist approval is required to enter Studio.",
        false,
        requestId,
      ),
    };
  }
  if (options.admin && account.appRole !== "admin") {
    return {
      allowed: false,
      response: apiError(
        403,
        "admin_required",
        "Administrator access is required.",
        false,
        requestId,
      ),
    };
  }
  return { allowed: true, session, account };
}

/**
 * Preserves the operator-recovery session path while requiring current
 * database authorization for every account-backed v3 session.
 *
 * The synchronous auth helper can safely validate recovery sessions, but the
 * account status and role embedded in a v3 cookie are only signed hints. An
 * account can be suspended or moved back to the waitlist after that cookie is
 * issued, so product APIs must cross this asynchronous boundary before doing
 * sensitive work.
 */
export async function requireCurrentStudioSession(
  request: Request,
  requestId: string,
): Promise<Response | null> {
  const accountSession = getAccountSession(request);
  if (!accountSession) return requireStudioSession(request, requestId);

  try {
    const authorization = await authorizeAccount(request, requestId, {
      approved: true,
    });
    return authorization.allowed ? null : authorization.response;
  } catch {
    return apiError(
      503,
      "account_database_unavailable",
      "Account authorization is temporarily unavailable.",
      true,
      requestId,
    );
  }
}

export type AccountApiErrorBody = ApiErrorBody;
