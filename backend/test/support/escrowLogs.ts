/**
 * IDL-ENCODED TEST DATA, not recorded from devnet.
 *
 * Builds GroundTruth escrow transaction logs the way Anchor writes them:
 * `emit!` logs "Program data: <base64(discriminator ++ borsh(fields))>"
 * inside the program's invoke/success lines. Event bytes come from the
 * checked-in IDL's own Borsh coder, so they match what the program built
 * from the same IDL would emit.
 *
 * TODO(devnet): once the escrow program is deployed (README, "Escrow"),
 * record real devnet transactions for the held and released flows and
 * replay those here alongside these encoded ones.
 */
import { BN, BorshCoder, web3, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
} from "@groundtruth/shared";

export const PROGRAM = GROUNDTRUTH_PROGRAM_ID;
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const OTHER_PROGRAM = "SigDHT99hPznk4d9SAxWLoBnKWT8jcob5pV8X7ti8SM";

const idl = GROUNDTRUTH_ESCROW_IDL as unknown as Idl;
const coder = new BorshCoder(idl);

export type EventName =
  | "DealInitialized"
  | "DealFunded"
  | "ApprovalSigned"
  | "HoldPlaced"
  | "DealReleased"
  | "DealRefunded";

/** One event as Anchor's `emit!` logs it. */
export function eventLine(
  name: EventName,
  data: Record<string, unknown>,
): string {
  const event = idl.events?.find((e) => e.name === name);
  if (!event) throw new Error(`no ${name} in the IDL`);
  const body = coder.types.encode(name, data);
  return `Program data: ${Buffer.concat([Buffer.from(event.discriminator), body]).toString("base64")}`;
}

/** Lines written by one invocation of `program`, wrapped as the runtime does. */
export function invocation(
  program: string,
  lines: string[],
  depth = 1,
  outcome: "success" | string = "success",
): string[] {
  return [
    `Program ${program} invoke [${depth}]`,
    ...lines,
    `Program ${program} consumed 12345 of 200000 compute units`,
    outcome === "success"
      ? `Program ${program} success`
      : `Program ${program} failed: ${outcome}`,
  ];
}

/** Anchor's log line for an error the program returned. */
export function anchorErrorLine(
  name: string,
  number: number,
  message: string,
): string {
  return `Program log: AnchorError thrown in programs/groundtruth_escrow/src/instructions/release.rs:72. Error Code: ${name}. Error Number: ${number}. Error Message: ${message}.`;
}

/** A fresh deal: real 32-byte keys, so events encode and decode exactly. */
export function dealKeys() {
  const key = () => web3.Keypair.generate().publicKey;
  return {
    deal: key(),
    dealId: Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256),
    buyer: key(),
    seller: key(),
    sellerTokenAccount: key(),
    buyerTokenAccount: key(),
    mint: new web3.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    reviewers: { title: key(), survey: key(), septic: key() },
  };
}

export type DealKeys = ReturnType<typeof dealKeys>;

export const AMOUNT = "25000000";

/** The six events for one deal, IDL-encoded as `Program data:` lines. */
export function events(k: DealKeys) {
  const base = { deal: k.deal, deal_id: k.dealId };
  return {
    init: eventLine("DealInitialized", {
      ...base,
      buyer: k.buyer,
      seller: k.seller,
      mint: k.mint,
      amount: new BN(AMOUNT),
    }),
    fund: eventLine("DealFunded", {
      ...base,
      buyer: k.buyer,
      amount: new BN(AMOUNT),
    }),
    approve: (role: "Title" | "Survey" | "Septic") =>
      eventLine("ApprovalSigned", {
        ...base,
        reviewer: k.reviewers[role.toLowerCase() as "title"],
        role: { [role]: {} },
      }),
    hold: (reason = "SellerIdentityDisputed") =>
      eventLine("HoldPlaced", {
        ...base,
        reviewer: k.reviewers.title,
        role: { Title: {} },
        reason_code: { [reason]: {} },
      }),
    release: eventLine("DealReleased", {
      ...base,
      amount: new BN(AMOUNT),
      destination_token_account: k.sellerTokenAccount,
    }),
    refund: eventLine("DealRefunded", {
      ...base,
      amount: new BN(AMOUNT),
      destination_token_account: k.buyerTokenAccount,
    }),
  };
}

/** The accounts of a `release` instruction, in IDL order. */
export function releaseAccounts(k: DealKeys, payer: web3.PublicKey): string[] {
  return [
    payer,
    k.deal,
    k.seller,
    k.sellerTokenAccount,
    k.buyer,
    web3.Keypair.generate().publicKey, // vault
    k.mint,
    new web3.PublicKey(TOKEN_PROGRAM),
  ].map((key) => key.toBase58());
}

/** Logs of a `release` the program refused because a hold is active. */
export function heldReleaseLogs(): string[] {
  return invocation(
    PROGRAM,
    [
      "Program log: Instruction: Release",
      anchorErrorLine(
        "DealHeld",
        6019,
        "Cannot release funds while deal is under active hold",
      ),
    ],
    1,
    "custom program error: 0x1783",
  );
}
