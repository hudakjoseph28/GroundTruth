import idlJson from "./idl/groundtruth_escrow.json" with { type: "json" };

/**
 * Escrow Program ID deployed on Solana devnet.
 */
export const GROUNDTRUTH_PROGRAM_ID =
  "ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG" as const;

/**
 * Circle Test USDC Mint address on Solana devnet.
 */
export const USDC_MINT_DEVNET =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as const;

/**
 * ASCII seed prefix used for Deal PDA derivation: `b"deal"`.
 */
export const DEAL_SEED = "deal" as const;

/**
 * Standard Solana SPL Associated Token Program ID.
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as const;

/**
 * Standard Solana SPL Token Program ID.
 */
export const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as const;

/**
 * The checked-in Anchor IDL for GroundTruth Escrow.
 */
export const GROUNDTRUTH_ESCROW_IDL = idlJson;

export type GroundtruthEscrowIdl = typeof idlJson;

/**
 * All six program instruction names.
 */
export const ESCROW_INSTRUCTION_NAMES = [
  "initialize_deal",
  "fund",
  "sign_approval",
  "place_hold",
  "release",
  "refund",
] as const;

export type EscrowInstructionName = (typeof ESCROW_INSTRUCTION_NAMES)[number];

/**
 * All six program event names.
 */
export const ESCROW_EVENT_NAMES = [
  "DealInitialized",
  "DealFunded",
  "ApprovalSigned",
  "HoldPlaced",
  "DealReleased",
  "DealRefunded",
] as const;

export type EscrowEventName = (typeof ESCROW_EVENT_NAMES)[number];

/**
 * Event data emitted by `initialize_deal`.
 */
export interface DealInitializedEventData {
  deal: string;
  dealId: string;
  buyer: string;
  seller: string;
  mint: string;
  amount: bigint | number | string;
}

/**
 * Event data emitted by `fund`.
 */
export interface DealFundedEventData {
  deal: string;
  dealId: string;
  buyer: string;
  amount: bigint | number | string;
}

/**
 * Event data emitted by `sign_approval`.
 */
export interface ApprovalSignedEventData {
  deal: string;
  dealId: string;
  reviewer: string;
  role: "title" | "survey" | "septic";
}

/**
 * Event data emitted by `place_hold`.
 */
export interface HoldPlacedEventData {
  deal: string;
  dealId: string;
  reviewer: string;
  role: "title" | "survey" | "septic";
  reasonCode:
    | "SELLER_IDENTITY_DISPUTED"
    | "TITLE_EXCEPTION"
    | "SITE_REVIEW_FAILED"
    | "OTHER";
}

/**
 * Event data emitted by `release`.
 */
export interface DealReleasedEventData {
  deal: string;
  dealId: string;
  amount: bigint | number | string;
  destinationTokenAccount: string;
}

/**
 * Event data emitted by `refund`.
 */
export interface DealRefundedEventData {
  deal: string;
  dealId: string;
  amount: bigint | number | string;
  destinationTokenAccount: string;
}

/**
 * Returns the exact 3 seed buffers required to derive a GroundTruth Deal PDA:
 * 1. `b"deal"` (ASCII string)
 * 2. `buyer` (32-byte public key)
 * 3. `deal_id` (32-byte unique identifier)
 */
export function getDealPdaSeeds(
  buyerBytes: Uint8Array,
  dealIdBytes: Uint8Array,
): [Uint8Array, Uint8Array, Uint8Array] {
  const prefix = new TextEncoder().encode(DEAL_SEED);
  return [prefix, buyerBytes, dealIdBytes];
}

function toKeyBytes(key: unknown): Uint8Array {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (
    typeof key === "object" &&
    key !== null &&
    "toBytes" in key &&
    typeof (key as { toBytes: () => unknown }).toBytes === "function"
  ) {
    const res = (key as { toBytes: () => unknown }).toBytes();
    if (res instanceof Uint8Array) {
      return res;
    }
  }
  if (
    typeof key === "object" &&
    key !== null &&
    "toBuffer" in key &&
    typeof (key as { toBuffer: () => unknown }).toBuffer === "function"
  ) {
    const res = (key as { toBuffer: () => unknown }).toBuffer();
    if (res instanceof Uint8Array) {
      return res;
    }
  }
  throw new Error("Unable to extract bytes from public key");
}

