import type { PoolClient, QueryResultRow } from "pg";

import { lockAndGetApprovedAdminActor } from "./admin-authority";
import type { AccountStatus, AppRole } from "./auth";
import { getServerRuntimeConfig } from "./env";
import { productQuery, withProductTransaction } from "./product-db";

export const ADMIN_OVERVIEW_WINDOWS = [7, 30, 90] as const;

export type AdminOverviewWindow =
  (typeof ADMIN_OVERVIEW_WINDOWS)[number];

export type AdminWaitlistStatus =
  | "pending"
  | "approved"
  | "invited"
  | "rejected"
  | "converted";

export type AdminSubscriptionStatus =
  | "none"
  | "checkout_pending"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

export type AdminUser = {
  userId: string | null;
  email: string;
  displayName: string | null;
  company: string | null;
  waitlistStatus: AdminWaitlistStatus | null;
  accountStatus: AccountStatus | null;
  appRole: AppRole | null;
  subscriptionStatus: AdminSubscriptionStatus;
  campaignCount: number;
  successfulGenerationCount: number | null;
  generationAttentionCount: number | null;
  emailFailureCount: number;
  createdAt: string;
  approvedAt: string | null;
  isBootstrapAdmin: boolean;
};

export type AdminAuditState = {
  accountStatus: AccountStatus;
  appRole: AppRole;
};

export type AdminAuditEntry = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  subjectUserId: string | null;
  subjectEmail: string | null;
  action: string;
  reason: string | null;
  before: AdminAuditState | Record<string, unknown> | null;
  after: AdminAuditState | Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
};

export type AdminUserAction =
  | "suspend"
  | "restore"
  | "grant_admin"
  | "revoke_admin";

export type AdminAvailability = "ready" | "unavailable";

export type AdminOverview = {
  generatedAt: string;
  windowDays: AdminOverviewWindow;
  source: {
    id: "vixel_ugc_product_database";
    status: "ready" | "partial" | "unavailable";
    parts: {
      product: AdminAvailability;
      generationLedger: AdminAvailability;
      audit: AdminAvailability;
    };
  };
  caveats: string[];
  queues: Array<{
    id:
      | "waitlist_review"
      | "email_delivery"
      | "generation_reconciliation"
      | "billing_attention";
    label: string;
    count: number | null;
    status: AdminAvailability;
    severity: "attention" | "warning";
  }>;
  readiness: {
    productDatabase: AdminAvailability;
    accountAuth: "ready" | "not_ready" | "disabled";
    cloudCampaigns: "ready" | "not_ready" | "disabled";
    lifecycleEmail: "ready" | "not_ready" | "disabled";
    billing: "ready" | "not_ready" | "disabled";
    generationProvider: "ready" | "not_ready" | "disabled";
    generationLedger: AdminAvailability;
  };
  metrics: {
    totalAccounts: number | null;
    approvedAccounts: number | null;
    activeSubscriptions: number | null;
    campaignCount: number | null;
    successfulGenerationCount: number | null;
  };
  funnel: Array<{
    id:
      | "waitlist_submitted"
      | "waitlist_approved"
      | "account_created"
      | "first_campaign"
      | "first_successful_generation"
      | "active_subscription";
    label: string;
    value: number | null;
    conversionFromPreviousPercent: number | null;
    status: AdminAvailability;
    source: "product" | "generation_ledger";
  }>;
  audit: {
    status: AdminAvailability;
    entries: AdminAuditEntry[];
  };
};

type AdminUserRow = QueryResultRow & {
  user_id: string | null;
  email: string;
  display_name: string | null;
  company: string | null;
  waitlist_status: AdminWaitlistStatus | null;
  account_status: AccountStatus | null;
  app_role: AppRole | null;
  subscription_status: AdminSubscriptionStatus | null;
  campaign_count: number | string | null;
  successful_generation_count: number | string | null;
  generation_attention_count: number | string | null;
  email_failure_count: number | string | null;
  created_at: Date | string;
  approved_at: Date | string | null;
};

