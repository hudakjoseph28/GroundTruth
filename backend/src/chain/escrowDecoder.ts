import { BorshCoder, BN, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  type Hold,
  type ReviewerRole,
} from "@groundtruth/shared";
import type {
  ConfirmedTransaction,
  ProgramEvent,
  TransactionDecoder,
} from "./programEvents.js";

/**
 * A transaction the API cannot read as GroundTruth events. The webhook
 * answers 500 for it, so QuickNode retries and nothing is acknowledged.
 */
export class EscrowDecodeError extends Error {
  override name = "EscrowDecodeError";
}

const IDL = GROUNDTRUTH_ESCROW_IDL as unknown as Idl;

const ROLES: Record<string, ReviewerRole> = {
  Title: "title",
  Survey: "survey",
  Septic: "septic",
};

const HOLD_REASONS: Record<string, Hold["reasonCode"]> = {
  SellerIdentityDisputed: "SELLER_IDENTITY_DISPUTED",
  TitleException: "TITLE_EXCEPTION",
  SiteReviewFailed: "SITE_REVIEW_FAILED",
  Other: "OTHER",
};

/** Program error numbers to names, from the IDL (6000 and up). */
const PROGRAM_ERRORS = new Map(
  (IDL.errors ?? []).map((error) => [error.code, error.name]),
);

const INVOKE = /^Program (\S+) invoke \[\d+\]$/;
const SUCCESS = /^Program (\S+) success$/;
const FAILED = /^Program (\S+) failed: /;
const DATA = /^Program data: (\S+)$/;
// Anchor logs every error the program returns this way, e.g.
// "Program log: AnchorError thrown in …. Error Code: DealHeld. Error Number: 6019. Error Message: …".
const ANCHOR_ERROR =
  /^Program log: AnchorError .*Error Code: (\w+)\. Error Number: (\d+)\./;

/**
 * Decodes GroundTruth escrow events from a transaction's logs, using the
 * checked-in IDL's own Borsh coder.
 *
 * - Only `Program data:` lines written while the GroundTruth program is the
 *   program running are read. The invoke/success stack is tracked, so another
 *   program (even one CPI-called by GroundTruth, or calling it) cannot log a
 *   line that is read as a GroundTruth event.
 * - An unknown discriminator, data that does not decode exactly, an
 *   unbalanced invoke stack, or truncated logs throw EscrowDecodeError.
 * - A failed transaction never yields program events (anything it logged
 *   was rolled back). A failed `release` yields one `ReleaseRejected`.
 */
export function createEscrowDecoder(
  programId: string = GROUNDTRUTH_PROGRAM_ID,
): TransactionDecoder {
  const coder = new BorshCoder(IDL);

  return (tx: ConfirmedTransaction): ProgramEvent[] => {
    if (tx.err !== undefined && tx.err !== null) {
      return [rejectedRelease(tx, programId)];
    }
    const events: ProgramEvent[] = [];
    for (const { line, program } of attributedLines(tx.logMessages)) {
      if (program !== programId) continue;
      const data = DATA.exec(line);
      if (data?.[1]) events.push(decodeEvent(coder, data[1]));
    }
    return events;
  };
}

/** Each log line with the program that was running when it was written. */
function* attributedLines(
  logs: string[],
): Generator<{ line: string; program: string | undefined }> {
  const stack: string[] = [];
  for (const line of logs) {
    if (line === "Log truncated") {
      throw new EscrowDecodeError("Transaction logs are truncated");
    }
    const invoke = INVOKE.exec(line);
    if (invoke?.[1]) {
      stack.push(invoke[1]);
      continue;
    }
    const done = SUCCESS.exec(line) ?? FAILED.exec(line);
    if (done?.[1]) {
      if (stack.pop() !== done[1]) {
        throw new EscrowDecodeError("Program invoke stack is unbalanced");
      }
      continue;
    }
    yield { line, program: stack.at(-1) };
  }
  if (stack.length > 0) {
    throw new EscrowDecodeError("Program invoke stack is unbalanced");
  }
}

function decodeEvent(coder: BorshCoder, base64: string): ProgramEvent {
  let decoded: { name: string; data: Record<string, unknown> } | null;
  try {
    decoded = coder.events.decode(base64);
  } catch {
    throw new EscrowDecodeError("GroundTruth event data does not decode");
  }
  if (!decoded) {
    throw new EscrowDecodeError("Unknown GroundTruth event discriminator");
  }
  // Borsh reads fields and ignores what is left over; re-encoding proves the
  // line held exactly one event and nothing else.
  const bytes = Buffer.from(base64, "base64");
  let length: number;
  try {
    length = 8 + coder.types.encode(decoded.name, decoded.data).length;
  } catch {
    throw new EscrowDecodeError("GroundTruth event data does not decode");
  }
  if (length !== bytes.length) {
    throw new EscrowDecodeError("GroundTruth event data has extra bytes");
  }
  return toProgramEvent(decoded.name, decoded.data);
}

