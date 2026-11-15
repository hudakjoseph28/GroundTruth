import { createHmac, timingSafeEqual } from "node:crypto";

export interface QuickNodeSignatureInput {
  /** The Stream's security token (Stream settings in QuickNode). */
  token: string;
  nonce: string;
  timestamp: string;
  /** Decompressed request body, byte for byte. */
  body: Buffer;
  /** Hex HMAC from the X-QN-Signature header. */
  signature: string;
}

/**
 * QuickNode Streams signs `nonce + timestamp + body` with HMAC-SHA256 keyed
 * by the Stream's security token and sends the hex digest. The body is the
 * decoded JSON, so a gzip delivery is verified after decompression.
 */
export function verifyQuickNodeSignature(
  input: QuickNodeSignatureInput,
): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(input.signature)) return false;
  const expected = createHmac("sha256", input.token)
    .update(input.nonce)
    .update(input.timestamp)
    .update(input.body)
    .digest();
  return timingSafeEqual(Buffer.from(input.signature, "hex"), expected);
}
