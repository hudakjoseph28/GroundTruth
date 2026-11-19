/**
 * Test wallets for deal documents: real ed25519 keys, so a signature here is
 * checked exactly as a Phantom "Sign message" signature would be.
 */
import {
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { utils } from "@anchor-lang/core";
import {
  DOCUMENT_AUTH_HEADERS,
  documentAuthMessage,
  type DocumentAuthRequest,
} from "@groundtruth/shared";

export interface TestWallet {
  address: string;
  privateKey: KeyObject;
}

export function testWallet(): TestWallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { address: utils.bytes.bs58.encode(raw), privateKey };
}

/** Headers for one signed document request. */
export function signedHeaders(input: {
  wallet: TestWallet;
  dealId: string;
  request: DocumentAuthRequest;
  issuedAt?: string;
  nonce?: string;
  /** Sign a different message than the one the headers describe. */
  tamper?: (message: string) => string;
}): Record<string, string> {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const message = documentAuthMessage({
    dealId: input.dealId,
    wallet: input.wallet.address,
    issuedAt,
    nonce,
    request: input.request,
  });
  const signed = input.tamper ? input.tamper(message) : message;
  const signature = sign(
    null,
    Buffer.from(signed, "utf8"),
    input.wallet.privateKey,
  );
  return {
    [DOCUMENT_AUTH_HEADERS.wallet]: input.wallet.address,
    [DOCUMENT_AUTH_HEADERS.issuedAt]: issuedAt,
    [DOCUMENT_AUTH_HEADERS.nonce]: nonce,
    [DOCUMENT_AUTH_HEADERS.signature]: signature.toString("base64"),
  };
}

/** A tiny, obviously fake PDF. */
export function fakePdf(label = "TEST"): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% GroundTruth staged demo test file. NOT A REAL DOCUMENT. ${label}\n%%EOF\n`,
    "latin1",
  );
}

/** The 8-byte PNG signature followed by a few bytes. */
export function fakePng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("not really an image"),
  ]);
}
