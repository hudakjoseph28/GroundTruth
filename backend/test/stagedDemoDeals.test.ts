// The staged demo deals the API registers must be the deals
// escrow/scripts/demo-deals.ts creates on devnet, or every delivery for them
// is skipped as unknownDeal. Re-derives each address from public inputs.
import { createHash } from "node:crypto";
import { web3 } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  GROUNDTRUTH_PROGRAM_ID,
  STAGED_DEAL_ID_LABELS,
  TOKEN_PROGRAM_ID,
  USDC_MINT_DEVNET,
  goldenParcel,
  stagedDeal,
  stagedDemoChainAccounts,
  stagedDemoDeals,
  stagedLiveDeal,
  stagedReleasedDeal,
  type Deal,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";

const key = (k: string) => new web3.PublicKey(k);
const mint = key(USDC_MINT_DEVNET);

function ata(owner: web3.PublicKey) {
  return web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), key(TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
    key(ASSOCIATED_TOKEN_PROGRAM_ID),
  )[0].toBase58();
}

describe("staged demo deals", () => {
  it("keeps the staged-devnet-deal ID as the held deal and adds the released and live ones", () => {
    expect(stagedDemoDeals.map((d) => d.id)).toEqual([
      "staged-devnet-deal",
      "staged-devnet-deal-released",
      "staged-devnet-deal-live",
    ]);
    expect(stagedDemoChainAccounts[stagedDeal.id]?.outcome).toBe("held");
    expect(stagedDemoChainAccounts[stagedReleasedDeal.id]?.outcome).toBe(
      "released",
    );
    expect(stagedDemoChainAccounts[stagedLiveDeal.id]?.outcome).toBe("live");
  });

  it.each([
    [stagedDeal.id, stagedDeal, "25000000"],
    [stagedReleasedDeal.id, stagedReleasedDeal, "25000000"],
    // The live deal fits in what the buyer had left after the first two.
    [stagedLiveDeal.id, stagedLiveDeal, "10000000"],
  ] as const)(
    "%s: bound to the golden parcel, its amount, three required reviewers",
    (_id, deal, amount) => {
      expect(deal.parcelKey).toBe(goldenParcel.key);
      expect(deal.amountBaseUnits).toBe(amount);
      expect(deal.mint).toBe(USDC_MINT_DEVNET);
      expect(deal.state).toBe("draft");
      expect(deal.reviewers.map((r) => [r.role, r.required])).toEqual([
        ["title", true],
        ["survey", true],
        ["septic", true],
      ]);
      // seedDeal refuses fixtures that claim confirmed chain events.
      expect(
        deal.timeline.map((e): string => e.confirmationStatus),
      ).not.toContain("confirmed");
    },
  );

  it.each(stagedDemoDeals.map((d) => [d.id, d] as const))(
    "%s: every address derives from the public inputs",
    (_id, deal) => {
      const chain = stagedDemoChainAccounts[deal.id]!;
      const dealId = createHash("sha256").update(chain.dealIdLabel).digest();
      expect(chain.dealIdLabel).toBe(STAGED_DEAL_ID_LABELS[chain.outcome]);
      expect(dealId.toString("hex")).toBe(chain.dealIdHex);

      const [pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("deal"), key(deal.buyerWallet).toBuffer(), dealId],
        key(GROUNDTRUTH_PROGRAM_ID),
      );
      expect(deal.escrowAddress).toBe(pda.toBase58());
      expect(chain.vault).toBe(ata(pda));
      expect(deal.sellerTokenAccount).toBe(ata(key(deal.sellerWallet)));
      expect(chain.buyerTokenAccount).toBe(ata(key(deal.buyerWallet)));
    },
  );

  it("gives every deal a distinct PDA and the same participants", () => {
    expect(new Set(stagedDemoDeals.map((d) => d.escrowAddress)).size).toBe(3);
    const participants = (deal: Deal) => ({
      parcelKey: deal.parcelKey,
      buyerWallet: deal.buyerWallet,
      sellerWallet: deal.sellerWallet,
      sellerTokenAccount: deal.sellerTokenAccount,
      reviewers: deal.reviewers,
      mint: deal.mint,
      cluster: deal.cluster,
      state: deal.state,
    });
    expect(participants(stagedReleasedDeal)).toEqual(participants(stagedDeal));
    expect(participants(stagedLiveDeal)).toEqual(participants(stagedDeal));
  });
});
