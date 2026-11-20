// Fee sponsorship for the reviewer portal (/review). The API builds a
// reviewer's `sign_approval`, `place_hold`, or `release` with a dedicated
// GroundTruth fee-payer key as fee payer and signs ONLY as that fee payer;
// the reviewer's wallet adds its own signature, which the escrow program
// checks as it always does. The fee payer is never a deal participant.
//
// `sponsorRefusal` is the one rule set for what that key may sign. The API
// runs it right before signing, and the web runs it again before asking the
// wallet, so neither side signs a transaction the other would refuse. No
// runtime dependencies: callers pass a plain view of the compiled message.
import type { ReviewerRole } from "./contract.js";
import { DOCUMENT_MEMO_PREFIX, MEMO_PROGRAM_ID } from "./documents.js";
import { GROUNDTRUTH_ESCROW_IDL, GROUNDTRUTH_PROGRAM_ID } from "./escrow.js";
import type {
  EscrowInstructionSpec,
  HoldReasonCode,
} from "./reviewerInstructions.js";
import {
  COMPUTE_BUDGET_PROGRAM_ID,
  MAX_COMPUTE_UNITS,
  PRIORITY_FEE,
} from "./transactionSend.js";

/** The only escrow instructions the fee payer will pay for. */
export const SPONSORED_ACTIONS = [
  "sign_approval",
  "place_hold",
  "release",
] as const;
export type SponsoredAction = (typeof SPONSORED_ACTIONS)[number];

/** Path of the sponsored-transaction request for one staged deal. */
export const sponsoredTransactionPath = (dealId: string) =>
  `/api/deals/${encodeURIComponent(dealId)}/sponsored-transaction`;

/** `GET /api/fee-sponsor`: whether this API covers reviewer network fees now. */
export type FeeSponsorStatus =
  | { enabled: false }
  | {
      enabled: true;
      /** The GroundTruth fee-payer public key (devnet). */
      feePayer: string;
      /** Most fee-payer signatures one deal can get, ever. */
      maxPerDeal: number;
    };

/** `POST /api/deals/:id/sponsored-transaction` body. `account` is the reviewer's wallet. */
export type SponsoredTransactionRequest =
  | {
      action: "sign_approval";
      account: string;
      role: ReviewerRole;
      /** The document the approval relies on (adds a Memo signed by the reviewer). */
      documentSha256?: string;
    }
  | {
      action: "place_hold";
      account: string;
      role: ReviewerRole;
      reasonCode: HoldReasonCode;
    }
  | { action: "release"; account: string };

export interface SponsoredTransactionResponse {
  /** Base64 v0 transaction, signed by the fee payer only; the reviewer's slot is empty. */
  transaction: string;
  feePayer: string;
  /** The fee payer's signature, which is also the transaction ID. */
  signature: string;
  /** The blockhash's last valid block height, for the resend loop. */
  lastValidBlockHeight: number;
  action: SponsoredAction;
}

/** A compiled transaction message, in base58 keys and raw bytes. */
export interface SponsoredMessageView {
  /** Static account keys; the first `numRequiredSignatures` sign. */
  accountKeys: readonly string[];
  numRequiredSignatures: number;
  /** Address lookup tables in a v0 message (always refused). */
  addressTableLookups: number;
  instructions: readonly {
    programIdIndex: number;
    accountKeyIndexes: readonly number[];
    data: Uint8Array;
  }[];
}

export interface SponsorPolicy {
  /** The GroundTruth fee payer. */
  feePayer: string;
  /** The reviewer wallet that must be the transaction's only other signer. */
  wallet: string;
  /** The staged deal's PDA every escrow instruction must name. */
  dealPda: string;
  /** Highest compute unit price the fee payer pays, in micro-lamports. */
  maxMicroLamports?: number;
}

type IdlInstruction = (typeof GROUNDTRUTH_ESCROW_IDL)["instructions"][number];

/** Each sponsored instruction's IDL entry and argument bytes. */
const SPONSORED: readonly { name: SponsoredAction; argBytes: number }[] = [
  { name: "sign_approval", argBytes: 1 },
  { name: "place_hold", argBytes: 2 },
  { name: "release", argBytes: 0 },
];

function idl(name: string): IdlInstruction {
  const found = GROUNDTRUTH_ESCROW_IDL.instructions.find(
    (ix) => ix.name === name,
  );
  if (!found) throw new Error(`The escrow IDL has no ${name} instruction.`);
  return found;
}

const startsWith = (data: Uint8Array, prefix: readonly number[]) =>
  data.length >= prefix.length && prefix.every((byte, i) => data[i] === byte);

/** Which escrow instruction these bytes call, by IDL discriminator. */
export function escrowInstructionName(data: Uint8Array): string | undefined {
  return GROUNDTRUTH_ESCROW_IDL.instructions.find((ix) =>
    startsWith(data, ix.discriminator),
  )?.name;
}

const MEMO_TEXT = new RegExp(`^${DOCUMENT_MEMO_PREFIX}[0-9a-f]{64}$`);

function readU32(data: Uint8Array, at: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    at,
    true,
  );
}

function readU64(data: Uint8Array, at: number): bigint {
  return new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  ).getBigUint64(at, true);
}

/**
 * Why the fee payer must not sign this message, or null when it may. Allowed:
 * the fee payer first and the reviewer second as the only two signers; no
 * lookup tables; at most one SetComputeUnitLimit and one SetComputeUnitPrice
 * within caps; exactly one escrow `sign_approval`, `place_hold`, or `release`
 * whose signer is the reviewer and whose deal is the staged deal; and, with
 * `sign_approval` only, one `groundtruth:doc:<sha256>` Memo v1 signed by the
 * reviewer. No instruction may name the fee payer, so the key pays network
 * fees and nothing else. Anything else is refused.
 */
