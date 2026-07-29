import { Buffer } from "node:buffer";

import { z } from "zod";

export const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
export const MAX_REFERENCE_DATA_URL_LENGTH = 11 * 1024 * 1024;

const DATA_IMAGE_PATTERN =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export type ParsedImageDataUrl = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
};

function hasExpectedSignature(
  mimeType: ParsedImageDataUrl["mimeType"],
  bytes: Uint8Array,
): boolean {
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9
    );
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export function parseImageDataUrl(value: string): ParsedImageDataUrl | null {
  if (!value || value.length > MAX_REFERENCE_DATA_URL_LENGTH) return null;
  const match = DATA_IMAGE_PATTERN.exec(value);
  if (!match) return null;

  const mimeType = match[1] as ParsedImageDataUrl["mimeType"];
  const encoded = match[2];
  if (encoded.length % 4 === 1) return null;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) return null;
  if (Buffer.from(bytes).toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    return null;
  }
  if (!hasExpectedSignature(mimeType, bytes)) return null;
  return { mimeType, bytes };
}

export const imageDataUrlSchema = z
  .string()
  .max(MAX_REFERENCE_DATA_URL_LENGTH)
  .refine((value) => parseImageDataUrl(value) !== null, {
    message: "A PNG, JPEG, or WebP base64 data URL is required.",
  });