/**
 * Minimal interface representing the Solana web3 derivation methods.
 * Compatible with `@solana/web3.js` PublicKey and `@solana/spl-token`.
 */
export interface Web3DerivationContext<TPublicKey> {
  PublicKey: {
    findProgramAddressSync(
      seeds: Uint8Array[],
      programId: TPublicKey,
    ): [TPublicKey, number];
    new (value: string | Uint8Array | number[]): TPublicKey;
  };
  getAssociatedTokenAddressSync(
    mint: TPublicKey,
    owner: TPublicKey,
    allowOwnerOffCurve?: boolean,
  ): TPublicKey;
}

export interface DeriveDealAccountsArgs<TPublicKey> {
  buyer: TPublicKey;
  seller: TPublicKey;
  dealId: Uint8Array | number[];
  mint?: TPublicKey;
  programId?: TPublicKey;
  allowOwnerOffCurve?: boolean;
  web3: Web3DerivationContext<TPublicKey>;
}

export interface DerivedDealAccounts<TPublicKey> {
  dealPda: TPublicKey;
  dealBump: number;
  vault: TPublicKey;
  sellerTokenAccount: TPublicKey;
  buyerTokenAccount: TPublicKey;
}

/**
 * Helper to derive the Deal PDA and bump seed given buyer, dealId, and web3 context.
 */
export function deriveDealPda<TPublicKey>(
  buyer: TPublicKey,
  dealId: Uint8Array | number[],
  web3: Pick<Web3DerivationContext<TPublicKey>, "PublicKey">,
  programId?: TPublicKey,
): [TPublicKey, number] {
  const pid = programId ?? new web3.PublicKey(GROUNDTRUTH_PROGRAM_ID);
  const buyerBytes = toKeyBytes(buyer);
  const dealIdBytes: Uint8Array =
    dealId instanceof Uint8Array ? dealId : new Uint8Array(dealId);
  const seeds = getDealPdaSeeds(buyerBytes, dealIdBytes);
  return web3.PublicKey.findProgramAddressSync(seeds, pid);
}

/**
 * Helper to derive the Deal Vault ATA PDA given dealPda, web3 context, and optional mint.
 */
export function deriveVaultPda<TPublicKey>(
  dealPda: TPublicKey,
  web3: Pick<Web3DerivationContext<TPublicKey>, "PublicKey" | "getAssociatedTokenAddressSync">,
  mint?: TPublicKey,
): TPublicKey {
  const m = mint ?? new web3.PublicKey(USDC_MINT_DEVNET);
  return web3.getAssociatedTokenAddressSync(m, dealPda, true);
}

/**
 * Client helper to derive the complete set of PDA and token accounts
 * for a GroundTruth escrow deal.
 */
export function deriveDealAccounts<TPublicKey>(
  args: DeriveDealAccountsArgs<TPublicKey>,
): DerivedDealAccounts<TPublicKey> {
  const { buyer, seller, dealId, web3 } = args;
  const programId =
    args.programId ?? new web3.PublicKey(GROUNDTRUTH_PROGRAM_ID);
  const mint = args.mint ?? new web3.PublicKey(USDC_MINT_DEVNET);

  const [dealPda, dealBump] = deriveDealPda(buyer, dealId, web3, programId);
  const vault = deriveVaultPda(dealPda, web3, mint);
  const allowOwnerOffCurve = args.allowOwnerOffCurve ?? false;
  const sellerTokenAccount = web3.getAssociatedTokenAddressSync(
    mint,
    seller,
    allowOwnerOffCurve,
  );
  const buyerTokenAccount = web3.getAssociatedTokenAddressSync(
    mint,
    buyer,
    allowOwnerOffCurve,
  );

  return {
    dealPda,
    dealBump,
    vault,
    sellerTokenAccount,
    buyerTokenAccount,
  };
}
