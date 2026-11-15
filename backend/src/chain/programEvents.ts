import type { Hold, ReviewerRole } from "@groundtruth/shared";

/**
 * GroundTruth escrow program events after decoding, in the API's own shape.
 *
 * Names and the dealPda / dealId / amount / destination fields come from
 * Escrow v1 in DataContract.md. The reviewer wallet, role, and reason code
 * on ApprovalSigned and HoldPlaced are the minimum the API needs to project
 * them; confirm the field set against the program IDL when it lands.
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
    };

/** One confirmed transaction as delivered by the QuickNode Stream filter. */
export interface ConfirmedTransaction {
  signature: string;
  slot: number;
  /** Unix seconds. */
  blockTime: number;
  logMessages: string[];
}

/** A decoded event with its position among the transaction's events. */
export interface ConfirmedEvent {
  signature: string;
  slot: number;
  blockTime: number;
  eventIndex: number;
  event: ProgramEvent;
}

/** Turns a transaction's logs into GroundTruth program events, in order. */
export type TransactionDecoder = (tx: ConfirmedTransaction) => ProgramEvent[];

/**
 * Placeholder until the escrow program's IDL exists. It fails instead of
 * returning no events: the webhook then answers 500, QuickNode retries and
 * pauses the Stream, and no confirmed event is acknowledged and lost.
 */
export const decoderPendingIdl: TransactionDecoder = () => {
  throw new Error("GroundTruth program IDL is not configured");
};

export function toConfirmedEvents(
  tx: ConfirmedTransaction,
  decode: TransactionDecoder,
): ConfirmedEvent[] {
  return decode(tx).map((event, eventIndex) => ({
    signature: tx.signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    eventIndex,
    event,
  }));
}
