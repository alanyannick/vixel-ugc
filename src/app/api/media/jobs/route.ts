import { apiError, getRequestId, jsonResponse } from "@/lib/server/api";
import {
  getStudioSessionIdentity,
  requireStudioSession,
} from "@/lib/server/auth";
import {
  listOwnedMediaEntries,
  MediaLedgerError,
  publicLedgerEntry,
} from "@/lib/server/ledger";
import { getServerRuntimeConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const accessError = requireStudioSession(request, requestId);
  if (accessError) return accessError;

  const runtimeConfig = getServerRuntimeConfig();
  if (!runtimeConfig.databaseConfigured && !runtimeConfig.liveGeneration) {
    return jsonResponse({
      requestId,
      jobs: [],
      recovery: "not_configured",
    });
  }

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

  try {
    const entries = await listOwnedMediaEntries(sessionIdentity);
    return jsonResponse({
      requestId,
      jobs: entries.map(publicLedgerEntry),
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
