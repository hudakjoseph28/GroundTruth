// Sending one Solana transaction so it lands, shared by the reviewer portal
// (browser wallet signs) and escrow/scripts/demo-deals.ts (keypairs sign):
//
// - a ComputeBudget unit limit sized from a simulation, and a unit price
//   taken from recent prioritization fees on the accounts the transaction
//   writes, capped so a fee spike cannot drain a staged wallet;
// - a fresh blockhash per attempt, with its lastValidBlockHeight;
// - while waiting, the same signed bytes are rebroadcast (same signature, so
//   at most one copy can land);
// - once the chain's block height passes lastValidBlockHeight with no trace
//   of the signature, that transaction can never land, so it is rebuilt on a
//   new blockhash, signed again, and sent: an automatic resend that cannot
//   double-send.
//
// No runtime dependencies: callers pass their own RPC and signing functions,
// and turn the instruction specs into their own transaction type.
import type { EscrowInstructionSpec } from "./reviewerInstructions.js";

export const COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";

/** The runtime's per-transaction compute ceiling. */
export const MAX_COMPUTE_UNITS = 1_400_000;

export const PRIORITY_FEE = {
  /** Which recent fee to match: the 75th percentile of the slots returned. */
  percentile: 75,
  /**
   * Price ceiling in micro-lamports per compute unit. At the full
   * 1.4M-unit ceiling that is 140,000 lamports (0.00014 SOL) per
   * transaction; an escrow instruction uses a small fraction of that.
   */
  maxMicroLamports: 100_000,
} as const;

export const COMPUTE_UNIT_MARGIN = {
  /** Headroom over the simulated units: 20%, plus a fixed 1,000. */
  ratio: 1.2,
  extra: 1_000,
} as const;

/** How many fresh-blockhash attempts before giving up. */
export const MAX_SEND_ATTEMPTS = 3;

/**
 * The unit price to pay, in micro-lamports: the configured percentile of
 * recent prioritization fees (zero when there are none), capped.
 */
export function priorityFeeMicroLamports(
  recent: readonly { prioritizationFee: number }[],
  cap: number = PRIORITY_FEE.maxMicroLamports,
): number {
  // Slots with no priority fee count as zero, so a quiet network pays zero.
  const fees = recent
    .map((r) =>
      Number.isFinite(r.prioritizationFee)
        ? Math.max(0, r.prioritizationFee)
        : 0,
    )
    .sort((a, b) => a - b);
  if (fees.length === 0) return 0;
  const rank = Math.ceil((PRIORITY_FEE.percentile / 100) * fees.length) - 1;
  return Math.min(Math.ceil(fees[Math.max(0, rank)]!), cap);
}

/**
 * The compute unit limit to request: simulated units plus margin, within
 * the runtime ceiling. Without a simulation figure it asks for the ceiling,
 * so the transaction is never cut short (the unit price is still capped).
 */
export function computeUnitLimit(
  unitsConsumed: number | null | undefined,
): number {
  if (typeof unitsConsumed !== "number" || !(unitsConsumed > 0)) {
    return MAX_COMPUTE_UNITS;
  }
  return Math.min(
    MAX_COMPUTE_UNITS,
    Math.ceil(unitsConsumed * COMPUTE_UNIT_MARGIN.ratio) +
      COMPUTE_UNIT_MARGIN.extra,
  );
}

/** Most this transaction can pay in priority fee, in lamports. */
export function maxPriorityFeeLamports(
  units: number = MAX_COMPUTE_UNITS,
  microLamports: number = PRIORITY_FEE.maxMicroLamports,
): bigint {
  return (BigInt(units) * BigInt(microLamports) + 999_999n) / 1_000_000n;
}

/** ComputeBudget SetComputeUnitLimit (u32) and SetComputeUnitPrice (u64). */
export function computeBudgetInstructions(budget: {
  units: number;
  microLamports: number;
}): EscrowInstructionSpec[] {
  const limit = new Uint8Array(5);
  limit[0] = 2;
  new DataView(limit.buffer).setUint32(1, budget.units, true);
  const price = new Uint8Array(9);
  price[0] = 3;
  new DataView(price.buffer).setBigUint64(
    1,
    BigInt(budget.microLamports),
    true,
  );
  return [
    { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data: limit },
    { programId: COMPUTE_BUDGET_PROGRAM_ID, keys: [], data: price },
  ];
}

/** Accounts the instructions write: the keys whose fee markets matter. */
export function writableAccounts(
  instructions: readonly EscrowInstructionSpec[],
): string[] {
  const keys = instructions.flatMap((ix) =>
    ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey),
  );
  // getRecentPrioritizationFees takes at most 128 addresses.
  return [...new Set(keys)].slice(0, 128);
}

/** One signed transaction on one blockhash. */
export interface SignedAttempt {
  signature: string;
  serialized: Uint8Array;
  lastValidBlockHeight: number;
}

