import type { PoolClient } from "pg";

import { lockAndGetApprovedAdminActor } from "./admin-authority";
import type { AccountStatus, AppRole } from "./auth";
import { productQuery, withProductTransaction } from "./product-db";

export type WaitlistStatus =
  | "pending"
  | "approved"
  | "invited"
  | "rejected"
  | "converted";

export type WaitlistEntry = {
  id: string;
  email: string;
  displayName: string | null;
  company: string | null;
  useCase: string | null;
  expectedVolume: string | null;
  status: WaitlistStatus;
  source: string;
  internalNote: string | null;
  convertedUserId: string | null;
  approvedAt: string | null;
  invitedAt: string | null;
  invitationExpiresAt: string | null;
  lastReminderAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WaitlistRow = {
  id: string;
  email: string;
  display_name: string | null;
  company: string | null;
  use_case: string | null;
  expected_volume: string | null;
  status: WaitlistStatus;
  source: string;
  internal_note: string | null;
  converted_user_id: string | null;
  approved_at: Date | string | null;
  invited_at: Date | string | null;
  invitation_expires_at: Date | string | null;
  last_reminder_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type LinkedAccountGuardRow = {
  user_id: string;
  account_status: AccountStatus;
  app_role: AppRole;
};

const WAITLIST_COLUMNS = `
  id, email, display_name, company, use_case, expected_volume, status,
  source, internal_note, converted_user_id, approved_at, invited_at,
  invitation_expires_at, last_reminder_at, created_at, updated_at
`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function fromRow(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    company: row.company,
    useCase: row.use_case,
    expectedVolume: row.expected_volume,
    status: row.status,
    source: row.source,
    internalNote: row.internal_note,
    convertedUserId: row.converted_user_id,
    approvedAt: iso(row.approved_at),
    invitedAt: iso(row.invited_at),
    invitationExpiresAt: iso(row.invitation_expires_at),
    lastReminderAt: iso(row.last_reminder_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export function normalizeWaitlistEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizedOptional(
  value: string | null | undefined,
  maximum: number,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export async function submitWaitlist(input: {
  email: string;
  displayName?: string | null;
  company?: string | null;
  useCase?: string | null;
  expectedVolume?: string | null;
  source?: string;
  productUpdatesOptedIn?: boolean;
}): Promise<WaitlistEntry> {
  const email = normalizeWaitlistEmail(input.email);
  return withProductTransaction(async (client) => {
    const result = await client.query<WaitlistRow>(
      `
        INSERT INTO vixel_ugc.waitlist_entries (
          email,
          display_name,
          company,
          use_case,
          expected_volume,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO UPDATE
        SET
          display_name = COALESCE(EXCLUDED.display_name, vixel_ugc.waitlist_entries.display_name),
          company = COALESCE(EXCLUDED.company, vixel_ugc.waitlist_entries.company),
          use_case = COALESCE(EXCLUDED.use_case, vixel_ugc.waitlist_entries.use_case),
          expected_volume = COALESCE(EXCLUDED.expected_volume, vixel_ugc.waitlist_entries.expected_volume)
        RETURNING ${WAITLIST_COLUMNS}
      `,
      [
        email,
        normalizedOptional(input.displayName, 120),
        normalizedOptional(input.company, 160),
        normalizedOptional(input.useCase, 1_000),
        normalizedOptional(input.expectedVolume, 80),
        normalizedOptional(input.source, 120) ?? "product-entry",
      ],
    );
    const entry = result.rows[0];

    await client.query(
      `
        INSERT INTO vixel_ugc.email_preferences (
          email,
          product_updates_opted_in,
          consent_source,
          consent_recorded_at
        )
        VALUES ($1, $2, $3, CASE WHEN $2 THEN now() ELSE NULL END)
        ON CONFLICT (email) DO UPDATE
        SET
          product_updates_opted_in =
            EXCLUDED.product_updates_opted_in
            AND vixel_ugc.email_preferences.suppressed_at IS NULL,
          consent_source = CASE
            WHEN EXCLUDED.product_updates_opted_in THEN EXCLUDED.consent_source
            ELSE NULL
          END,
          consent_recorded_at = CASE
            WHEN EXCLUDED.product_updates_opted_in
              AND vixel_ugc.email_preferences.suppressed_at IS NULL
              THEN now()
            ELSE NULL
          END
      `,
      [
        email,
        input.productUpdatesOptedIn === true,
        normalizedOptional(input.source, 120) ?? "product-entry",
      ],
    );

    await client.query(
      `
        INSERT INTO vixel_ugc.email_delivery_ledger (
          event_type,
          recipient_email,
          waitlist_entry_id,
          idempotency_key,
          template_payload
        )
        VALUES (
          'waitlist_confirmation',
          $1,
          $2,
          $3,
          jsonb_build_object('displayName', $4::text)
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        email,
        entry.id,
        `waitlist_confirmation:${entry.id}:v1`,
        entry.display_name,
      ],
    );

    return fromRow(entry);
  });
}

export async function listWaitlist(input: {
  status?: WaitlistStatus;
  search?: string;
  limit?: number;
} = {}): Promise<WaitlistEntry[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const search = input.search?.trim().slice(0, 160) || null;
  const result = await productQuery<WaitlistRow>(
    `
      SELECT ${WAITLIST_COLUMNS}
      FROM vixel_ugc.waitlist_entries
      WHERE ($1::text IS NULL OR status = $1)
        AND (
          $2::text IS NULL
          OR email ILIKE '%' || $2 || '%'
          OR display_name ILIKE '%' || $2 || '%'
          OR company ILIKE '%' || $2 || '%'
        )
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [input.status ?? null, search, limit],
  );
  return result.rows.map(fromRow);
}

const NEXT_STATUS: Record<
  "approve" | "reject" | "invite" | "revoke",
  Partial<Record<WaitlistStatus, WaitlistStatus>>
> = {
  approve: {
    pending: "approved",
    rejected: "approved",
  },
  reject: {
    pending: "rejected",
    approved: "rejected",
    invited: "rejected",
  },
  invite: {
    approved: "invited",
  },
  revoke: {
    invited: "approved",
  },
};

export function waitlistTransitionTarget(
  current: WaitlistStatus,
  action: "approve" | "reject" | "invite" | "revoke",
): WaitlistStatus | null {
  return NEXT_STATUS[action][current] ?? null;
}

export class WaitlistTransitionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "actor_not_authorized"
      | "invalid_reason"
      | "invalid_transition"
      | "protected_admin",
    message: string,
  ) {
    super(message);
    this.name = "WaitlistTransitionError";
  }
}

async function lockedWaitlistEntry(
  client: PoolClient,
  entryId: string,
): Promise<WaitlistRow> {
  const result = await client.query<WaitlistRow>(
    `
      SELECT ${WAITLIST_COLUMNS}
      FROM vixel_ugc.waitlist_entries
      WHERE id = $1
      FOR UPDATE
    `,
    [entryId],
  );
  if (!result.rows[0]) {
    throw new WaitlistTransitionError(
      "not_found",
      "The waitlist entry was not found.",
    );
  }
  return result.rows[0];
}

function isBootstrapAdmin(userId: string): boolean {
  const normalizedUserId = userId.toLowerCase();
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase() === normalizedUserId);
}

async function assertLinkedAccountTransitionSafe(input: {
  client: PoolClient;
  userId: string;
}): Promise<LinkedAccountGuardRow> {
  const profileResult = await input.client.query<LinkedAccountGuardRow>(
    `
      SELECT user_id, account_status, app_role
      FROM vixel_ugc.user_profiles
      WHERE user_id = $1
      FOR UPDATE
    `,
    [input.userId],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    throw new WaitlistTransitionError(
      "invalid_transition",
      "The linked account is unavailable and cannot be changed from Admissions.",
    );
  }
  if (profile.app_role === "admin" || isBootstrapAdmin(input.userId)) {
    throw new WaitlistTransitionError(
      "protected_admin",
      "Administrator account status must be changed from Users & Access, not Admissions.",
    );
  }
  return profile;
}

function normalizedTransitionReason(value: string | null | undefined): string | null {
  const normalized = value
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return normalized || null;
}

export async function transitionWaitlist(input: {
  entryId: string;
  action: "approve" | "reject" | "invite" | "revoke";
  reason?: string | null;
  actorUserId: string;
  requestId: string;
}): Promise<WaitlistEntry> {
  return withProductTransaction(async (client) => {
    const actorUserId = input.actorUserId.toLowerCase();
    const actor = await lockAndGetApprovedAdminActor(client, actorUserId);
    if (!actor) {
      throw new WaitlistTransitionError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      );
    }
    const current = await lockedWaitlistEntry(client, input.entryId);
    const next = waitlistTransitionTarget(current.status, input.action);
    if (!next) {
      throw new WaitlistTransitionError(
        "invalid_transition",
        `A ${current.status} entry cannot be changed with ${input.action}.`,
      );
    }

    const accountStatus: AccountStatus =
      ["approved", "invited", "converted"].includes(next)
        ? "approved"
        : "pending";
    const reason = normalizedTransitionReason(input.reason);
    let linkedProfile: LinkedAccountGuardRow | null = null;
    if (current.converted_user_id) {
      linkedProfile = await assertLinkedAccountTransitionSafe({
        client,
        userId: current.converted_user_id,
      });
      if (!reason || reason.length < 4) {
        throw new WaitlistTransitionError(
          "invalid_reason",
          "A meaningful audit reason is required for an account-linked admission change.",
        );
      }
    }

    const result = await client.query<WaitlistRow>(
      `
        UPDATE vixel_ugc.waitlist_entries
        SET
          status = $2,
          approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
          approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
          rejected_at = CASE WHEN $2 = 'rejected' THEN now() ELSE NULL END,
          invited_at = CASE WHEN $2 = 'invited' THEN now() ELSE NULL END,
          invitation_expires_at = CASE
            WHEN $2 = 'invited' THEN now() + interval '7 days'
            ELSE NULL
          END,
          last_reminder_at = CASE WHEN $2 = 'invited' THEN NULL ELSE last_reminder_at END
        WHERE id = $1
        RETURNING ${WAITLIST_COLUMNS}
      `,
      [input.entryId, next, actorUserId],
    );
    const updated = result.rows[0];

    if (updated.converted_user_id) {
      await client.query(
        `
          UPDATE vixel_ugc.user_profiles
          SET
            account_status = $2,
            approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END,
            approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE NULL END
          WHERE user_id = $1
        `,
        [updated.converted_user_id, accountStatus, actorUserId],
      );
    }

    await client.query(
      `
        INSERT INTO vixel_ugc.audit_events (
          actor_user_id,
          subject_user_id,
          waitlist_entry_id,
          action,
          before_state,
          after_state,
          request_id
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
      `,
      [
        actorUserId,
        updated.converted_user_id,
        updated.id,
        `waitlist.${input.action}`,
        JSON.stringify({
          ...fromRow(current),
          ...(linkedProfile
            ? {
                accountStatus: linkedProfile.account_status,
                appRole: linkedProfile.app_role,
              }
            : {}),
        }),
        JSON.stringify({
          ...fromRow(updated),
          ...(linkedProfile
            ? {
                accountStatus,
                appRole: linkedProfile.app_role,
              }
            : {}),
          ...(reason ? { reason } : {}),
        }),
        input.requestId,
      ],
    );

    const deliveryEvent =
      input.action === "approve"
        ? "waitlist_approved"
        : input.action === "invite"
          ? "invitation"
          : null;
    if (deliveryEvent) {
      const version =
        deliveryEvent === "invitation"
          ? iso(updated.invited_at)
          : "v1";
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
            $1,
            $2,
            $3,
            $4,
            $5,
            jsonb_build_object(
              'displayName', $6::text,
              'invitationExpiresAt', $7::text
            )
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `,
        [
          deliveryEvent,
          updated.email,
          updated.converted_user_id,
          updated.id,
          `${deliveryEvent}:${updated.id}:${version}`,
          updated.display_name,
          iso(updated.invitation_expires_at),
        ],
      );
    }
    return fromRow(updated);
  });
}

export async function updateWaitlistNote(input: {
  entryId: string;
  note: string | null;
  actorUserId: string;
  requestId: string;
}): Promise<WaitlistEntry> {
  return withProductTransaction(async (client) => {
    const actorUserId = input.actorUserId.toLowerCase();
    const actor = await lockAndGetApprovedAdminActor(client, actorUserId);
    if (!actor) {
      throw new WaitlistTransitionError(
        "actor_not_authorized",
        "The operator no longer has approved administrator access.",
      );
    }
    const current = await lockedWaitlistEntry(client, input.entryId);
    const note = normalizedOptional(input.note, 4_000);
    const result = await client.query<WaitlistRow>(
      `
        UPDATE vixel_ugc.waitlist_entries
        SET internal_note = $2
        WHERE id = $1
        RETURNING ${WAITLIST_COLUMNS}
      `,
      [input.entryId, note],
    );
    const updated = result.rows[0];
    await client.query(
      `
        INSERT INTO vixel_ugc.audit_events (
          actor_user_id,
          subject_user_id,
          waitlist_entry_id,
          action,
          before_state,
          after_state,
          request_id
        )
        VALUES ($1, $2, $3, 'waitlist.note', $4::jsonb, $5::jsonb, $6)
      `,
      [
        actorUserId,
        updated.converted_user_id,
        updated.id,
        JSON.stringify({ internalNote: current.internal_note }),
        JSON.stringify({ internalNote: updated.internal_note }),
        input.requestId,
      ],
    );
    return fromRow(updated);
  });
}
