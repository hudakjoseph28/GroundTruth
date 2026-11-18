import { createHmac, timingSafeEqual } from "node:crypto";

/** ElevenLabs rejects post-call webhooks older than this (SDK default). */
export const ELEVENLABS_SIGNATURE_TOLERANCE_MS = 30 * 60 * 1000;

export type ElevenLabsSignatureResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "stale" | "mismatch" };

/**
 * Verifies the `ElevenLabs-Signature` header of a post-call webhook.
 *
 * The header is `t=<unix seconds>,v0=<hex>`, where the hex is
 * HMAC-SHA256(secret, `${t}.${rawBody}`). This mirrors `constructEvent` in
 * `@elevenlabs/elevenlabs-js` 2.75.0 (wrapper/webhooks.js), including its
 * 30-minute tolerance for old timestamps, but compares in constant time.
 */
export function verifyElevenLabsSignature(input: {
  secret: string;
  header: string;
  body: Buffer;
  now: Date;
}): ElevenLabsSignatureResult {
  const parts = input.header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v0="))?.slice(3);
  if (
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    !signature ||
    !/^[0-9a-f]{64}$/.test(signature)
  ) {
    return { ok: false, reason: "malformed" };
  }

  const signedAtMs = Number(timestamp) * 1000;
  if (signedAtMs < input.now.getTime() - ELEVENLABS_SIGNATURE_TOLERANCE_MS) {
    return { ok: false, reason: "stale" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.`)
    .update(input.body)
    .digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected)
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}
