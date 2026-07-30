import { createHash } from "node:crypto";

import { Resend } from "resend";
import { Webhook } from "svix";
import { z } from "zod";

import {
  lifecycleEmail,
  type LifecycleEmailType,
} from "./email-templates";
import { envValue, getServerRuntimeConfig } from "./env";
import { productQuery, withProductTransaction } from "./product-db";

type DeliveryStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "canceled";

type DeliveryRow = {
  id: string;
  event_type: LifecycleEmailType;
  recipient_email: string;
  idempotency_key: string;
  status: DeliveryStatus;
  template_payload: Record<string, unknown>;
  attempts: number;
  claimed_at: Date | string | null;
};

export type DeliveryRun = {
  claimed: number;
  sent: number;
  failed: number;
};

type PreferenceProjectionRow = {
  email: string;
  product_updates_opted_in: boolean;
  provider_contact_id: string | null;
};

const resendEventSchema = z.object({
  type: z.string().max(200),
  data: z
    .object({
      email_id: z.string().max(200).optional(),
      to: z.array(z.string().email().max(320)).max(50).optional(),
    })
    .passthrough(),
});

function resendClient(): Resend | null {
  const key = envValue(process.env, "RESEND_API_KEY");
  return key ? new Resend(key) : null;
}

export async function claimEmailDeliveries(
  limit = 10,
): Promise<DeliveryRow[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 25);
  return withProductTransaction(async (client) => {
    const result = await client.query<DeliveryRow>(
      `
        WITH candidates AS (
          SELECT id
          FROM vixel_ugc.email_delivery_ledger
          WHERE attempts < 5
            AND (
              (
                status IN ('pending', 'failed')
                AND next_attempt_at <= now()
              )
              OR (
                status = 'processing'
                AND claimed_at < now() - interval '15 minutes'
              )
            )
          ORDER BY next_attempt_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE vixel_ugc.email_delivery_ledger delivery
        SET
          status = 'processing',
          attempts = attempts + 1,
          claimed_at = now(),
          last_error_code = NULL
        FROM candidates
        WHERE delivery.id = candidates.id
        RETURNING
          delivery.id,
          delivery.event_type,
          delivery.recipient_email,
          delivery.idempotency_key,
          delivery.status,
          delivery.template_payload,
          delivery.attempts,
          delivery.claimed_at
      `,
      [boundedLimit],
    );
    return result.rows;
  });
}

export async function deliverLifecycleEmails(
  limit = 10,
): Promise<DeliveryRun> {
  const runtime = getServerRuntimeConfig();
  const client = resendClient();
  const from = envValue(process.env, "RESEND_TRANSACTIONAL_FROM");
  const replyTo = envValue(process.env, "RESEND_REPLY_TO");
  if (
    !runtime.product.features.lifecycleEmail.ready ||
    !runtime.product.siteUrl ||
    !client ||
    !from
  ) {
    return { claimed: 0, sent: 0, failed: 0 };
  }

  const deliveries = await claimEmailDeliveries(limit);
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const message = lifecycleEmail(
      delivery.event_type,
      delivery.template_payload,
      runtime.product.siteUrl,
    );
    try {
      const result = await client.emails.send(
        {
          from,
          to: [delivery.recipient_email],
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: replyTo || undefined,
        },
        { idempotencyKey: delivery.idempotency_key },
      );
      if (result.error || !result.data?.id) {
        throw new Error(result.error?.name ?? "provider_rejected");
      }
      await productQuery(
        `
          UPDATE vixel_ugc.email_delivery_ledger
          SET
            status = 'sent',
            provider_message_id = $2,
            sent_at = now(),
            last_error_code = NULL
          WHERE id = $1
            AND status = 'processing'
        `,
        [delivery.id, result.data.id],
      );
      sent += 1;
    } catch (error) {
      const code =
        error instanceof Error
          ? error.name.slice(0, 120)
          : "provider_error";
      await productQuery(
        `
          UPDATE vixel_ugc.email_delivery_ledger
          SET
            status = 'failed',
            last_error_code = $2,
            next_attempt_at = now() + (
              interval '5 minutes' * greatest(attempts, 1)
            )
          WHERE id = $1
            AND status = 'processing'
        `,
        [delivery.id, code],
      );
      failed += 1;
    }
  }
  return { claimed: deliveries.length, sent, failed };
}