type AdminAuditRow = QueryResultRow & {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  subject_user_id: string | null;
  subject_email: string | null;
  action: string;
  before_state: unknown;
  after_state: unknown;
  request_id: string | null;
  created_at: Date | string;
};

type AdminCoreOverviewRow = QueryResultRow & {
  total_accounts: number | string;
  approved_accounts: number | string;
  active_subscriptions: number | string;
  campaign_count: number | string;
  pending_waitlist: number | string;
  failed_emails: number | string;
  billing_attention: number | string;
  cohort_submitted: number | string;
  cohort_approved: number | string;
  cohort_accounts: number | string;
  cohort_campaigns: number | string;
  cohort_active_subscription: number | string;
};

type AdminGenerationOverviewRow = QueryResultRow & {
  successful_generation_count: number | string;
  generation_attention: number | string;
  cohort_successful_generation: number | string;
};

type AdminUserGenerationRow = QueryResultRow & {
  user_id: string;
  successful_generation_count: number | string;
  generation_attention_count: number | string;
};

type AdminTargetRow = QueryResultRow & {
  user_id: string;
  email: string;
  account_status: AccountStatus;
  app_role: AppRole;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const USER_VIEW_CTES = `
  WITH campaign_counts AS (
    SELECT user_id, count(*)::int AS campaign_count
    FROM vixel_ugc.campaign_snapshots
    WHERE deleted_at IS NULL
    GROUP BY user_id
  ),
  email_counts AS (
    SELECT
      recipient_email,
      count(*) FILTER (WHERE status = 'failed')::int AS email_failure_count
    FROM vixel_ugc.email_delivery_ledger
    GROUP BY recipient_email
  ),
  profile_identities AS (
    SELECT
      profile.user_id,
      profile.email,
      COALESCE(profile.display_name, waitlist.display_name) AS display_name,
      COALESCE(profile.company, waitlist.company) AS company,
      waitlist.status AS waitlist_status,
      profile.account_status,
      profile.app_role,
      profile.created_at,
      profile.approved_at
    FROM vixel_ugc.user_profiles profile
    LEFT JOIN LATERAL (
      SELECT
        entry.status,
        entry.display_name,
        entry.company
      FROM vixel_ugc.waitlist_entries entry
      WHERE entry.converted_user_id = profile.user_id
        OR (
          entry.converted_user_id IS NULL
          AND entry.email = profile.email
        )
      ORDER BY
        (entry.converted_user_id = profile.user_id) DESC,
        entry.updated_at DESC
      LIMIT 1
    ) waitlist ON true
  ),
  waitlist_identities AS (
    SELECT
      NULL::uuid AS user_id,
      waitlist.email,
      waitlist.display_name,
      waitlist.company,
      waitlist.status AS waitlist_status,
      NULL::text AS account_status,
      NULL::text AS app_role,
      waitlist.created_at,
      waitlist.approved_at
    FROM vixel_ugc.waitlist_entries waitlist
    WHERE NOT EXISTS (
      SELECT 1
      FROM vixel_ugc.user_profiles profile
      WHERE profile.user_id = waitlist.converted_user_id
        OR profile.email = waitlist.email
    )
  ),
  identities AS (
    SELECT * FROM profile_identities
    UNION ALL
    SELECT * FROM waitlist_identities
  )
`;

const USER_VIEW_SELECT = `
  SELECT
    identity.user_id,
    identity.email,
    identity.display_name,
    identity.company,
    identity.waitlist_status,
    identity.account_status,
    identity.app_role,
    COALESCE(subscription.status, 'none') AS subscription_status,
    COALESCE(campaign.campaign_count, 0)::int AS campaign_count,
    NULL::int AS successful_generation_count,
    NULL::int AS generation_attention_count,
    COALESCE(email.email_failure_count, 0)::int AS email_failure_count,
    identity.created_at,
    identity.approved_at
  FROM identities identity
  LEFT JOIN vixel_ugc.subscriptions subscription
    ON subscription.user_id = identity.user_id
  LEFT JOIN campaign_counts campaign
    ON campaign.user_id = identity.user_id
  LEFT JOIN email_counts email
    ON email.recipient_email = identity.email
`;

const INTERNAL_EMAIL_PREDICATE = `
  lower(email) NOT LIKE '%@vixel.test'
  AND lower(email) NOT LIKE '%@dev.vixel'
  AND lower(email) NOT LIKE '%@vixel.ai'
  AND lower(email) NOT LIKE '%@vixelai.com'
`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function integer(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function nullableInteger(
  value: number | string | null | undefined,
): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function bootstrapAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  );
}

