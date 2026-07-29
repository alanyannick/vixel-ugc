import { z } from "zod";

import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import {
  getStudioSessionIdentity,
  requireStudioSession,
} from "@/lib/server/auth";
import {
  findOwnedMediaEntry,
  MediaLedgerError,
  publicLedgerEntry,
} from "@/lib/server/ledger";

export const runtime = "nodejs";
export const maxDuration = 10;

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;
  const sessionIdentity = getStudioSessionIdentity(request);
  if (!sessionIdentity) {
    return apiError(
      401,
      "session_identity_required",
      "A signed studio session is required for media recovery.",
      false,
      requestId,
    );
  }
  const { entryId } = await context.params;
  if (!z.string().uuid().safeParse(entryId).success) {
    return apiError(
      400,
      "invalid_media_job_id",
      "The media job identifier is invalid.",
      false,
      requestId,
    );
  }
  try {
    const entry = await findOwnedMediaEntry(sessionIdentity, entryId);
    if (!entry) {
      return apiError(
        404,
        "media_job_not_found",
        "No media job owned by this studio session was found.",
        false,
        requestId,
      );
    }
    return jsonResponse({
      requestId,
      job: publicLedgerEntry(entry),
      result: entry.providerResult,
    });
  } catch (error) {
    return apiError(
      503,
      error instanceof MediaLedgerError
        ? error.code
        : "database_unavailable",
      "The durable media ledger is unavailable.",
      false,
      requestId,
    );
  }
}
