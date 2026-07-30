import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type {
  ImageGenerationRequest,
  VideoGenerationRequest,
} from "./media";
import { imageSizeFor } from "./media";
import { getServerRuntimeConfig } from "./env";
import { normalizeImageModel } from "./provider";

export type MediaKind = "image" | "video";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type MediaApprovalClaims = {
  version: 1;
  sessionIdentity: string;
  kind: MediaKind;
  inputSignature: string;
  providerModel: string;
  adapterVersion: string;
  idempotencyKey: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

const APPROVAL_TTL_SECONDS = 5 * 60;
const TOKEN_PATTERN = /^ma1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const FALLBACK_ADAPTER_VERSION = "newapi-media-adapter:2026-07-30-v2";

function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function dataUrlDigest(value: string | undefined): string | null {
  return value ? digestText(value) : null;
}

export function canonicalImageApprovalInput(
  input: ImageGenerationRequest,
): Json {
  return {
    prompt: input.prompt,
    size: imageSizeFor(input.size, input.aspectRatio),
    aspectRatio: input.aspectRatio ?? null,
    references: input.references.map((reference, index) => ({
      order: index,
      role: reference.role ?? null,
      dataUrlSha256: dataUrlDigest(reference.dataUrl),
    })),
  };
}

export function canonicalVideoApprovalInput(
  input: VideoGenerationRequest,
): Json {
  return {
    prompt: input.prompt,
    imageDataUrlSha256: dataUrlDigest(input.imageDataUrl),
    lastImageDataUrlSha256: dataUrlDigest(input.lastImageDataUrl),
    durationSec: input.durationSec,
    ratio: input.ratio,
    resolution: input.resolution,
    generateAudio: input.generateAudio,
  };
}

export function mediaInputSignature(input: Json): string {
  return digestText(canonicalize(input));
}

export function providerModelFor(kind: MediaKind): string {
  const runtime = getServerRuntimeConfig();
  return kind === "image"
    ? normalizeImageModel(runtime.newApi.imageModel)
    : runtime.newApi.videoModel;
}

export function mediaAdapterVersion(): string {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return commit && /^[a-f0-9]{7,40}$/i.test(commit)
    ? `commit:${commit.toLowerCase()}`
    : FALLBACK_ADAPTER_VERSION;
}

function approvalSecret(): string | null {
  const root = process.env.STUDIO_SESSION_SECRET?.trim();
  if (!root) return null;
  return createHmac("sha256", root)
    .update("vixel-media-approval-signing-key:v1", "utf8")
    .digest("base64url");
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(`ma1.${encodedPayload}`, "utf8")
    .digest();
}

export function issueMediaApproval(input: {
  sessionIdentity: string;
  kind: MediaKind;
  inputSignature: string;
  providerModel: string;
  adapterVersion?: string;
  idempotencyKey: string;
  now?: number;
  ttlSeconds?: number;
  nonce?: string;
}): {
  token: string;
  claims: MediaApprovalClaims;
} | null {
  const secret = approvalSecret();
  if (!secret) return null;
  const adapterVersion =
    input.adapterVersion?.trim() || mediaAdapterVersion();
  if (
    !SHA256_PATTERN.test(input.sessionIdentity) ||
    !SHA256_PATTERN.test(input.inputSignature) ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey) ||
    !input.providerModel.trim() ||
    !adapterVersion
  ) {
    return null;
  }
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const ttl = Math.max(
    30,
    Math.min(input.ttlSeconds ?? APPROVAL_TTL_SECONDS, APPROVAL_TTL_SECONDS),
  );
  const claims: MediaApprovalClaims = {
    version: 1,
    sessionIdentity: input.sessionIdentity,
    kind: input.kind,
    inputSignature: input.inputSignature,
    providerModel: input.providerModel.trim(),
    adapterVersion,
    idempotencyKey: input.idempotencyKey,
    issuedAt,
    expiresAt: issuedAt + ttl,
    nonce: input.nonce ?? randomUUID(),
  };
  const encoded = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  return {
    token: `ma1.${encoded}.${sign(encoded, secret).toString("base64url")}`,
    claims,
  };
}

export function verifyMediaApproval(
  token: string | null | undefined,
  expected: {
    sessionIdentity: string;
    kind: MediaKind;
    inputSignature: string;
    providerModel: string;
    adapterVersion?: string;
    idempotencyKey: string;
  },
  now = Date.now(),
): MediaApprovalClaims | null {
  const secret = approvalSecret();
  if (!secret || !token || token.length > 4_096) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;

  let suppliedSignature: Buffer;
  let claims: MediaApprovalClaims;
  try {
    suppliedSignature = Buffer.from(match[2], "base64url");
    claims = JSON.parse(
      Buffer.from(match[1], "base64url").toString("utf8"),
    ) as MediaApprovalClaims;
  } catch {
    return null;
  }
  const expectedSignature = sign(match[1], secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }
  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.version !== 1 ||
    claims.expiresAt <= nowSeconds ||
    claims.issuedAt > nowSeconds + 30 ||
    claims.expiresAt - claims.issuedAt > APPROVAL_TTL_SECONDS ||
    claims.sessionIdentity !== expected.sessionIdentity ||
    claims.kind !== expected.kind ||
    claims.inputSignature !== expected.inputSignature ||
    claims.providerModel !== expected.providerModel ||
    claims.adapterVersion !==
      (expected.adapterVersion?.trim() || mediaAdapterVersion()) ||
    claims.idempotencyKey !== expected.idempotencyKey
  ) {
    return null;
  }
  return claims;
}

export function approvalFingerprint(token: string): string {
  return digestText(`vixel-media-approval:v1\0${token}`);
}