export function sponsorRefusal(
  message: SponsoredMessageView,
  policy: SponsorPolicy,
): string | null {
  const keys = message.accountKeys;
  const maxPrice = BigInt(
    policy.maxMicroLamports ?? PRIORITY_FEE.maxMicroLamports,
  );
  if (keys[0] !== policy.feePayer) return "The fee payer is not GroundTruth's.";
  if (policy.feePayer === policy.wallet) {
    return "The fee payer cannot be the reviewer.";
  }
  if (message.numRequiredSignatures !== 2 || keys[1] !== policy.wallet) {
    return "Only GroundTruth's fee payer and the reviewer may sign.";
  }
  if (message.addressTableLookups !== 0) {
    return "Address lookup tables are not sponsored.";
  }

  let unitLimits = 0;
  let unitPrices = 0;
  let memos = 0;
  const escrow: SponsoredAction[] = [];
  for (const ix of message.instructions) {
    const program = keys[ix.programIdIndex];
    if (ix.programIdIndex === 0 || ix.accountKeyIndexes.includes(0)) {
      return "No instruction may use GroundTruth's fee payer account.";
    }
    if (ix.accountKeyIndexes.some((i) => keys[i] === undefined)) {
      return "An instruction names an account the message does not list.";
    }
    const named = ix.accountKeyIndexes.map((i) => keys[i]!);

    if (program === COMPUTE_BUDGET_PROGRAM_ID) {
      if (named.length !== 0)
        return "Compute budget instructions take no accounts.";
      if (ix.data[0] === 2 && ix.data.length === 5) {
        unitLimits += 1;
        if (readU32(ix.data, 1) > MAX_COMPUTE_UNITS) {
          return "The compute unit limit is above the runtime ceiling.";
        }
      } else if (ix.data[0] === 3 && ix.data.length === 9) {
        unitPrices += 1;
        if (readU64(ix.data, 1) > maxPrice) {
          return "The priority fee is above GroundTruth's cap.";
        }
      } else {
        return "Only a compute unit limit and price are sponsored.";
      }
      continue;
    }

    if (program === GROUNDTRUTH_PROGRAM_ID) {
      const found = SPONSORED.find((s) =>
        startsWith(ix.data, idl(s.name).discriminator),
      );
      if (!found) {
        const name = escrowInstructionName(ix.data) ?? "an unknown instruction";
        return `The escrow program's ${name} is not sponsored.`;
      }
      const spec = idl(found.name);
      if (ix.data.length !== spec.discriminator.length + found.argBytes) {
        return `The ${found.name} instruction data is the wrong length.`;
      }
      if (named.length !== spec.accounts.length) {
        return `The ${found.name} instruction has the wrong accounts.`;
      }
      // IDL order: the signer (reviewer, or release's payer), then the deal.
      if (named[0] !== policy.wallet) {
        return `The ${found.name} signer must be the reviewer.`;
      }
      if (named[1] !== policy.dealPda) {
        return `The ${found.name} instruction is not for this staged deal.`;
      }
      escrow.push(found.name);
      continue;
    }

    if (program === MEMO_PROGRAM_ID) {
      memos += 1;
      if (named.length !== 1 || named[0] !== policy.wallet) {
        return "A document memo must be signed by the reviewer alone.";
      }
      if (!MEMO_TEXT.test(new TextDecoder().decode(ix.data))) {
        return "Only a groundtruth:doc:<sha256> memo is sponsored.";
      }
      continue;
    }

    return `Instructions to ${program ?? "an unlisted program"} are not sponsored.`;
  }

  if (unitLimits > 1 || unitPrices > 1) {
    return "Only one compute unit limit and one price are sponsored.";
  }
  if (escrow.length !== 1) {
    return "Exactly one sign_approval, place_hold, or release is sponsored.";
  }
  if (memos > 1 || (memos === 1 && escrow[0] !== "sign_approval")) {
    return "A document memo is sponsored only with one sign_approval.";
  }
  return null;
}

/**
 * True when the message's non-compute-budget instructions are exactly
 * `expected`, in order: same program, accounts, signer and writable flags
 * as the message grants them, and data. The web checks this before the
 * wallet signs, so the API cannot slip in a different instruction.
 */
export function sameInstructions(
  message: SponsoredMessageView & {
    isSigner(index: number): boolean;
    isWritable(index: number): boolean;
  },
  expected: readonly EscrowInstructionSpec[],
): boolean {
  const keys = message.accountKeys;
  const actual = message.instructions.filter(
    (ix) => keys[ix.programIdIndex] !== COMPUTE_BUDGET_PROGRAM_ID,
  );
  if (actual.length !== expected.length) return false;
  return actual.every((ix, n) => {
    const want = expected[n]!;
    if (keys[ix.programIdIndex] !== want.programId) return false;
    if (ix.accountKeyIndexes.length !== want.keys.length) return false;
    const accountsMatch = ix.accountKeyIndexes.every((index, k) => {
      const meta = want.keys[k]!;
      return (
        keys[index] === meta.pubkey &&
        message.isSigner(index) === meta.isSigner &&
        // The message may grant write access another instruction needs.
        (!meta.isWritable || message.isWritable(index))
      );
    });
    return (
      accountsMatch &&
      ix.data.length === want.data.length &&
      ix.data.every((byte, i) => byte === want.data[i])
    );
  });
}
