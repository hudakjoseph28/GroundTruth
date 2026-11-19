// The reviewer-approval Solana Action (Blink): reads the deal account on
// devnet and builds an UNSIGNED `sign_approval` transaction for the wallet
// that asked. The API never signs: the reviewer's wallet signs, pays the
// fee, and sends; the escrow program re-checks every rule on chain.
import { Buffer } from "node:buffer";
import { BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  USDC_MINT_DEVNET,
  signApprovalInstruction,
  stagedDemoChainAccounts,
  stagedRehearsalV2Deal,
  type ReviewerRole,
} from "@groundtruth/shared";
import { DEVNET_GENESIS_HASH, type ActionChain } from "./devnetChain.js";

/**
 * The only deal the Blink serves: the current rehearsal copy of the stage
 * deal. The held, released, and live deals are never offered.
 */
export const BLINK_DEAL = {
  id: stagedRehearsalV2Deal.id,
  parcelKey: stagedRehearsalV2Deal.parcelKey,
  escrowAddress: stagedRehearsalV2Deal.escrowAddress,
  amountBaseUnits: stagedRehearsalV2Deal.amountBaseUnits,
  dealIdHex: stagedDemoChainAccounts[stagedRehearsalV2Deal.id].dealIdHex,
} as const;

export type ChainDealState =
  | "draft"
  | "funded"
  | "held"
  | "released"
  | "refunded";

export interface ChainReviewer {
  wallet: string;
  role: ReviewerRole;
  required: boolean;
  approved: boolean;
}

export interface ChainDeal {
  state: ChainDealState;
  reviewers: ChainReviewer[];
}

