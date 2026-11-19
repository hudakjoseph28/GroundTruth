import { z } from "zod";
import type { ApplyResult } from "./applyEvent.js";
import {
  toConfirmedEvents,
  type ConfirmedEvent,
  type TransactionDecoder,
} from "./programEvents.js";

const base58Key = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

/**
 * The body our Stream filter returns, in block order: successful
 * transactions that touched the GroundTruth program, and failed ones whose
 * failing instruction was a GroundTruth `release` (with that instruction's
 * accounts, so the deal can be found). A successful one may carry `memos`,
 * the text of its top-level Memo instructions. Keep in sync with
 * quicknode/groundtruth-filter.js and backend/README.md.
 *
 * The QuickNode webhook and `replay:devnet` both go through this module, so
 * a replayed deal is decoded and applied exactly as a delivery would be.
 */
export const streamPayloadSchema = z.object({
  transactions: z.array(
    z
      .object({
        signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
        slot: z.number().int().nonnegative(),
        blockTime: z.number().int().positive(),
        logMessages: z.array(z.string()),
        err: z.unknown().optional(),
        releaseAccounts: z.array(base58Key).min(2).optional(),
        /** Text of the transaction's top-level SPL Memo instructions. */
        memos: z.array(z.string().max(1024)).max(16).optional(),
      })
      .refine(
        (tx) =>
          tx.err === undefined || tx.err === null
            ? tx.releaseAccounts === undefined
            : tx.releaseAccounts !== undefined,
        "A failed transaction carries its release accounts; a successful one does not",
      ),
  ),
});

export class StreamPayloadError extends Error {
  constructor() {
    super("Stream payload does not match the GroundTruth filter output.");
    this.name = "StreamPayloadError";
  }
}

/**
 * Validates a filter payload and decodes every transaction in it. Decoding
 * the whole payload first means one unreadable transaction throws before
 * anything is applied.
 */
export function decodeStreamPayload(
  payload: unknown,
  decode: TransactionDecoder,
): ConfirmedEvent[] {
  const parsed = streamPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new StreamPayloadError();
  return parsed.data.transactions.flatMap((tx) =>
    toConfirmedEvents(tx, decode),
  );
}

export interface AppliedEvent {
  event: ConfirmedEvent;
  result: ApplyResult;
}

/** Applies decoded events one at a time, in chain order. */
export async function applyInOrder(
  events: ConfirmedEvent[],
  apply: (event: ConfirmedEvent) => Promise<ApplyResult>,
  onApplied?: (applied: AppliedEvent) => void,
): Promise<AppliedEvent[]> {
  const out: AppliedEvent[] = [];
  // Sequential on purpose: events must apply in chain order.
  for (const event of events) {
    const applied = { event, result: await apply(event) };
    onApplied?.(applied);
    out.push(applied);
  }
  return out;
}
