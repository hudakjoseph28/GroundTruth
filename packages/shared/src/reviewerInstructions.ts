// The escrow instructions a wallet sends: the three from the reviewer portal
// (sign_approval, place_hold, release) and the buyer's `fund`, which the API
// returns unsigned for a Solana Pay transaction request. Built from the
// checked-in IDL alone: instruction discriminators, account order and flags, fixed
// program addresses, and enum variant order all come from
// idl/groundtruth_escrow.json. No runtime dependencies: the caller turns the
// result into its own transaction type (web3.js, kit, and so on).
import type { Hold, ReviewerRole } from "./contract.js";
import { GROUNDTRUTH_ESCROW_IDL, GROUNDTRUTH_PROGRAM_ID } from "./escrow.js";

export type HoldReasonCode = Hold["reasonCode"];

/** One instruction, ready to wrap: base58 keys and raw instruction data. */
export interface EscrowInstructionSpec {
  programId: string;
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: Uint8Array;
}

type IdlInstruction = (typeof GROUNDTRUTH_ESCROW_IDL)["instructions"][number];

function idlInstruction(name: string): IdlInstruction {
  const found = GROUNDTRUTH_ESCROW_IDL.instructions.find(
    (ix) => ix.name === name,
  );
  if (!found) throw new Error(`The escrow IDL has no ${name} instruction.`);
  return found;
}

function enumIndex(typeName: string, variant: string): number {
  const type = GROUNDTRUTH_ESCROW_IDL.types.find((t) => t.name === typeName);
  const variants =
    type && "variants" in type.type ? type.type.variants : undefined;
  const index = variants?.findIndex((v) => v.name === variant) ?? -1;
  if (index < 0)
    throw new Error(`The escrow IDL has no ${typeName}.${variant}.`);
  return index;
}

/** The contract's reviewer role as the IDL's ReviewerRole variant. */
const ROLE_VARIANT: Record<ReviewerRole, string> = {
  title: "Title",
  survey: "Survey",
  septic: "Septic",
};

/** The contract's hold reason code as the IDL's HoldReason variant. */
const REASON_VARIANT: Record<HoldReasonCode, string> = {
  SELLER_IDENTITY_DISPUTED: "SellerIdentityDisputed",
  TITLE_EXCEPTION: "TitleException",
  SITE_REVIEW_FAILED: "SiteReviewFailed",
  OTHER: "Other",
};

export const HOLD_REASON_CODES = Object.keys(
  REASON_VARIANT,
) as HoldReasonCode[];

/**
 * Account metas in the IDL's order with its signer and writable flags. Every
 * account must be given except those the IDL fixes by address.
 */
function build(
  name: string,
  accounts: Record<string, string>,
  args: number[],
): EscrowInstructionSpec {
  const ix = idlInstruction(name);
  const keys = ix.accounts.map((account) => {
    const fixed = "address" in account ? account.address : undefined;
    const pubkey = accounts[account.name] ?? fixed;
    if (!pubkey) throw new Error(`${name} needs the ${account.name} account.`);
    return {
      pubkey,
      isSigner: "signer" in account && account.signer === true,
      isWritable: "writable" in account && account.writable === true,
    };
  });
  const data = new Uint8Array(ix.discriminator.length + args.length);
  data.set(ix.discriminator, 0);
  data.set(args, ix.discriminator.length);
  return { programId: GROUNDTRUTH_PROGRAM_ID, keys, data };
}

/** `sign_approval(role)`: the reviewer signs (and pays the fee). */
export function signApprovalInstruction(input: {
  reviewer: string;
  dealPda: string;
  role: ReviewerRole;
}): EscrowInstructionSpec {
  return build(
    "sign_approval",
    { reviewer: input.reviewer, deal: input.dealPda },
    [enumIndex("ReviewerRole", ROLE_VARIANT[input.role])],
  );
}

/** `place_hold(role, reason_code)`: the reviewer signs. */
export function placeHoldInstruction(input: {
  reviewer: string;
  dealPda: string;
  role: ReviewerRole;
  reasonCode: HoldReasonCode;
}): EscrowInstructionSpec {
  return build(
    "place_hold",
    { reviewer: input.reviewer, deal: input.dealPda },
    [
      enumIndex("ReviewerRole", ROLE_VARIANT[input.role]),
      enumIndex("HoldReason", REASON_VARIANT[input.reasonCode]),
    ],
  );
}

/**
 * `release()`: any fee payer may send it; the program checks every rule and
 * pays only the bound seller token account.
 */
export function releaseInstruction(input: {
  payer: string;
  dealPda: string;
  seller: string;
  sellerTokenAccount: string;
  buyer: string;
  vault: string;
  mint: string;
}): EscrowInstructionSpec {
  return build(
    "release",
    {
      payer: input.payer,
      deal: input.dealPda,
      seller: input.seller,
      seller_token_account: input.sellerTokenAccount,
      buyer: input.buyer,
      vault: input.vault,
      mint: input.mint,
    },
    [],
  );
}

/**
 * `fund()`: the bound buyer signs (and pays the fee). The program moves
 * exactly the deal's amount of the bound mint from the buyer's token account
 * into the deal's vault, only while the deal is a draft.
 */
export function fundInstruction(input: {
  buyer: string;
  dealPda: string;
  buyerTokenAccount: string;
  vault: string;
  mint: string;
}): EscrowInstructionSpec {
  return build(
    "fund",
    {
      buyer: input.buyer,
      deal: input.dealPda,
      buyer_token_account: input.buyerTokenAccount,
      vault: input.vault,
      mint: input.mint,
    },
    [],
  );
}

/** The program's custom error for a code (6000 and up), from the IDL. */
export function escrowErrorByCode(
  code: number,
): { name: string; message: string } | undefined {
  const found = GROUNDTRUTH_ESCROW_IDL.errors.find((e) => e.code === code);
  return found ? { name: found.name, message: found.msg } : undefined;
}
