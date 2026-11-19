// Solana Pay transaction request for funding a draft deal (devnet only).
// Wire format: the Solana Pay spec's "Transaction Request" (v1.1 error
// handling). The API builds the buyer's `fund` transaction unsigned; the
// wallet signs and sends it. Nothing here signs.
import type { ApiError } from "./contract.js";

/** The transaction request endpoint for one deal, as a path on the API. */
export function solanaPayFundPath(dealId: string): string {
  return `/api/deals/${encodeURIComponent(dealId)}/solana-pay/fund`;
}

/**
 * `solana:<link>` for an absolute HTTPS link. The spec URL-encodes the link
 * only when it carries a query, which keeps the QR code less dense.
 */
export function solanaPayUrl(link: string): string {
  return `solana:${link.includes("?") ? encodeURIComponent(link) : link}`;
}

/** GET response: who is asking the wallet to sign. */
export interface SolanaPayLabel {
  label: string;
  icon: string;
}

/** POST body the wallet sends: the account that will sign. */
export interface SolanaPayTransactionRequest {
  account: string;
}

/** POST response: a base64 serialized transaction with no signatures. */
export interface SolanaPayTransactionResponse {
  transaction: string;
  message: string;
}

/**
 * A refusal. `message` is what a Solana Pay wallet shows (at least its first
 * 80 characters); `error` is GroundTruth's usual envelope.
 */
export type SolanaPayError = ApiError & { message: string };
