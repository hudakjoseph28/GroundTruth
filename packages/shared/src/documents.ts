// Deal documents: the wallet-signed message that proves a participant is
// asking, and the Memo instruction that ties an approval to a document hash.
// No runtime dependencies, so the web app and the API build the exact same
// bytes from the same inputs.
import type { EscrowInstructionSpec } from "./reviewerInstructions.js";

/**
 * SPL Memo v1, the Memo program an approval's document memo is sent to.
 * Memo v2 (`MemoSq4…`) has no account on Solana devnet as of 2026-11-19
 * (getAccountInfo returns null; a transaction using it fails with
 * ProgramAccountNotFound), so the builder uses v1. Neither version's logs
 * are relied on: v1 logs nothing, so the API reads the instruction text.
 */
export const MEMO_PROGRAM_ID = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";

/** Both Memo programs whose instructions the Stream filter collects. */
export const MEMO_PROGRAM_IDS = [
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
  "MemoSq4gqABAXKb96qnH8TyNmwnmJ6NerJ2SZcfSLgW",
] as const;

/** An approval relying on a document carries the memo `groundtruth:doc:<sha256>`. */
export const DOCUMENT_MEMO_PREFIX = "groundtruth:doc:";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

/** The memo text for a document hash. */
export function documentMemo(sha256: string): string {
  if (!isSha256Hex(sha256)) {
    throw new Error("A document memo needs a lowercase hex SHA-256.");
  }
  return `${DOCUMENT_MEMO_PREFIX}${sha256}`;
}

/**
 * A Memo instruction recording `groundtruth:doc:<sha256>`, listing `signer`
 * (the reviewer, who already signs the transaction). Put it in the same
 * transaction as `sign_approval`.
 */
export function documentMemoInstruction(input: {
  signer: string;
  sha256: string;
}): EscrowInstructionSpec {
  return {
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: input.signer, isSigner: true, isWritable: false }],
    data: new TextEncoder().encode(documentMemo(input.sha256)),
  };
}

/** How long a signed document request stays valid. */
export const DOCUMENT_AUTH_MAX_AGE_MS = 5 * 60 * 1000;
/** How far ahead of the API's clock a signed request may be dated. */
export const DOCUMENT_AUTH_MAX_SKEW_MS = 60 * 1000;

export type DocumentAuthRequest =
  | { action: "upload"; sha256: string }
  | { action: "view"; documentId: string }
  | { action: "findings" };

/**
 * Headers that carry a signed document request. The API rebuilds the message
 * from the route and these values, so the browser never sends the message
 * text itself.
 */
export const DOCUMENT_AUTH_HEADERS = {
  wallet: "x-groundtruth-wallet",
  issuedAt: "x-groundtruth-issued-at",
  nonce: "x-groundtruth-nonce",
  /** Base64 of the wallet's 64-byte ed25519 signature. */
  signature: "x-groundtruth-signature",
} as const;

/** Upload headers besides the signature. The body is the raw file. */
export const DOCUMENT_UPLOAD_HEADERS = {
  type: "x-groundtruth-document-type",
  /** encodeURIComponent of the original filename. */
  filename: "x-groundtruth-filename",
} as const;

const ACTION_WORDS: Record<DocumentAuthRequest["action"], string> = {
  upload: "upload a document",
  view: "view a document",
  findings: "read what the documents say",
};

/**
 * The text a participant signs with their wallet (Phantom "Sign message").
 * One request, one deal, one wallet, a time, and a single-use nonce. An
 * upload also names the file's SHA-256, so the signature covers exactly
 * the bytes sent; a view names the document; reading findings covers
 * every document on the deal.
 */
export function documentAuthMessage(input: {
  dealId: string;
  wallet: string;
  issuedAt: string;
  nonce: string;
  request: DocumentAuthRequest;
}): string {
  const request = input.request;
  const lines = [
    "GroundTruth deal documents (staged demo)",
    `Action: ${ACTION_WORDS[request.action]}`,
    `Deal: ${input.dealId}`,
    request.action === "upload"
      ? `File SHA-256: ${request.sha256}`
      : request.action === "view"
        ? `Document: ${request.documentId}`
        : "Documents: every document on this deal",
    `Wallet: ${input.wallet}`,
    `Issued at: ${input.issuedAt}`,
    `Nonce: ${input.nonce}`,
    "Signing proves you hold this wallet. It moves no funds and approves nothing.",
  ];
  return lines.join("\n");
}