export async function projectProductUpdatePreferences(
  limit = 25,
): Promise<{ projected: number; failed: number }> {
  const client = resendClient();
  const segmentId = envValue(
    process.env,
    "RESEND_PRODUCT_UPDATES_SEGMENT_ID",
  );
  const topicId = envValue(
    process.env,
    "RESEND_PRODUCT_UPDATES_TOPIC_ID",
  );
  if (!client || !segmentId || !topicId) {
    return { projected: 0, failed: 0 };
  }
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const preferences = await productQuery<PreferenceProjectionRow>(
    `
      SELECT
        email,
        product_updates_opted_in,
        provider_contact_id
      FROM vixel_ugc.email_preferences
      WHERE provider_projected_at IS NULL
        OR updated_at > provider_projected_at
      ORDER BY updated_at
      LIMIT $1
    `,
    [boundedLimit],
  );

  let projected = 0;
  let failed = 0;
  for (const preference of preferences.rows) {
    try {
      const existing = await client.contacts.get({
        email: preference.email,
      });
      let contactId = existing.data?.id ?? null;
      if (!contactId && preference.product_updates_opted_in) {
        const created = await client.contacts.create({
          email: preference.email,
          segments: [{ id: segmentId }],
          topics: [{ id: topicId, subscription: "opt_in" }],
        });
        if (created.error || !created.data?.id) {
          throw new Error(created.error?.name ?? "contact_create_failed");
        }
        contactId = created.data.id;
      } else if (contactId) {
        const segments = await client.contacts.segments.list({
          email: preference.email,
        });
        if (segments.error) {
          throw new Error(segments.error.name);
        }
        const inSegment =
          segments.data?.data.some((segment) => segment.id === segmentId) ??
          false;
        if (preference.product_updates_opted_in && !inSegment) {
          const added = await client.contacts.segments.add({
            email: preference.email,
            segmentId,
          });
          if (added.error) throw new Error(added.error.name);
        }
        if (!preference.product_updates_opted_in && inSegment) {
          const removed = await client.contacts.segments.remove({
            email: preference.email,
            segmentId,
          });
          if (removed.error) throw new Error(removed.error.name);
        }
        const topics = await client.contacts.topics.update({
          email: preference.email,
          topics: [
            {
              id: topicId,
              subscription: preference.product_updates_opted_in
                ? "opt_in"
                : "opt_out",
            },
          ],
        });
        if (topics.error) throw new Error(topics.error.name);
      }
      await productQuery(
        `
          UPDATE vixel_ugc.email_preferences
          SET
            provider_contact_id = $2,
            provider_projected_at = now()
          WHERE email = $1
        `,
        [preference.email, contactId],
      );
      projected += 1;
    } catch {
      failed += 1;
    }
  }
  return { projected, failed };
}

export async function enqueueInvitationReminders(
  limit = 25,
): Promise<number> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  return withProductTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        WITH candidates AS (
          SELECT id
          FROM vixel_ugc.waitlist_entries
          WHERE status = 'invited'
            AND invited_at <= now() - interval '48 hours'
            AND invitation_expires_at > now()
            AND (
              last_reminder_at IS NULL
              OR last_reminder_at <= now() - interval '72 hours'
            )
          ORDER BY invited_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ),
        updated AS (
          UPDATE vixel_ugc.waitlist_entries entry
          SET last_reminder_at = now()
          FROM candidates
          WHERE entry.id = candidates.id
          RETURNING
            entry.id,
            entry.email,
            entry.display_name,
            entry.converted_user_id,
            entry.invitation_expires_at,
            entry.last_reminder_at
        )
        INSERT INTO vixel_ugc.email_delivery_ledger (
          event_type,
          recipient_email,
          user_id,
          waitlist_entry_id,
          idempotency_key,
          template_payload
        )
        SELECT
          'invitation_reminder',
          email,
          converted_user_id,
          id,
          'invitation_reminder:' || id || ':' ||
            to_char(last_reminder_at at time zone 'UTC', 'YYYY-MM-DD'),
          jsonb_build_object(
            'displayName', display_name,
            'invitationExpiresAt', invitation_expires_at
          )
        FROM updated
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `,
      [boundedLimit],
    );
    return result.rowCount ?? 0;
  });
}

export function verifyResendWebhook(input: {
  rawBody: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}): z.infer<typeof resendEventSchema> {
  const secret = envValue(process.env, "RESEND_WEBHOOK_SECRET");
  if (
    !secret ||
    !input.svixId ||
    !input.svixTimestamp ||
    !input.svixSignature
  ) {
    throw new Error("invalid_webhook_signature");
  }
  const verified = new Webhook(secret).verify(input.rawBody, {
    "svix-id": input.svixId,
    "svix-timestamp": input.svixTimestamp,
    "svix-signature": input.svixSignature,
  });
  return resendEventSchema.parse(verified);
}

export async function projectResendWebhook(input: {
  eventId: string;
  event: z.infer<typeof resendEventSchema>;
  rawBody: string;
}): Promise<{ duplicate: boolean; suppressed: number }> {
  const digest = createHash("sha256")
    .update(input.rawBody, "utf8")
    .digest("hex");
  const suppressionEvent = [
    "email.bounced",
    "email.complained",
    "email.suppressed",
  ].includes(input.event.type);

  return withProductTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO vixel_ugc.provider_webhook_events (
          provider,
          provider_event_id,
          event_type,
          payload_sha256
        )
        VALUES ('resend', $1, $2, $3)
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id
      `,
      [input.eventId, input.event.type, digest],
    );
    if (!inserted.rows[0]) {
      return { duplicate: true, suppressed: 0 };
    }

    if (!suppressionEvent || !input.event.data.to?.length) {
      return { duplicate: false, suppressed: 0 };
    }
    const recipients = input.event.data.to.map((email) =>
      email.trim().toLowerCase(),
    );
    const updated = await client.query(
      `
        UPDATE vixel_ugc.email_preferences
        SET
          product_updates_opted_in = false,
          consent_source = NULL,
          consent_recorded_at = NULL,
          suppressed_at = now(),
          suppression_reason = $2
        WHERE email = ANY($1::text[])
      `,
      [recipients, input.event.type],
    );
    return {
      duplicate: false,
      suppressed: updated.rowCount ?? 0,
    };
  });
}
