import type { Hold, ReviewerRole } from "@groundtruth/shared";
import { documentHashFromMemos } from "./documentMemo.js";

/**
 * GroundTruth escrow program events after decoding, in the API's own shape.
 *
 * The six program events come from the checked-in IDL
 * (packages/shared/src/idl/groundtruth_escrow.json) via escrowDecoder.ts.
 * `dealId` is the 32-byte deal ID as lowercase hex.
 *
 * `ReleaseRejected` is not a program event: a failed `release` emits
 * nothing, so the decoder builds it from the failed transaction itself
 * (the deal PDA from the instruction's accounts, the error from the logs).
 */
export type ProgramEvent =
  | { name: "DealInitialized"; dealPda: string; dealId: string }
  | {
      name: "DealFunded";
      dealPda: string;
      dealId: string;
      amountBaseUnits: string;
    }
  | {
      name: "ApprovalSigned";
      dealPda: string;
      dealId: string;
      reviewerWallet: string;
      role: ReviewerRole;
    }
  | {
      name: "HoldPlaced";
      dealPda: string;
      dealId: string;
      reviewerWallet: string;
      role: ReviewerRole;
      reasonCode: Hold["reasonCode"];
    }
  | {
      name: "DealReleased";
      dealPda: string;
      dealId: string;
      amountBaseUnits: string;
      destinationTokenAccount: string;
    }
  | {
      name: "DealRefunded";
      dealPda: string;
      dealId: string;
      amountBaseUnits: string;
      destinationTokenAccount: string;
    }
  | {
      name: "ReleaseRejected";
      dealPda: string;
      /** Anchor error name from the program's logs, e.g. `DealHeld`. */
      errorName: string | null;
      /** Anchor error number, e.g. 6019. */
      errorNumber: number | null;
    };

/** One confirmed transaction as delivered by the QuickNode Stream filter. */
export interface ConfirmedTransaction {
  signature: string;
  slot: number;
  /** Unix seconds. */
  blockTime: number;
  logMessages: string[];
  /**
   * The transaction error, for a failed `release` only (the filter sends
   * no other failed transactions). Absent or null for a successful one.
   */
  err?: unknown;
  /** Accounts of the failed `release` instruction, in IDL order. */
  releaseAccounts?: string[];
  /** Text of the top-level SPL Memo instructions, from the Stream filter. */
  memos?: string[];
}

/** A decoded event with its position among the transaction's events. */
export interface ConfirmedEvent {
  signature: string;
  slot: number;
  blockTime: number;
  eventIndex: number;
  event: ProgramEvent;
  /**
   * The `groundtruth:doc:<sha256>` memo in the same successful transaction,
   * if it names exactly one document (chain/documentMemo.ts). Only an
   * approval records it.
   */
  documentSha256?: string;
}

/** Turns a transaction's logs into GroundTruth program events, in order. */
export type TransactionDecoder = (tx: ConfirmedTransaction) => ProgramEvent[];

export function toConfirmedEvents(
  tx: ConfirmedTransaction,
  decode: TransactionDecoder,
): ConfirmedEvent[] {
  const events = decode(tx);
  const failed = tx.err !== undefined && tx.err !== null;
  // A failed transaction's memo was rolled back with everything else.
  const documentSha256 =
    !failed && events.length > 0
      ? (documentHashFromMemos(tx.memos ?? []) ?? undefined)
      : undefined;
  return events.map((event, eventIndex) => ({
    signature: tx.signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    eventIndex,
    event,
    ...(documentSha256 ? { documentSha256 } : {}),
  }));
}