/** A refusal the Action shows the user as-is (ActionError `message`). */
export class ActionRefusal extends Error {
  override name = "ActionRefusal";
  constructor(
    readonly status: number,
    readonly code: "INVALID_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

/** Devnet could not be read, or answered with something we will not trust. */
export class ChainUnavailable extends Error {
  override name = "ChainUnavailable";
}

const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);

const STATES: Record<string, ChainDealState> = {
  Draft: "draft",
  Funded: "funded",
  Held: "held",
  Released: "released",
  Refunded: "refunded",
};

const ROLES: Record<string, ReviewerRole> = {
  Title: "title",
  Survey: "survey",
  Septic: "septic",
};

/** USDC base units (6 decimals) as "10" or "10.5". */
export function usdc(baseUnits: string): string {
  const value = BigInt(baseUnits);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Reads the Blink deal's account on devnet. Throws ChainUnavailable when
 * devnet cannot be read, the cluster is not devnet, or the account is not
 * this deal's escrow account; never guesses a state.
 */
export async function readChainDeal(chain: ActionChain): Promise<ChainDeal> {
  await assertDevnet(chain);
  let account: Awaited<ReturnType<ActionChain["account"]>>;
  try {
    account = await chain.account(BLINK_DEAL.escrowAddress);
  } catch {
    throw new ChainUnavailable("Solana devnet could not be read.");
  }
  if (!account) {
    throw new ActionRefusal(
      409,
      "CONFLICT",
      "This staged deal hasn't been created on Solana devnet yet, so there is nothing to approve.",
    );
  }
  if (account.owner !== GROUNDTRUTH_PROGRAM_ID) {
    throw new ChainUnavailable(
      "The deal account is not owned by the escrow program.",
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = coder.accounts.decode("DealAccount", Buffer.from(account.data));
  } catch {
    throw new ChainUnavailable("The deal account could not be decoded.");
  }
  if (
    hex(raw.deal_id) !== BLINK_DEAL.dealIdHex ||
    base58(raw.mint) !== USDC_MINT_DEVNET
  ) {
    throw new ChainUnavailable(
      "The deal account does not match the staged deal.",
    );
  }

  const reviewers = Array.isArray(raw.reviewers) ? raw.reviewers : [];
  return {
    state: variant(raw.state, STATES),
    reviewers: reviewers.map((r: Record<string, unknown>) => ({
      wallet: base58(r.wallet),
      role: variant(r.role, ROLES),
      required: r.required === true,
      approved: r.approved === true,
    })),
  };
}

/**
 * The reviewer assignment `sign_approval` would accept for this wallet, or
 * a refusal in plain words. Mirrors the program: state must be funded, the
 * first assignment for the wallet is the one checked, and it must not
 * already be approved.
 */
export function approvalFor(deal: ChainDeal, wallet: string): ChainReviewer {
  refuseUnlessOpen(deal);
  const assignment = deal.reviewers.find((r) => r.wallet === wallet);
  if (!assignment) {
    throw new ActionRefusal(
      403,
      "FORBIDDEN",
      "This wallet isn't an assigned reviewer on this deal. Connect the title, survey, or septic reviewer wallet the deal was set up with.",
    );
  }
  if (assignment.approved) {
    throw new ActionRefusal(
      409,
      "CONFLICT",
      `This wallet already signed its ${assignment.role} approval on Solana devnet. Nothing more to sign.`,
    );
  }
  return assignment;
}

/** Refuses unless the deal is funded (no hold, not settled). */
export function refuseUnlessOpen(deal: ChainDeal): void {
  const message = closedReason(deal.state);
  if (message) throw new ActionRefusal(409, "CONFLICT", message);
}

export function closedReason(state: ChainDealState): string | undefined {
  switch (state) {
    case "funded":
      return undefined;
    case "draft":
      return "This deal isn't funded on Solana devnet yet. Approvals open once the buyer funds the escrow.";
    case "held":
      return "A reviewer placed a hold on this deal, so approvals are closed. The funds stay in escrow until the buyer is refunded.";
    case "released":
      return "This deal is already released to the seller. There is nothing left to approve.";
    case "refunded":
      return "This deal was refunded to the buyer. There is nothing left to approve.";
  }
}

/**
 * The unsigned `sign_approval` transaction, base64: the reviewer is the fee
 * payer and the only signer, and its signature slot is left empty.
 */
export async function buildUnsignedApproval(
  chain: ActionChain,
  reviewer: ChainReviewer,
): Promise<string> {
  let blockhash: string;
  try {
    blockhash = await chain.latestBlockhash();
  } catch {
    throw new ChainUnavailable("Solana devnet could not be read.");
  }
  const spec = signApprovalInstruction({
    reviewer: reviewer.wallet,
    dealPda: BLINK_DEAL.escrowAddress,
    role: reviewer.role,
  });
  const instruction = new web3.TransactionInstruction({
    programId: new web3.PublicKey(spec.programId),
    keys: spec.keys.map((key) => ({
      ...key,
      pubkey: new web3.PublicKey(key.pubkey),
    })),
    data: Buffer.from(spec.data),
  });
  const tx = new web3.VersionedTransaction(
    new web3.TransactionMessage({
      payerKey: new web3.PublicKey(reviewer.wallet),
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message(),
  );
  return Buffer.from(tx.serialize()).toString("base64");
}

async function assertDevnet(chain: ActionChain): Promise<void> {
  let genesis: string;
  try {
    genesis = await chain.genesisHash();
  } catch {
    throw new ChainUnavailable("Solana devnet could not be read.");
  }
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new ChainUnavailable("The configured RPC is not Solana devnet.");
  }
}

function base58(value: unknown): string {
  if (value instanceof web3.PublicKey) return value.toBase58();
  throw new ChainUnavailable("Expected a public key in the deal account.");
}

function hex(value: unknown): string {
  if (Array.isArray(value) && value.length === 32) {
    return Buffer.from(value as number[]).toString("hex");
  }
  throw new ChainUnavailable("Expected a 32-byte deal ID.");
}

/** Borsh enums decode as `{ Funded: {} }`. */
function variant<T>(value: unknown, names: Record<string, T>): T {
  const key =
    typeof value === "object" && value !== null ? Object.keys(value)[0] : "";
  const mapped = key ? names[key] : undefined;
  if (mapped === undefined) {
    throw new ChainUnavailable("Unexpected value in the deal account.");
  }
  return mapped;
}
