import { withProductTransaction } from "./product-db";

type CampaignRow = {
  campaign_key: string;
  title: string;
  snapshot: unknown;
  revision: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CloudCampaign = {
  campaignKey: string;
  title: string;
  snapshot: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export class CloudCampaignError extends Error {
  constructor(
    readonly code: "not_found" | "revision_conflict",
    message: string,
    readonly currentRevision?: number,
  ) {
    super(message);
    this.name = "CloudCampaignError";
  }
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function fromRow(row: CampaignRow): CloudCampaign {
  return {
    campaignKey: row.campaign_key,
    title: row.title,
    snapshot: row.snapshot,
    revision: Number(row.revision),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listCloudCampaigns(
  userId: string,
): Promise<CloudCampaign[]> {
  return withProductTransaction(async (client) => {
    const result = await client.query<CampaignRow>(
      `
        SELECT
          campaign_key,
          title,
          snapshot,
          revision,
          created_at,
          updated_at
        FROM vixel_ugc.campaign_snapshots
        WHERE user_id = $1
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 50
      `,
      [userId],
    );
    return result.rows.map(fromRow);
  });
}

export async function saveCloudCampaign(input: {
  userId: string;
  campaignKey: string;
  title: string;
  snapshot: unknown;
  revision: number;
  expectedRevision: number | null;
}): Promise<CloudCampaign> {
  return withProductTransaction(async (client) => {
    const current = await client.query<CampaignRow>(
      `
        SELECT
          campaign_key,
          title,
          snapshot,
          revision,
          created_at,
          updated_at
        FROM vixel_ugc.campaign_snapshots
        WHERE user_id = $1
          AND campaign_key = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [input.userId, input.campaignKey],
    );

    if (!current.rows[0]) {
      if (input.expectedRevision !== null) {
        throw new CloudCampaignError(
          "revision_conflict",
          "The campaign no longer exists at the expected revision.",
        );
      }
      const inserted = await client.query<CampaignRow>(
        `
          INSERT INTO vixel_ugc.campaign_snapshots (
            user_id,
            campaign_key,
            title,
            snapshot,
            revision
          )
          VALUES ($1, $2, $3, $4::jsonb, $5)
          RETURNING
            campaign_key,
            title,
            snapshot,
            revision,
            created_at,
            updated_at
        `,
        [
          input.userId,
          input.campaignKey,
          input.title,
          JSON.stringify(input.snapshot),
          input.revision,
        ],
      );
      return fromRow(inserted.rows[0]);
    }

    const existing = fromRow(current.rows[0]);
    if (
      input.expectedRevision === null ||
      input.expectedRevision !== existing.revision ||
      input.revision !== existing.revision + 1
    ) {
      if (
        input.revision === existing.revision &&
        JSON.stringify(input.snapshot) === JSON.stringify(existing.snapshot)
      ) {
        return existing;
      }
      throw new CloudCampaignError(
        "revision_conflict",
        "A newer campaign revision already exists.",
        existing.revision,
      );
    }

    const updated = await client.query<CampaignRow>(
      `
        UPDATE vixel_ugc.campaign_snapshots
        SET
          title = $3,
          snapshot = $4::jsonb,
          revision = $5
        WHERE user_id = $1
          AND campaign_key = $2
          AND revision = $6
          AND deleted_at IS NULL
        RETURNING
          campaign_key,
          title,
          snapshot,
          revision,
          created_at,
          updated_at
      `,
      [
        input.userId,
        input.campaignKey,
        input.title,
        JSON.stringify(input.snapshot),
        input.revision,
        input.expectedRevision,
      ],
    );
    if (!updated.rows[0]) {
      throw new CloudCampaignError(
        "revision_conflict",
        "A newer campaign revision already exists.",
      );
    }
    return fromRow(updated.rows[0]);
  });
}

export async function deleteCloudCampaign(input: {
  userId: string;
  campaignKey: string;
  expectedRevision: number;
}): Promise<void> {
  return withProductTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE vixel_ugc.campaign_snapshots
        SET deleted_at = now()
        WHERE user_id = $1
          AND campaign_key = $2
          AND revision = $3
          AND deleted_at IS NULL
      `,
      [input.userId, input.campaignKey, input.expectedRevision],
    );
    if (result.rowCount !== 1) {
      const existing = await client.query<{ revision: number | string }>(
        `
          SELECT revision
          FROM vixel_ugc.campaign_snapshots
          WHERE user_id = $1
            AND campaign_key = $2
            AND deleted_at IS NULL
        `,
        [input.userId, input.campaignKey],
      );
      if (!existing.rows[0]) {
        throw new CloudCampaignError(
          "not_found",
          "The campaign was not found.",
        );
      }
      throw new CloudCampaignError(
        "revision_conflict",
        "A newer campaign revision already exists.",
        Number(existing.rows[0].revision),
      );
    }
  });
}
