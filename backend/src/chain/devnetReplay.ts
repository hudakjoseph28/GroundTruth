import { readFileSync } from "node:fs";
import type { ApplyResult } from "./applyEvent.js";
import type { ConfirmedEvent, TransactionDecoder } from "./programEvents.js";
import {
  applyInOrder,
  decodeStreamPayload,
  type AppliedEvent,
} from "./streamPayload.js";

/**
 * Rebuilds a deal's timeline from chain history when QuickNode deliveries
 * were missed: the same transactions go through the same Stream filter,
 * payload schema, decoder, and applyConfirmedEvent as a live delivery.
 * Applying is idempotent (signature + event index), so replaying a deal any
 * number of times, or after QuickNode delivered some of it, adds nothing twice.
 */

/** One transaction as getTransaction returns it with jsonParsed encoding. */
export interface RpcTransaction {
  slot: number;
  blockTime: number | null;
  version?: unknown;
  transaction: { signatures: string[]; message: unknown };
  meta: { err: unknown; logMessages?: string[] | null } | null;
}

type StreamFilter = (stream: unknown) => { transactions: unknown[] } | null;

/** The Stream filter itself: quicknode/groundtruth-filter.js, unmodified. */
export function loadStreamFilter(): StreamFilter {
  const source = readFileSync(
    new URL("../../quicknode/groundtruth-filter.js", import.meta.url),
    "utf8",
  );
  return new Function(`${source}\nreturn main;`)() as StreamFilter;
}

/**
 * The body QuickNode would deliver for these transactions, each run through
 * the filter as its own Block dataset entry. `txs` must be in chain order.
 */
export function streamPayloadFor(
  txs: RpcTransaction[],
  filter: StreamFilter = loadStreamFilter(),
): { transactions: unknown[] } {
  return {
    transactions: txs.flatMap(
      (tx) =>
        filter({
          data: [
            {
              slot: tx.slot,
              blockTime: tx.blockTime,
              transactions: [
                {
                  version: tx.version,
                  transaction: tx.transaction,
                  meta: tx.meta,
                },
              ],
            },
          ],
        })?.transactions ?? [],
    ),
  };
}

/** Filter, decode (all first), then apply in order. */
export async function replayTransactions(
  txs: RpcTransaction[],
  options: {
    decode: TransactionDecoder;
    apply: (event: ConfirmedEvent) => Promise<ApplyResult>;
    filter?: StreamFilter;
    onApplied?: (applied: AppliedEvent) => void;
  },
): Promise<AppliedEvent[]> {
  const events = decodeStreamPayload(
    streamPayloadFor(txs, options.filter),
    options.decode,
  );
  return applyInOrder(events, options.apply, options.onApplied);
}
