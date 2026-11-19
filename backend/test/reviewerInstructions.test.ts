// The reviewer portal's instruction builder (@groundtruth/shared), checked
// against Anchor's own Borsh coder for the same IDL.
import { BorshCoder, type Idl } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  HOLD_REASON_CODES,
  escrowErrorByCode,
  placeHoldInstruction,
  releaseInstruction,
  signApprovalInstruction,
  stagedRehearsalDeal,
  stagedDemoChainAccounts,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";

const coder = new BorshCoder(GROUNDTRUTH_ESCROW_IDL as unknown as Idl);
const deal = stagedRehearsalDeal;
const dealPda = deal.escrowAddress;
const reviewerOf = (role: string) =>
  deal.reviewers.find((r) => r.role === role)!.wallet;

describe("reviewer instructions", () => {
  it.each([
    ["title", "Title"],
    ["survey", "Survey"],
    ["septic", "Septic"],
  ] as const)("sign_approval(%s) encodes like Anchor", (role, variant) => {
    const spec = signApprovalInstruction({
      reviewer: reviewerOf(role),
      dealPda,
      role,
    });
    expect(Buffer.from(spec.data)).toEqual(
      coder.instruction.encode("sign_approval", { role: { [variant]: {} } }),
    );
    expect(spec.programId).toBe(GROUNDTRUTH_PROGRAM_ID);
    expect(spec.keys).toEqual([
      { pubkey: reviewerOf(role), isSigner: true, isWritable: false },
      { pubkey: dealPda, isSigner: false, isWritable: true },
    ]);
  });

  it.each([
    ["SELLER_IDENTITY_DISPUTED", "SellerIdentityDisputed"],
    ["TITLE_EXCEPTION", "TitleException"],
    ["SITE_REVIEW_FAILED", "SiteReviewFailed"],
    ["OTHER", "Other"],
  ] as const)("place_hold(title, %s) encodes like Anchor", (code, variant) => {
    const spec = placeHoldInstruction({
      reviewer: reviewerOf("title"),
      dealPda,
      role: "title",
      reasonCode: code,
    });
    expect(Buffer.from(spec.data)).toEqual(
      coder.instruction.encode("place_hold", {
        role: { Title: {} },
        reason_code: { [variant]: {} },
      }),
    );
    expect(spec.keys.map((k) => [k.isSigner, k.isWritable])).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it("lists every hold reason the contract defines", () => {
    expect(HOLD_REASON_CODES).toEqual([
      "SELLER_IDENTITY_DISPUTED",
      "TITLE_EXCEPTION",
      "SITE_REVIEW_FAILED",
      "OTHER",
    ]);
  });

  it("release encodes like Anchor, with accounts in IDL order and the fixed token program", () => {
    const chain = stagedDemoChainAccounts[deal.id]!;
    const payer = reviewerOf("septic");
    const spec = releaseInstruction({
      payer,
      dealPda,
      seller: deal.sellerWallet,
      sellerTokenAccount: deal.sellerTokenAccount,
      buyer: deal.buyerWallet,
      vault: chain.vault,
      mint: deal.mint,
    });
    expect(Buffer.from(spec.data)).toEqual(
      coder.instruction.encode("release", {}),
    );
    expect(spec.keys).toEqual([
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: dealPda, isSigner: false, isWritable: true },
      { pubkey: deal.sellerWallet, isSigner: false, isWritable: true },
      { pubkey: deal.sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: deal.buyerWallet, isSigner: false, isWritable: true },
      { pubkey: chain.vault, isSigner: false, isWritable: true },
      { pubkey: deal.mint, isSigner: false, isWritable: false },
      {
        pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        isSigner: false,
        isWritable: false,
      },
    ]);
  });

  it("names program errors from the IDL", () => {
    expect(escrowErrorByCode(6019)).toEqual({
      name: "DealHeld",
      message: "Cannot release funds while deal is under active hold",
    });
    expect(escrowErrorByCode(6016)?.name).toBe("DuplicateApproval");
    expect(escrowErrorByCode(6014)?.name).toBe("UnassignedReviewer");
    expect(escrowErrorByCode(1)).toBeUndefined();
  });
});
