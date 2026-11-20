// The sponsor guard (`sponsorRefusal` in @groundtruth/shared): the only rule
// set for what GroundTruth's fee payer may sign. Every message here is
// compiled the way web3.js compiles a real one.
import { Buffer } from "node:buffer";
import { web3 } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  PRIORITY_FEE,
  TOKEN_PROGRAM_ID,
  computeBudgetInstructions,
  documentMemoInstruction,
  fundInstruction,
  placeHoldInstruction,
  releaseInstruction,
  signApprovalInstruction,
  sponsorRefusal,
  stagedDemoChainAccounts,
  type EscrowInstructionSpec,
  type SponsoredMessageView,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { messageView } from "../src/sponsor/sponsoredTransaction.js";
import { BLOCKHASH, SPONSOR_DEAL } from "./support/sponsorChain.js";

const feePayer = web3.Keypair.generate().publicKey;
const DEAL = SPONSOR_DEAL;
const SEPTIC = DEAL.reviewers[2]!.wallet;
const OTHER = web3.Keypair.generate().publicKey.toBase58();
const SHA = "ab".repeat(32);
const policy = {
  feePayer: feePayer.toBase58(),
  wallet: SEPTIC,
  dealPda: DEAL.escrowAddress,
};

const approve = (reviewer = SEPTIC, dealPda = DEAL.escrowAddress) =>
  signApprovalInstruction({ reviewer, dealPda, role: "septic" });
const hold = () =>
  placeHoldInstruction({
    reviewer: SEPTIC,
    dealPda: DEAL.escrowAddress,
    role: "septic",
    reasonCode: "SITE_REVIEW_FAILED",
  });
const release = () =>
  releaseInstruction({
    payer: SEPTIC,
    dealPda: DEAL.escrowAddress,
    seller: DEAL.sellerWallet,
    sellerTokenAccount: DEAL.sellerTokenAccount,
    buyer: DEAL.buyerWallet,
    vault: stagedDemoChainAccounts[DEAL.id].vault,
    mint: DEAL.mint,
  });
const budget = (units = 10_000, microLamports = 1_000) =>
  computeBudgetInstructions({ units, microLamports });

/** An escrow instruction by IDL name, with the IDL's account count filled by `account`. */
function rawEscrow(name: string, account: string): EscrowInstructionSpec {
  const ix = GROUNDTRUTH_ESCROW_IDL.instructions.find((i) => i.name === name)!;
  return {
    programId: GROUNDTRUTH_PROGRAM_ID,
    keys: ix.accounts.map((_, i) => ({
      pubkey: i === 0 ? account : i === 1 ? DEAL.escrowAddress : OTHER,
      isSigner: i === 0,
      isWritable: true,
    })),
    data: Uint8Array.from(ix.discriminator),
  };
}

const toIx = (spec: EscrowInstructionSpec) =>
  new web3.TransactionInstruction({
    programId: new web3.PublicKey(spec.programId),
    keys: spec.keys.map((k) => ({
      ...k,
      pubkey: new web3.PublicKey(k.pubkey),
    })),
    data: Buffer.from(spec.data),
  });

function view(
  instructions: (EscrowInstructionSpec | web3.TransactionInstruction)[],
  payer: web3.PublicKey = feePayer,
): SponsoredMessageView {
  return messageView(
    new web3.TransactionMessage({
      payerKey: payer,
      recentBlockhash: BLOCKHASH,
      instructions: instructions.map((ix) =>
        ix instanceof web3.TransactionInstruction ? ix : toIx(ix),
      ),
    }).compileToV0Message(),
  );
}

describe("sponsorRefusal accepts", () => {
  it("sign_approval, with and without a document memo signed by the reviewer", () => {
    expect(sponsorRefusal(view([...budget(), approve()]), policy)).toBeNull();
    expect(
      sponsorRefusal(
        view([
          ...budget(),
          approve(),
          documentMemoInstruction({ signer: SEPTIC, sha256: SHA }),
        ]),
        policy,
      ),
    ).toBeNull();
  });

  it("place_hold and release, signed by the reviewer", () => {
    expect(sponsorRefusal(view([...budget(), hold()]), policy)).toBeNull();
    expect(sponsorRefusal(view([...budget(), release()]), policy)).toBeNull();
  });
});

