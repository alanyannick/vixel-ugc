import type { JsonValue } from "./contracts";

function normalize(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Exact input cannot contain non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, JsonValue>>((result, key) => {
        if (record[key] !== undefined) {
          result[key] = normalize(record[key]);
        }
        return result;
      }, {});
  }
  throw new TypeError(`Unsupported exact-input value: ${typeof value}`);
}

export function canonicalizeExactInput(value: unknown): string {
  return JSON.stringify(normalize(value));
}

/**
 * A deterministic change detector for approvals and idempotency, not an
 * authentication primitive. Server adapters should use their own HMAC when a
 * provider requires a cryptographic signature.
 */
export function exactInputSignature(value: unknown): string {
  const input = canonicalizeExactInput(value);
  const mask = 0xffff_ffff_ffff_ffffn;
  const prime = 1_099_511_628_211n;
  let first = 14_695_981_039_346_656_037n;
  let second = 7_804_984_079_179_515_679n;

  for (let index = 0; index < input.length; index += 1) {
    const codePoint = BigInt(input.charCodeAt(index));
    first = ((first ^ codePoint) * prime) & mask;
    second = ((second ^ (codePoint + BigInt(index))) * prime) & mask;
  }

  return `sig_v1_${first.toString(16).padStart(16, "0")}${second
    .toString(16)
    .padStart(16, "0")}`;
}