function bootstrapAdminIdArray(): string[] {
  return [...bootstrapAdminIds()];
}

function userFromRow(row: AdminUserRow): AdminUser {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    company: row.company,
    waitlistStatus: row.waitlist_status,
    accountStatus: row.account_status,
    appRole: row.app_role,
    subscriptionStatus: row.subscription_status ?? "none",
    campaignCount: integer(row.campaign_count),
    successfulGenerationCount: nullableInteger(row.successful_generation_count),
    generationAttentionCount: nullableInteger(row.generation_attention_count),
    emailFailureCount: integer(row.email_failure_count),
    createdAt: iso(row.created_at)!,
    approvedAt: iso(row.approved_at),
    isBootstrapAdmin: Boolean(
      row.user_id && bootstrapAdminIds().has(row.user_id.toLowerCase()),
    ),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function auditFromRow(row: AdminAuditRow): AdminAuditEntry {
  const before = record(row.before_state);
  const after = record(row.after_state);
  const reason =
    typeof after?.reason === "string" ? after.reason : null;
  if (after) delete after.reason;
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    subjectUserId: row.subject_user_id,
    subjectEmail: row.subject_email,
    action: row.action,
    reason,
    before,
    after,
    requestId: row.request_id,
    createdAt: iso(row.created_at)!,
  };
}

function normalizedReason(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function featureStatus(feature: { enabled: boolean; ready: boolean }) {
  return feature.enabled ? (feature.ready ? "ready" : "not_ready") : "disabled";
}

function conversion(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null;
  return Math.round((current / previous) * 10_000) / 100;
}

export function isAdminOverviewWindow(
  value: number,
): value is AdminOverviewWindow {
  return (ADMIN_OVERVIEW_WINDOWS as readonly number[]).includes(value);
}

async function loadAdminUserGenerationCounts(
  userIds: string[],
): Promise<Map<string, AdminUserGenerationRow> | null> {
  if (!userIds.length) return new Map();
  try {
    const result = await productQuery<AdminUserGenerationRow>(
      `
        SELECT
          account_user_id AS user_id,
          count(*) FILTER (WHERE status = 'succeeded')::int
            AS successful_generation_count,
          count(*) FILTER (
            WHERE status IN ('failed', 'submit_unknown', 'reconciliation_required')
          )::int AS generation_attention_count
        FROM vixel_koc.media_generation_ledger
        WHERE account_user_id = ANY($1::uuid[])
        GROUP BY account_user_id
      `,
      [userIds],
    );
    return new Map(result.rows.map((row) => [row.user_id, row]));
  } catch {
    return null;
  }
}

export async function listAdminUsers(input: {
  search?: string;
  limit?: number;
} = {}): Promise<{ users: AdminUser[]; generatedAt: string }> {
  const search = input.search?.replace(/\s+/g, " ").trim().slice(0, 160) || null;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 200);
  const result = await productQuery<AdminUserRow>(
    `${USER_VIEW_CTES}
     ${USER_VIEW_SELECT}
     WHERE (
       $1::text IS NULL
       OR identity.email ILIKE '%' || $1 || '%'
       OR COALESCE(identity.display_name, '') ILIKE '%' || $1 || '%'
       OR COALESCE(identity.company, '') ILIKE '%' || $1 || '%'
     )
     ORDER BY identity.created_at DESC, identity.email
     LIMIT $2`,
    [search, limit],
  );
  const generationCounts = await loadAdminUserGenerationCounts(
    result.rows.flatMap((row) => (row.user_id ? [row.user_id] : [])),
  );
  return {
    users: result.rows.map((row) => {
      const generation = row.user_id
        ? generationCounts?.get(row.user_id)
        : undefined;
      return userFromRow({
        ...row,
        successful_generation_count:
          generationCounts === null
            ? null
            : generation?.successful_generation_count ?? 0,
        generation_attention_count:
          generationCounts === null
            ? null
            : generation?.generation_attention_count ?? 0,
      });
    }),
    generatedAt: new Date().toISOString(),
  };
}