describe("sponsorRefusal refuses any other instruction", () => {
  const refuses = (
    instructions: (EscrowInstructionSpec | web3.TransactionInstruction)[],
    pattern: RegExp,
  ) => expect(sponsorRefusal(view(instructions), policy)).toMatch(pattern);

  it("a System transfer out of the fee payer", () => {
    refuses(
      [
        approve(),
        web3.SystemProgram.transfer({
          fromPubkey: feePayer,
          toPubkey: new web3.PublicKey(SEPTIC),
          lamports: 1_000_000,
        }),
      ],
      /fee payer account/,
    );
  });

  it("a System transfer that does not touch the fee payer", () => {
    refuses(
      [
        approve(),
        web3.SystemProgram.transfer({
          fromPubkey: new web3.PublicKey(SEPTIC),
          toPubkey: new web3.PublicKey(OTHER),
          lamports: 1,
        }),
      ],
      /11111111111111111111111111111111 are not sponsored/,
    );
  });

  it("an SPL Token instruction", () => {
    refuses(
      [
        approve(),
        new web3.TransactionInstruction({
          programId: new web3.PublicKey(TOKEN_PROGRAM_ID),
          keys: [
            {
              pubkey: new web3.PublicKey(OTHER),
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: new web3.PublicKey(SEPTIC),
              isSigner: true,
              isWritable: false,
            },
          ],
          data: Buffer.from([3, 1, 0, 0, 0, 0, 0, 0, 0]),
        }),
      ],
      /are not sponsored/,
    );
  });

  it.each(["fund", "refund", "initialize_deal"])(
    "the escrow program's %s",
    (name) => {
      refuses(
        [rawEscrow(name, SEPTIC)],
        new RegExp(`${name} is not sponsored`),
      );
    },
  );

  it("fund built from the shared builder, even with the reviewer as buyer", () => {
    refuses(
      [
        fundInstruction({
          buyer: SEPTIC,
          dealPda: DEAL.escrowAddress,
          buyerTokenAccount: OTHER,
          vault: stagedDemoChainAccounts[DEAL.id].vault,
          mint: DEAL.mint,
        }),
      ],
      /fund is not sponsored/,
    );
  });

  it("an escrow call with unknown data", () => {
    refuses(
      [{ ...approve(), data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 0]) }],
      /unknown instruction is not sponsored/,
    );
  });

  it("two escrow instructions in one transaction", () => {
    refuses([approve(), release()], /Exactly one/);
  });

  it("no escrow instruction at all (compute budget alone, or a bare memo)", () => {
    // Compute budget alone has no reviewer signer at all.
    refuses([...budget()], /Only GroundTruth's fee payer and the reviewer/);
    refuses(
      [documentMemoInstruction({ signer: SEPTIC, sha256: SHA })],
      /Exactly one/,
    );
  });

  it("sign_approval with extra argument bytes", () => {
    const ix = approve();
    refuses(
      [{ ...ix, data: Uint8Array.from([...ix.data, 0]) }],
      /wrong length/,
    );
  });

  it("an approval for another deal", () => {
    refuses([approve(SEPTIC, OTHER)], /not for this staged deal/);
  });

  it("an approval signed by someone other than the reviewer", () => {
    // Two signers besides the fee payer: refused before the signer check.
    refuses([approve(OTHER)], /Only GroundTruth's fee payer and the reviewer/);
    expect(
      sponsorRefusal(view([approve(OTHER)]), { ...policy, wallet: OTHER }),
    ).toBeNull();
    refuses(
      [
        approve(OTHER),
        documentMemoInstruction({ signer: SEPTIC, sha256: SHA }),
      ],
      /Only GroundTruth's fee payer and the reviewer/,
    );
  });

  it("the fee payer named as an escrow signer, or as the reviewer", () => {
    refuses(
      [approve(feePayer.toBase58())],
      /Only GroundTruth's fee payer and the reviewer|fee payer account/,
    );
    expect(
      sponsorRefusal(view([approve(feePayer.toBase58())]), {
        ...policy,
        wallet: feePayer.toBase58(),
      }),
    ).toMatch(/cannot be the reviewer/);
  });

  it("a memo signed by the fee payer, a memo with other text, or a memo beside release or hold", () => {
    refuses(
      [
        approve(),
        documentMemoInstruction({ signer: feePayer.toBase58(), sha256: SHA }),
      ],
      /fee payer account/,
    );
    refuses(
      [
        approve(),
        {
          programId: MEMO_PROGRAM_ID,
          keys: [{ pubkey: SEPTIC, isSigner: true, isWritable: false }],
          data: new TextEncoder().encode("send me SOL"),
        },
      ],
      /Only a groundtruth:doc/,
    );
    refuses(
      [release(), documentMemoInstruction({ signer: SEPTIC, sha256: SHA })],
      /only with one sign_approval/,
    );
    refuses(
      [hold(), documentMemoInstruction({ signer: SEPTIC, sha256: SHA })],
      /only with one sign_approval/,
    );
    refuses(
      [
        approve(),
        documentMemoInstruction({ signer: SEPTIC, sha256: SHA }),
        documentMemoInstruction({ signer: SEPTIC, sha256: "cd".repeat(32) }),
      ],
      /only with one sign_approval/,
    );
  });

  it("a priority fee above the cap, a unit limit above the ceiling, or another compute budget instruction", () => {
    refuses(
      [...budget(10_000, PRIORITY_FEE.maxMicroLamports + 1), approve()],
      /above GroundTruth's cap/,
    );
    refuses([...budget(1_400_001), approve()], /runtime ceiling/);
    refuses(
      [
        web3.ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
        approve(),
      ],
      /Only a compute unit limit and price/,
    );
    refuses([...budget(), ...budget(), approve()], /Only one compute unit/);
  });

  it("a transaction whose fee payer is not GroundTruth's", () => {
    expect(
      sponsorRefusal(view([approve()], new web3.PublicKey(OTHER)), policy),
    ).toMatch(/not GroundTruth's/);
  });

  it("a message that uses an address lookup table", () => {
    const base = view([...budget(), approve()]);
    expect(sponsorRefusal({ ...base, addressTableLookups: 1 }, policy)).toMatch(
      /lookup tables/,
    );
  });
});
