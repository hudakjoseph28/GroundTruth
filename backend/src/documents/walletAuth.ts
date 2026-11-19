import { createPublicKey, verify } from "node:crypto";
import { utils } from "@anchor-lang/core";
import {
  DOCUMENT_AUTH_HEADERS,
  DOCUMENT_AUTH_MAX_AGE_MS,
  DOCUMENT_AUTH_MAX_SKEW_MS,
  documentAuthMessage,
  type DealParticipantRole,
  type DocumentAuthRequest,
} from "@groundtruth/shared";
import type { Request } from "express";
import { HttpError } from "../http/errors.js";

/** The parts of a deal that say who may touch its documents. */
export interface DealParticipants {
  id: string;
  buyerWallet: string;
  sellerWallet: string;
  reviewers: { wallet: string; role: string; position: number }[];
}

/** A signed document request the API accepted. */
export interface VerifiedParticipant {
  wallet: string;
  role: DealParticipantRole;
  nonce: string;
}

const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NONCE = /^[0-9a-f]{32}$/;
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const unauthorized = (message: string) =>
  new HttpError(401, "FORBIDDEN", message, false);

/**
 * Checks a wallet-signed document request against one deal:
 *
 * 1. The headers are present and well formed.
 * 2. `issuedAt` is no older than five minutes and not in the future.
 * 3. The ed25519 signature is the wallet's, over the exact message the API
 *    rebuilds from the route (deal, action, file hash or document) and the
 *    headers. Nothing in the message is taken from the browser as text.
 * 4. The wallet is bound to the deal as its buyer, seller, or a reviewer.
 *
 * The nonce is returned for the caller to burn; it is not stored here.
 * Throws HttpError 401 for a missing, malformed, stale, or wrong signature
 * and 403 for a valid signature from a wallet that is not on the deal.
 */
export function verifyParticipantRequest(
  req: Request,
  deal: DealParticipants,
  request: DocumentAuthRequest,
  now: Date,
): VerifiedParticipant {
  const wallet = req.get(DOCUMENT_AUTH_HEADERS.wallet) ?? "";
  const issuedAt = req.get(DOCUMENT_AUTH_HEADERS.issuedAt) ?? "";
  const nonce = req.get(DOCUMENT_AUTH_HEADERS.nonce) ?? "";
  const signatureB64 = req.get(DOCUMENT_AUTH_HEADERS.signature) ?? "";

  if (!wallet || !issuedAt || !nonce || !signatureB64) {
    throw unauthorized(
      "Connect a wallet on this deal and sign the request to continue.",
    );
  }
  const publicKey = BASE58_KEY.test(wallet) ? decodeBase58(wallet) : null;
  const signature = Buffer.from(signatureB64, "base64");
  if (
    !publicKey ||
    publicKey.length !== 32 ||
    !NONCE.test(nonce) ||
    !ISO_MS.test(issuedAt) ||
    signature.length !== 64
  ) {
    throw unauthorized("The signed request is malformed. Sign it again.");
  }

  const issued = Date.parse(issuedAt);
  const age = now.getTime() - issued;
  if (Number.isNaN(issued) || age > DOCUMENT_AUTH_MAX_AGE_MS) {
    throw unauthorized(
      "This signature has expired. Sign the request again to continue.",
    );
  }
  if (age < -DOCUMENT_AUTH_MAX_SKEW_MS) {
    throw unauthorized(
      "This signature is dated in the future. Check your device clock and sign again.",
    );
  }

  const message = documentAuthMessage({
    dealId: deal.id,
    wallet,
    issuedAt,
    nonce,
    request,
  });
  if (!verifyEd25519(publicKey, Buffer.from(message, "utf8"), signature)) {
    throw unauthorized(
      "The signature does not match this wallet and request. Sign it again.",
    );
  }

  const role = participantRole(deal, wallet);
  if (!role) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only this deal's buyer, seller, or assigned reviewers can do this.",
      false,
    );
  }
  return { wallet, role, nonce };
}

/**
 * The role a wallet holds on a deal. A wallet bound in more than one role is
 * named by the first of buyer, seller, then reviewers in deal order.
 */
export function participantRole(
  deal: DealParticipants,
  wallet: string,
): DealParticipantRole | null {
  if (wallet === deal.buyerWallet) return "buyer";
  if (wallet === deal.sellerWallet) return "seller";
  const reviewer = [...deal.reviewers]
    .sort((a, b) => a.position - b.position)
    .find((r) => r.wallet === wallet);
  if (
    reviewer &&
    (reviewer.role === "title" ||
      reviewer.role === "survey" ||
      reviewer.role === "septic")
  ) {
    return reviewer.role;
  }
  return null;
}

function decodeBase58(value: string): Buffer | null {
  try {
    return Buffer.from(utils.bytes.bs58.decode(value));
  } catch {
    return null;
  }
}

function verifyEd25519(
  publicKey: Buffer,
  message: Buffer,
  signature: Buffer,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: "der",
      type: "spki",
    });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
}
