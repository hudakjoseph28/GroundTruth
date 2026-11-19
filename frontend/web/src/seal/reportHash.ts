// "Save this report on Solana": a SHA-256 fingerprint of a parcel report and
// the Memo text that records it on devnet. Pure, with no wallet or RPC code,
// so the parcel page can show the fingerprint before any wallet code loads.
//
// What is hashed: canonical JSON of { parcelKey, generatedAt, checks }, the
// report's identity and every finding, source, and gap it states. Coverage
// and the biggest open question are derived from the checks, so they add
// nothing to the fingerprint.

import {
  MEMO_PROGRAM_ID,
  isSha256Hex,
  type EscrowInstructionSpec,
  type ParcelReport,
} from "@groundtruth/shared";

/** A saved report carries the memo `groundtruth:report:<sha256>`. */
export const REPORT_MEMO_PREFIX = "groundtruth:report:";

/** The fields a fingerprint covers, in the shape that is hashed. */
export function reportSealPayload(report: ParcelReport): {
  parcelKey: string;
  generatedAt: string;
  checks: ParcelReport["checks"];
} {
  return {
    parcelKey: report.parcelKey,
    generatedAt: report.generatedAt,
    checks: report.checks,
  };
}

/**
 * JSON with object keys sorted (by UTF-16 code unit, as RFC 8785 does), no
 * whitespace, and `undefined` members left out, so the same report always
 * gives the same bytes however its object was built. Array order is kept:
 * the checks' order is part of the report. Throws on anything JSON cannot
 * carry exactly (NaN, Infinity, functions, bigint).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("A report fingerprint can't include NaN or Infinity.");
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        // JSON.stringify writes a missing array item as null; so do we.
        return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      return `{${members.join(",")}}`;
    }
    default:
      throw new Error(`A report fingerprint can't include a ${typeof value}.`);
  }
}

/** The exact text that is hashed for a report. */
export function reportCanonicalJson(report: ParcelReport): string {
  return canonicalJson(reportSealPayload(report));
}

/** Lowercase hex SHA-256 of UTF-8 text, from the browser's Web Crypto. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The report's fingerprint: SHA-256 of its canonical JSON. */
export function reportHash(report: ParcelReport): Promise<string> {
  return sha256Hex(reportCanonicalJson(report));
}

/** The memo text for a report fingerprint. */
export function reportMemo(sha256: string): string {
  if (!isSha256Hex(sha256)) {
    throw new Error("A report memo needs a lowercase hex SHA-256.");
  }
  return `${REPORT_MEMO_PREFIX}${sha256}`;
}

/** The fingerprint a memo names, or null if it is not a report memo. */
export function parseReportMemo(text: string): string | null {
  if (!text.startsWith(REPORT_MEMO_PREFIX)) return null;
  const sha256 = text.slice(REPORT_MEMO_PREFIX.length);
  return isSha256Hex(sha256) ? sha256 : null;
}

/**
 * A Memo v1 instruction recording `groundtruth:report:<sha256>`, listing the
 * wallet that pays and signs. Memo v1 because v2 has no account on devnet
 * (see MEMO_PROGRAM_ID in @groundtruth/shared).
 */
export function reportMemoInstruction(input: {
  signer: string;
  sha256: string;
}): EscrowInstructionSpec {
  return {
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: input.signer, isSigner: true, isWritable: false }],
    data: new TextEncoder().encode(reportMemo(input.sha256)),
  };
}