function toProgramEvent(
  name: string,
  data: Record<string, unknown>,
): ProgramEvent {
  const dealPda = pubkey(data.deal);
  const dealId = hex(data.deal_id);
  switch (name) {
    case "DealInitialized":
      return { name, dealPda, dealId };
    case "DealFunded":
      return { name, dealPda, dealId, amountBaseUnits: amount(data.amount) };
    case "ApprovalSigned":
      return {
        name,
        dealPda,
        dealId,
        reviewerWallet: pubkey(data.reviewer),
        role: variant(data.role, ROLES),
      };
    case "HoldPlaced":
      return {
        name,
        dealPda,
        dealId,
        reviewerWallet: pubkey(data.reviewer),
        role: variant(data.role, ROLES),
        reasonCode: variant(data.reason_code, HOLD_REASONS),
      };
    case "DealReleased":
    case "DealRefunded":
      return {
        name,
        dealPda,
        dealId,
        amountBaseUnits: amount(data.amount),
        destinationTokenAccount: pubkey(data.destination_token_account),
      };
    default:
      throw new EscrowDecodeError(`Unexpected GroundTruth event ${name}`);
  }
}

/**
 * A failed `release`. The filter sends a failed transaction only when the
 * instruction that failed is a GroundTruth `release`, with its accounts.
 */
function rejectedRelease(
  tx: ConfirmedTransaction,
  programId: string,
): ProgramEvent {
  const dealPda = tx.releaseAccounts?.[1];
  if (!dealPda) {
    throw new EscrowDecodeError("Failed transaction has no release accounts");
  }
  const invoked = tx.logMessages.some(
    (line) => INVOKE.exec(line)?.[1] === programId,
  );
  if (!invoked) {
    throw new EscrowDecodeError("Failed transaction never invoked GroundTruth");
  }
  let fromLogs: { name: string; number: number } | undefined;
  for (const { line, program } of attributedLines(tx.logMessages)) {
    if (program !== programId) continue;
    const error = ANCHOR_ERROR.exec(line);
    if (error?.[1] && error[2]) {
      fromLogs = { name: error[1], number: Number(error[2]) };
    }
  }
  const custom = customErrorNumber(tx.err);
  if (fromLogs && custom !== null && custom !== fromLogs.number) {
    throw new EscrowDecodeError("Program error in logs differs from tx error");
  }
  const errorNumber = fromLogs?.number ?? custom;
  const errorName =
    fromLogs?.name ??
    (errorNumber === null ? null : (PROGRAM_ERRORS.get(errorNumber) ?? null));
  return { name: "ReleaseRejected", dealPda, errorName, errorNumber };
}

/** `{ InstructionError: [index, { Custom: 6019 }] }` → 6019. */
function customErrorNumber(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const instruction = (err as { InstructionError?: unknown }).InstructionError;
  if (!Array.isArray(instruction)) return null;
  const detail: unknown = instruction[1];
  if (typeof detail !== "object" || detail === null) return null;
  const custom = (detail as { Custom?: unknown }).Custom;
  return typeof custom === "number" ? custom : null;
}

function pubkey(value: unknown): string {
  if (value instanceof web3.PublicKey) return value.toBase58();
  throw new EscrowDecodeError("Expected a public key in GroundTruth event");
}

function hex(value: unknown): string {
  if (Array.isArray(value) && value.length === 32) {
    return Buffer.from(value as number[]).toString("hex");
  }
  throw new EscrowDecodeError("Expected a 32-byte deal ID");
}

function amount(value: unknown): string {
  if (BN.isBN(value)) return value.toString(10);
  throw new EscrowDecodeError("Expected a u64 amount");
}

/** Borsh enums decode as `{ Title: {} }`. */
function variant<T>(value: unknown, names: Record<string, T>): T {
  const key =
    typeof value === "object" && value !== null ? Object.keys(value)[0] : "";
  const mapped = key ? names[key] : undefined;
  if (mapped === undefined) {
    throw new EscrowDecodeError(`Unexpected enum variant ${key ?? ""}`);
  }
  return mapped;
}
