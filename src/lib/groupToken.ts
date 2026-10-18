import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Secrets for group outings, made on the server from crypto randomness.
 *
 * The share slug in the app comes from Math.random on the phone, which is
 * fine for a link somebody chooses to send. A group code is different: it is
 * the only thing between a stranger and a form that writes rows, so it is
 * 96 random bits, and the edit token a web answerer keeps is 256.
 */

/** 16 URL-safe characters (12 random bytes). */
export function newGroupCode(): string {
  return randomBytes(12).toString("base64url");
}

/** What a web answerer keeps to edit their answer later. Returned once, stored hashed. */
export function newEditToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** A plan share slug made on the server: randomSlug's alphabet, from crypto bytes. */
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function serverSlug(length = 10): string {
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // 31 symbols: drop bytes past the last whole multiple so none is favoured.
      if (byte < 248 && out.length < length) out += SLUG_ALPHABET[byte % 31];
    }
  }
  return out;
}