async function loadAdminUser(
  client: Pick<PoolClient, "query">,
  userId: string,
): Promise<AdminUser | null> {
  const result = await client.query<AdminUserRow>(
    `${USER_VIEW_CTES}
     ${USER_VIEW_SELECT}
     WHERE identity.user_id = $1
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? userFromRow(result.rows[0]) : null;
}

async function loadAuditEntry(
  client: Pick<PoolClient, "query">,
  auditId: string,
): Promise<AdminAuditEntry> {
  const result = await client.query<AdminAuditRow>(
    `
      SELECT
        audit.id,
        audit.actor_user_id,
        actor.email AS actor_email,
        audit.subject_user_id,
        subject.email AS subject_email,
        audit.action,
        audit.before_state,
        audit.after_state,
        audit.request_id,
        audit.created_at
      FROM vixel_ugc.audit_events audit
      LEFT JOIN vixel_ugc.user_profiles actor
        ON actor.user_id = audit.actor_user_id
      LEFT JOIN vixel_ugc.user_profiles subject
        ON subject.user_id = audit.subject_user_id
      WHERE audit.id = $1
      LIMIT 1
    `,
    [auditId],
  );
  if (!result.rows[0]) throw new Error("admin_audit_write_unavailable");
  return auditFromRow(result.rows[0]);
}

async function loadRecentAudit(): Promise<AdminAuditEntry[]> {
  const result = await productQuery<AdminAuditRow>(`
    SELECT
      audit.id,
      audit.actor_user_id,
      actor.email AS actor_email,
      audit.subject_user_id,
      subject.email AS subject_email,
      audit.action,
      audit.before_state,
      audit.after_state,
      audit.request_id,
      audit.created_at
    FROM vixel_ugc.audit_events audit
    LEFT JOIN vixel_ugc.user_profiles actor
      ON actor.user_id = audit.actor_user_id
    LEFT JOIN vixel_ugc.user_profiles subject
      ON subject.user_id = audit.subject_user_id
    ORDER BY audit.created_at DESC
    LIMIT 20
  `);
  return result.rows.map(auditFromRow);
}

async function loadCoreOverview(
  windowDays: AdminOverviewWindow,
): Promise<AdminCoreOverviewRow> {
  const result = await productQuery<AdminCoreOverviewRow>(
    `
      WITH external_profiles AS (
        SELECT profile.*
        FROM vixel_ugc.user_profiles profile
        WHERE profile.app_role <> 'admin'
          AND ${INTERNAL_EMAIL_PREDICATE.replaceAll("email", "profile.email")}
          AND NOT (profile.user_id = ANY($2::uuid[]))
      ),
      external_waitlist AS (
        SELECT
          entry.*,
          profile.account_status,
          profile.app_role
        FROM vixel_ugc.waitlist_entries entry
        LEFT JOIN vixel_ugc.user_profiles profile
          ON profile.user_id = entry.converted_user_id
        WHERE ${INTERNAL_EMAIL_PREDICATE.replaceAll("email", "entry.email")}
          AND COALESCE(profile.app_role, 'user') <> 'admin'
          AND (
            entry.converted_user_id IS NULL
            OR NOT (entry.converted_user_id = ANY($2::uuid[]))
          )
      ),
      cohort AS (
        SELECT *
        FROM external_waitlist
        WHERE created_at >= now() - make_interval(days => $1)
      ),
      cohort_accounts AS (
        SELECT cohort.*
        FROM cohort
        JOIN external_profiles profile
          ON profile.user_id = cohort.converted_user_id
        WHERE cohort.approved_at IS NOT NULL
          OR cohort.status IN ('approved', 'invited', 'converted')
      )
      SELECT
        (SELECT count(*)::int FROM external_profiles) AS total_accounts,
        (
          SELECT count(*)::int
          FROM external_profiles
          WHERE account_status = 'approved'
        ) AS approved_accounts,
        (
          SELECT count(*)::int
          FROM vixel_ugc.subscriptions subscription
          JOIN external_profiles profile ON profile.user_id = subscription.user_id
          WHERE subscription.status IN ('active', 'trialing')
        ) AS active_subscriptions,
        (
          SELECT count(*)::int
          FROM vixel_ugc.campaign_snapshots campaign
          JOIN external_profiles profile ON profile.user_id = campaign.user_id
          WHERE campaign.deleted_at IS NULL
        ) AS campaign_count,
        (
          SELECT count(*)::int
          FROM external_waitlist
          WHERE status = 'pending'
        ) AS pending_waitlist,
        (
          SELECT count(*)::int
          FROM vixel_ugc.email_delivery_ledger delivery
          WHERE delivery.status = 'failed'
            AND ${INTERNAL_EMAIL_PREDICATE.replaceAll("email", "delivery.recipient_email")}
        ) AS failed_emails,
        (
          SELECT count(*)::int
          FROM vixel_ugc.subscriptions subscription
          JOIN external_profiles profile ON profile.user_id = subscription.user_id
          WHERE subscription.status IN ('past_due', 'unpaid', 'incomplete')
        ) AS billing_attention,
        (SELECT count(*)::int FROM cohort) AS cohort_submitted,
        (
          SELECT count(*)::int
          FROM cohort
          WHERE approved_at IS NOT NULL
            OR status IN ('approved', 'invited', 'converted')
        ) AS cohort_approved,
        (SELECT count(*)::int FROM cohort_accounts) AS cohort_accounts,
        (
          SELECT count(DISTINCT cohort_accounts.converted_user_id)::int
          FROM cohort_accounts
          JOIN vixel_ugc.campaign_snapshots campaign
            ON campaign.user_id = cohort_accounts.converted_user_id
        ) AS cohort_campaigns,
        (
          SELECT count(DISTINCT cohort_accounts.converted_user_id)::int
          FROM cohort_accounts
          JOIN vixel_ugc.subscriptions subscription
            ON subscription.user_id = cohort_accounts.converted_user_id
           AND subscription.status IN ('active', 'trialing')
        ) AS cohort_active_subscription
    `,
    [windowDays, bootstrapAdminIdArray()],
  );
  if (!result.rows[0]) throw new Error("admin_overview_product_unavailable");
  return result.rows[0];
}

async function loadGenerationOverview(
  windowDays: AdminOverviewWindow,
): Promise<AdminGenerationOverviewRow> {
  const result = await productQuery<AdminGenerationOverviewRow>(
    `
      WITH external_profiles AS (
        SELECT profile.*
        FROM vixel_ugc.user_profiles profile
        WHERE profile.app_role <> 'admin'
          AND ${INTERNAL_EMAIL_PREDICATE.replaceAll("email", "profile.email")}
          AND NOT (profile.user_id = ANY($2::uuid[]))
      ),
      eligible_cohort AS (
        SELECT DISTINCT entry.converted_user_id AS user_id
        FROM vixel_ugc.waitlist_entries entry
        JOIN external_profiles profile
          ON profile.user_id = entry.converted_user_id
        WHERE entry.created_at >= now() - make_interval(days => $1)
          AND (
            entry.approved_at IS NOT NULL
            OR entry.status IN ('approved', 'invited', 'converted')
          )
          AND EXISTS (
            SELECT 1
            FROM vixel_ugc.campaign_snapshots campaign
            WHERE campaign.user_id = entry.converted_user_id
          )
          AND EXISTS (
            SELECT 1
            FROM vixel_ugc.subscriptions subscription
            WHERE subscription.user_id = entry.converted_user_id
              AND subscription.status IN ('active', 'trialing')
          )
      ),
      successful_cohort AS (
        SELECT DISTINCT cohort.user_id
        FROM eligible_cohort cohort
        JOIN vixel_koc.media_generation_ledger generation
          ON generation.account_user_id = cohort.user_id
         AND generation.status = 'succeeded'
      )
      SELECT
        (
          SELECT count(*)::int
          FROM vixel_koc.media_generation_ledger generation
          JOIN external_profiles profile
            ON profile.user_id = generation.account_user_id
          WHERE generation.status = 'succeeded'
        ) AS successful_generation_count,
        (
          SELECT count(*)::int
          FROM vixel_koc.media_generation_ledger generation
          JOIN external_profiles profile
            ON profile.user_id = generation.account_user_id
          WHERE generation.status IN (
            'failed',
            'submit_unknown',
            'reconciliation_required'
          )
        ) AS generation_attention,
        (SELECT count(*)::int FROM successful_cohort) AS cohort_successful_generation
    `,
    [windowDays, bootstrapAdminIdArray()],
  );
  if (!result.rows[0]) throw new Error("admin_overview_generation_unavailable");
  return result.rows[0];
}

export async function getAdminOverview(
  windowDays: AdminOverviewWindow,
): Promise<AdminOverview> {
  const generatedAt = new Date().toISOString();
  const [coreResult, generationResult, auditResult] =
    await Promise.allSettled([
      loadCoreOverview(windowDays),
      loadGenerationOverview(windowDays),
      loadRecentAudit(),
    ]);
  const core = coreResult.status === "fulfilled" ? coreResult.value : null;
  const generation =
    generationResult.status === "fulfilled" ? generationResult.value : null;
  const audit = auditResult.status === "fulfilled" ? auditResult.value : null;
  const availableParts = [core, generation, audit].filter(Boolean).length;
  const sourceStatus =
    availableParts === 3
      ? "ready"
      : availableParts === 0
        ? "unavailable"
        : "partial";
  const runtime = getServerRuntimeConfig();
  const caveats = [
    "The funnel is a current-state cohort of external waitlist entries created inside the selected window; it is not visit or UTM attribution.",
    "Account creation does not prove a completed OTP sign-in because Supabase may create an auth user when the OTP is requested.",
    "Active and trialing subscriptions are entitlement state, not settled revenue.",
    "The final generation stage counts only currently entitled cohort members, so churned historical generators do not make the activation funnel increase.",
    "Internal, test, database-admin, and bootstrap-admin identities are excluded from product metrics.",
  ];
  if (!core) {
    caveats.push("Product account, waitlist, campaign, email, and billing data is unavailable; affected values are null.");
  }
  if (!generation) {
    caveats.push("The generation ledger is unavailable; generation queue and funnel values are null.");
  }
  if (!audit) {
    caveats.push("The audit source is unavailable; an empty audit list does not mean no actions occurred.");
  }

  const stages: Array<{
    id: AdminOverview["funnel"][number]["id"];
    label: string;
    value: number | null;
    status: AdminAvailability;
    source: "product" | "generation_ledger";
  }> = [
    { id: "waitlist_submitted", label: "Waitlist submitted", value: core ? integer(core.cohort_submitted) : null, status: core ? "ready" : "unavailable", source: "product" },
    { id: "waitlist_approved", label: "Approved", value: core ? integer(core.cohort_approved) : null, status: core ? "ready" : "unavailable", source: "product" },
    { id: "account_created", label: "Account record created", value: core ? integer(core.cohort_accounts) : null, status: core ? "ready" : "unavailable", source: "product" },
    { id: "first_campaign", label: "First cloud campaign", value: core ? integer(core.cohort_campaigns) : null, status: core ? "ready" : "unavailable", source: "product" },
    { id: "active_subscription", label: "Active subscription", value: core ? integer(core.cohort_active_subscription) : null, status: core ? "ready" : "unavailable", source: "product" },
    { id: "first_successful_generation", label: "First paid generation", value: generation ? integer(generation.cohort_successful_generation) : null, status: generation ? "ready" : "unavailable", source: "generation_ledger" },
  ];

  return {
    generatedAt,
    windowDays,
    source: {
      id: "vixel_ugc_product_database",
      status: sourceStatus,
      parts: {
        product: core ? "ready" : "unavailable",
        generationLedger: generation ? "ready" : "unavailable",
        audit: audit ? "ready" : "unavailable",
      },
    },
    caveats,
    queues: [
      { id: "waitlist_review", label: "Waitlist review", count: core ? integer(core.pending_waitlist) : null, status: core ? "ready" : "unavailable", severity: "attention" },
      { id: "email_delivery", label: "Failed email delivery", count: core ? integer(core.failed_emails) : null, status: core ? "ready" : "unavailable", severity: "warning" },
      { id: "generation_reconciliation", label: "Generation reconciliation", count: generation ? integer(generation.generation_attention) : null, status: generation ? "ready" : "unavailable", severity: "warning" },
      { id: "billing_attention", label: "Billing attention", count: core ? integer(core.billing_attention) : null, status: core ? "ready" : "unavailable", severity: "warning" },
    ],
    readiness: {
      productDatabase: core ? "ready" : "unavailable",
      accountAuth: featureStatus(runtime.product.features.accountAuth),
      cloudCampaigns: featureStatus(runtime.product.features.cloudCampaigns),
      lifecycleEmail: featureStatus(runtime.product.features.lifecycleEmail),
      billing: featureStatus(runtime.product.features.billing),
      generationProvider: runtime.liveGeneration
        ? runtime.newApi.configured
          ? "ready"
          : "not_ready"
        : "disabled",
      generationLedger: generation ? "ready" : "unavailable",
    },
    metrics: {
      totalAccounts: core ? integer(core.total_accounts) : null,
      approvedAccounts: core ? integer(core.approved_accounts) : null,
      activeSubscriptions: core ? integer(core.active_subscriptions) : null,
      campaignCount: core ? integer(core.campaign_count) : null,
      successfulGenerationCount: generation
        ? integer(generation.successful_generation_count)
        : null,
    },
    funnel: stages.map((stage, index) => ({
      ...stage,
      conversionFromPreviousPercent:
        index === 0 ? null : conversion(stage.value, stages[index - 1].value),
    })),
    audit: {
      status: audit ? "ready" : "unavailable",
      entries: audit ?? [],
    },
  };
}

export class AdminUserOperationError extends Error {
  constructor(
    readonly code:
      | "invalid_reason"
      | "actor_not_authorized"
      | "not_found"
      | "invalid_transition"
      | "self_change_forbidden"
      | "bootstrap_admin_protected"
      | "last_usable_admin",
    message: string,
  ) {
    super(message);
    this.name = "AdminUserOperationError";
  }
}

export async function mutateAdminUser(input: {
  userId: string;
  action: AdminUserAction;
  reason: string;
  actorUserId: string;
  requestId: string;
}): Promise<{ user: AdminUser; audit: AdminAuditEntry }> {
  const userId = input.userId.toLowerCase();
  const actorUserId = input.actorUserId.toLowerCase();
  if (userId === actorUserId) {
    throw new AdminUserOperationError(
      "self_change_forbidden",
      "Operators cannot change their own account status or role.",
    );
  }
  const reason = normalizedReason(input.reason);
  if (reason.length < 4) {
    throw new AdminUserOperationError(
      "invalid_reason",
      "A meaningful audit reason is required.",
    );
  }

  return withProductTransaction(async (client) => {
    const actor = await lockAndGetApprovedAdminActor(client, actorUserId);
    if (!actor) {
      throw new AdminUserOperationError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      );
    }
    const targetResult = await client.query<AdminTargetRow>(
      `
        SELECT user_id, email, account_status, app_role
        FROM vixel_ugc.user_profiles
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId],
    );
    const target = targetResult.rows[0];
    if (!target) {
      throw new AdminUserOperationError(
        "not_found",
        "The target account was not found.",
      );
    }

    const isBootstrapAdmin = bootstrapAdminIds().has(userId);
    if (
      isBootstrapAdmin &&
      (input.action === "suspend" || input.action === "revoke_admin")
    ) {
      throw new AdminUserOperationError(
        "bootstrap_admin_protected",
        "Bootstrap administrators cannot be suspended or demoted.",
      );
    }

    const before: AdminAuditState = {
      accountStatus: target.account_status,
      appRole: target.app_role,
    };
    const after: AdminAuditState = { ...before };
    if (input.action === "suspend") {
      if (before.accountStatus === "suspended") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "The target account is already suspended.",
        );
      }
      if (before.accountStatus !== "approved") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "Only an approved account can be suspended.",
        );
      }
      after.accountStatus = "suspended";
    } else if (input.action === "restore") {
      if (before.accountStatus !== "suspended") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "Only a suspended account can be restored.",
        );
      }
      after.accountStatus = "approved";
    } else if (input.action === "grant_admin") {
      if (before.appRole === "admin") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "The target account is already an administrator.",
        );
      }
      if (before.accountStatus !== "approved") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "Administrator access can be granted only to an approved account.",
        );
      }
      after.appRole = "admin";
    } else {
      if (before.appRole !== "admin") {
        throw new AdminUserOperationError(
          "invalid_transition",
          "The target account is not an administrator.",
        );
      }
      after.appRole = "user";
    }

    const removesUsableAdmin =
      before.appRole === "admin" &&
      before.accountStatus === "approved" &&
      (after.appRole !== "admin" || after.accountStatus !== "approved");
    if (removesUsableAdmin) {
      const remaining = await client.query<{ count: number | string }>(
        `
          SELECT count(*)::int AS count
          FROM vixel_ugc.user_profiles
          WHERE app_role = 'admin'
            AND account_status = 'approved'
            AND user_id <> $1
        `,
        [userId],
      );
      if (integer(remaining.rows[0]?.count) < 1) {
        throw new AdminUserOperationError(
          "last_usable_admin",
          "The last usable administrator cannot be suspended or demoted.",
        );
      }
    }

    await client.query(
      `
        UPDATE vixel_ugc.user_profiles
        SET account_status = $2, app_role = $3
        WHERE user_id = $1
      `,
      [userId, after.accountStatus, after.appRole],
    );
    const auditInsert = await client.query<{ id: string }>(
      `
        INSERT INTO vixel_ugc.audit_events (
          actor_user_id,
          subject_user_id,
          action,
          before_state,
          after_state,
          request_id
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
        RETURNING id
      `,
      [
        actorUserId,
        userId,
        `account.${input.action}`,
        JSON.stringify(before),
        JSON.stringify({ ...after, reason }),
        input.requestId,
      ],
    );
    const auditId = auditInsert.rows[0]?.id;
    if (!auditId) throw new Error("admin_audit_write_unavailable");
    const user = await loadAdminUser(client, userId);
    if (!user) throw new Error("admin_user_reload_unavailable");
    const audit = await loadAuditEntry(client, auditId);
    return { user, audit };
  });
}