export type SignatureState =
  /** Not seen by the RPC node. */
  | null
  /** Seen but not confirmed yet. */
  | { confirmationStatus: "processed"; err: unknown }
  | { confirmationStatus: "confirmed" | "finalized"; err: unknown };

export type SendEvent =
  | { kind: "sent"; attempt: number; signature: string }
  | {
      kind: "expired";
      attempt: number;
      signature: string;
      /** The attempt that comes next. */
      next: number;
      of: number;
    };

export interface LandingIo {
  /**
   * Builds and signs a transaction on a fresh blockhash. `attempt` starts at
   * 1; later attempts follow an expired one.
   */
  prepare(attempt: number): Promise<SignedAttempt>;
  /**
   * Sends the signed bytes. On the first broadcast of an attempt
   * (`first`), errors reach the caller (a preflight rejection, say);
   * rebroadcast errors are ignored.
   */
  broadcast(serialized: Uint8Array, first: boolean): Promise<void>;
  /** Status of the signature, searching history when `deep`. */
  status(signature: string, deep: boolean): Promise<SignatureState>;
  /** The chain's current block height (at the polling commitment). */
  blockHeight(): Promise<number>;
  onEvent?(event: SendEvent): void;
  signal?: AbortSignal;
  /** Defaults to MAX_SEND_ATTEMPTS. */
  maxAttempts?: number;
  /** Polling interval, ms. Defaults to 1000. */
  pollMs?: number;
  /** Rebroadcast every this many polls. Defaults to 2. */
  rebroadcastEvery?: number;
  /** Polls per attempt before giving up when the block height can't be read. */
  maxPolls?: number;
  sleep?(ms: number): Promise<void>;
}

export type Landed = {
  signature: string;
  /** null: succeeded. Otherwise the transaction error recorded on chain. */
  err: unknown;
  attempts: number;
};

/** Thrown when every attempt expired, or polling ran out without an answer. */
export class NotLandedError extends Error {
  constructor(
    message: string,
    readonly reason: "expired" | "timeout" | "aborted",
    readonly signature: string | null,
  ) {
    super(message);
    this.name = "NotLandedError";
  }
}

/** A send error that means the blockhash is already unusable. */
export function isBlockhashExpiredError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /blockhash not found|block height exceeded|BlockhashNotFound|TransactionExpired/i.test(
    text,
  );
}

/**
 * Sends until the transaction is confirmed (resolves with its error, if it
 * failed on chain) or every fresh-blockhash attempt has expired (throws
 * NotLandedError). A prepare or first-broadcast error other than an expired
 * blockhash is rethrown unchanged.
 */
export async function sendUntilLanded(io: LandingIo): Promise<Landed> {
  const maxAttempts = io.maxAttempts ?? MAX_SEND_ATTEMPTS;
  const pollMs = io.pollMs ?? 1000;
  const every = io.rebroadcastEvery ?? 2;
  const maxPolls = io.maxPolls ?? 180;
  const sleep =
    io.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const aborted = (signature: string | null) =>
    new NotLandedError("Stopped waiting.", "aborted", signature);

  let last: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (io.signal?.aborted) throw aborted(last);
    const tx = await io.prepare(attempt);
    last = tx.signature;
    let expired = false;
    try {
      await io.broadcast(tx.serialized, true);
    } catch (error) {
      if (!isBlockhashExpiredError(error)) throw error;
      expired = true;
    }
    if (!expired)
      io.onEvent?.({ kind: "sent", attempt, signature: tx.signature });

    for (let poll = 0; !expired; poll++) {
      if (io.signal?.aborted) throw aborted(tx.signature);
      const state = await io.status(tx.signature, false).catch(() => undefined);
      if (state && state.confirmationStatus !== "processed") {
        return {
          signature: tx.signature,
          err: state.err ?? null,
          attempts: attempt,
        };
      }
      const height = await io.blockHeight().catch(() => null);
      if (
        height !== null &&
        height > tx.lastValidBlockHeight &&
        state === null
      ) {
        // Past its last valid block height: confirm it is nowhere in history
        // before treating it as gone for good.
        const deep = await io.status(tx.signature, true).catch(() => undefined);
        if (deep && deep.confirmationStatus !== "processed") {
          return {
            signature: tx.signature,
            err: deep.err ?? null,
            attempts: attempt,
          };
        }
        if (deep === null) {
          expired = true;
          break;
        }
      }
      if (poll >= maxPolls) {
        throw new NotLandedError(
          "Solana hasn't confirmed this transaction yet.",
          "timeout",
          tx.signature,
        );
      }
      await sleep(pollMs);
      if ((poll + 1) % every === 0) {
        await io.broadcast(tx.serialized, false).catch(() => {});
      }
    }
    if (attempt < maxAttempts) {
      io.onEvent?.({
        kind: "expired",
        attempt,
        signature: tx.signature,
        next: attempt + 1,
        of: maxAttempts,
      });
    }
  }
  throw new NotLandedError(
    `Every attempt (${maxAttempts}) expired before Solana picked it up.`,
    "expired",
    last,
  );
}
