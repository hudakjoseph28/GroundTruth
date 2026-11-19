import {
  GROUNDTRUTH_ESCROW_IDL,
  type DealState,
  type Hold,
  type ReviewerRole,
} from "@groundtruth/shared";
import {
  DecodeError,
  decodeIdlAccount,
  encodeBase58,
  type DecodableIdl,
  type Decoded,
} from "./idlDecode";

// The escrow program's DealAccount and the SPL token vault, decoded from raw
// account bytes and named in the API contract's words (state "held", role
// "title", reason "SELLER_IDENTITY_DISPUTED"), so the page can lay them beside
// the API's Deal field by field.

export interface ChainReviewer {
  wallet: string;
  role: ReviewerRole;
  required: boolean;
  approved: boolean;
}

export interface ChainHold {
  placedBy: string;
  role: ReviewerRole;
  reasonCode: Hold["reasonCode"];
  /** The program's clock when the hold was placed, Unix seconds. */
  placedAtUnix: bigint;
}

export interface ChainDeal {
  dealId: Uint8Array;
  buyer: string;
  seller: string;
  sellerTokenAccount: string;
  mint: string;
  vault: string;
  /** u64 token base units, as a decimal string like the API's. */
  amountBaseUnits: string;
  state: DealState;
  reviewers: ChainReviewer[];
  hold: ChainHold | null;
  bump: number;
}

// The IDL's enum variants in the contract's words. A variant missing here is
// an IDL the page was not built for, and decoding fails rather than guessing.
const STATES: Record<string, DealState> = {
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

const REASONS: Record<string, Hold["reasonCode"]> = {
  SellerIdentityDisputed: "SELLER_IDENTITY_DISPUTED",
  TitleException: "TITLE_EXCEPTION",
  SiteReviewFailed: "SITE_REVIEW_FAILED",
  Other: "OTHER",
};

const IDL = GROUNDTRUTH_ESCROW_IDL as unknown as DecodableIdl;

/** A DealAccount's bytes, discriminator first, decoded with the checked-in IDL. */
export function decodeDealAccount(data: Uint8Array): ChainDeal {
  const raw = decodeIdlAccount(IDL, "DealAccount", data);
  const hold = raw.hold === null ? null : record(raw.hold, "hold");
  return {
    dealId: bytes(raw.deal_id, "deal_id"),
    buyer: text(raw.buyer, "buyer"),
    seller: text(raw.seller, "seller"),
    sellerTokenAccount: text(raw.seller_token_account, "seller_token_account"),
    mint: text(raw.mint, "mint"),
    vault: text(raw.vault, "vault"),
    amountBaseUnits: big(raw.amount, "amount").toString(),
    state: variant(STATES, raw.state, "state"),
    reviewers: list(raw.reviewers, "reviewers").map((entry) => {
      const reviewer = record(entry, "reviewer");
      return {
        wallet: text(reviewer.wallet, "reviewer.wallet"),
        role: variant(ROLES, reviewer.role, "reviewer.role"),
        required: flag(reviewer.required, "reviewer.required"),
        approved: flag(reviewer.approved, "reviewer.approved"),
      };
    }),
    hold: hold && {
      placedBy: text(hold.placed_by, "hold.placed_by"),
      role: variant(ROLES, hold.role, "hold.role"),
      reasonCode: variant(REASONS, hold.reason_code, "hold.reason_code"),
      placedAtUnix: big(hold.placed_at, "hold.placed_at"),
    },
    bump: Number(raw.bump),
  };
}

export interface TokenAccount {
  mint: string;
  /** The wallet or PDA that controls the tokens. */
  owner: string;
  /** u64 base units, as a decimal string. */
  amount: string;
}

/** An SPL Token account is 165 bytes: mint, owner, amount, then flags. */
const TOKEN_ACCOUNT_SIZE = 165;

/** The SPL Token program's fixed account layout (not Anchor). */
export function decodeTokenAccount(data: Uint8Array): TokenAccount {
  if (data.length !== TOKEN_ACCOUNT_SIZE) {
    throw new DecodeError(
      `A token account is ${TOKEN_ACCOUNT_SIZE} bytes; this one is ${data.length}.`,
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    mint: encodeBase58(data.subarray(0, 32)),
    owner: encodeBase58(data.subarray(32, 64)),
    amount: view.getBigUint64(64, true).toString(),
  };
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function text(value: Decoded | undefined, field: string): string {
  if (typeof value !== "string") throw shape(field);
  return value;
}

function big(value: Decoded | undefined, field: string): bigint {
  if (typeof value !== "bigint") throw shape(field);
  return value;
}

function flag(value: Decoded | undefined, field: string): boolean {
  if (typeof value !== "boolean") throw shape(field);
  return value;
}

function bytes(value: Decoded | undefined, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw shape(field);
  return value;
}

function list(value: Decoded | undefined, field: string): Decoded[] {
  if (!Array.isArray(value)) throw shape(field);
  return value;
}

function record(
  value: Decoded | undefined,
  field: string,
): { [field: string]: Decoded } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    throw shape(field);
  }
  return value;
}

function variant<T>(
  table: Record<string, T>,
  value: Decoded | undefined,
  field: string,
): T {
  const named = typeof value === "string" ? table[value] : undefined;
  if (named === undefined) {
    throw new DecodeError(`Unknown ${field} ${String(value)}.`);
  }
  return named;
}

function shape(field: string): DecodeError {
  return new DecodeError(`The IDL gave ${field} an unexpected type.`);
}
