// The staged demo deals the API registers must be the deals
// escrow/scripts/demo-deals.ts creates on devnet, or every delivery for them
// is skipped as unknownDeal. Re-derives each address from public inputs.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  stagedRehearsalDeal,
  stagedRehearsalV2Deal,
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
  it("keeps the staged-devnet-deal ID as the held deal and adds the released, live, and two rehearsal ones", () => {
    expect(stagedDemoDeals.map((d) => d.id)).toEqual([
      "staged-devnet-deal",
      "staged-devnet-deal-released",
      "staged-devnet-deal-live",
      "staged-devnet-deal-rehearsal",
      "staged-devnet-deal-rehearsal-v2",
    ]);
    expect(stagedDemoChainAccounts[stagedDeal.id]?.outcome).toBe("held");
    expect(stagedDemoChainAccounts[stagedReleasedDeal.id]?.outcome).toBe(
      "released",
    );
    expect(stagedDemoChainAccounts[stagedLiveDeal.id]?.outcome).toBe("live");
    expect(stagedDemoChainAccounts[stagedRehearsalDeal.id]?.outcome).toBe(
      "rehearsal",
    );
    expect(stagedDemoChainAccounts[stagedRehearsalV2Deal.id]?.outcome).toBe(
      "rehearsalV2",
    );
  });

  it.each([
    [stagedDeal.id, stagedDeal, "25000000"],
    [stagedReleasedDeal.id, stagedReleasedDeal, "25000000"],
    // The live deal fits in what the buyer had left after the first two.
    [stagedLiveDeal.id, stagedLiveDeal, "10000000"],
    // The rehearsal copy mirrors the live deal, so a rehearsal looks the same.
    [stagedRehearsalDeal.id, stagedRehearsalDeal, "10000000"],
    [stagedRehearsalV2Deal.id, stagedRehearsalV2Deal, "10000000"],
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
    expect(new Set(stagedDemoDeals.map((d) => d.escrowAddress)).size).toBe(5);
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
    expect(participants(stagedRehearsalDeal)).toEqual(participants(stagedDeal));
    expect(participants(stagedRehearsalV2Deal)).toEqual(
      participants(stagedDeal),
    );
  });
});

describe('the off-chain "created" row of each staged deal', () => {
  /** Block time of a deal's first devnet transaction, from the recording. */
  const firstRecorded = (dealId: string) => {
    const run = JSON.parse(
      readFileSync(
        new URL(`./fixtures/devnet/demo-run/${dealId}.json`, import.meta.url),
        "utf8",
      ),
    ) as { transactions: { blockTime: number }[] };
    return Math.min(...run.transactions.map((tx) => tx.blockTime)) * 1000;
  };
  // staged-devnet-deal-live has no recording in the repo. Its first
  // confirmed row, read from GET /api/deals/staged-devnet-deal-live on
  // 2026-11-18, is the escrow's creation at 18:57:19Z.
  const FIRST_ON_CHAIN: Record<string, number> = {
    [stagedDeal.id]: firstRecorded(stagedDeal.id),
    [stagedReleasedDeal.id]: firstRecorded(stagedReleasedDeal.id),
    [stagedLiveDeal.id]: Date.parse("2026-11-18T18:57:19.000Z"),
  };

  it.each(stagedDemoDeals.map((deal) => [deal.id, deal] as const))(
    "%s: one off-chain row, at a real time of day",
    (_id, deal) => {
      expect(deal.timeline).toHaveLength(1);
      const [row] = deal.timeline;
      expect(row.confirmationStatus).toBe("offChainEvidence");
      expect(row).not.toHaveProperty("transactionSignature");
      expect(row.at.endsWith("T00:00:00.000Z")).toBe(false);
    },
  );

  it.each(
    [stagedDeal, stagedReleasedDeal, stagedLiveDeal].map(
      (deal) => [deal.id, deal] as const,
    ),
  )("%s: shortly before its first on-chain event", (_id, deal) => {
    const at = Date.parse(deal.timeline[0].at);
    const firstOnChain = FIRST_ON_CHAIN[deal.id] ?? Number.NaN;
    expect(at).toBeLessThan(firstOnChain);
    // The same afternoon: within the hour, not days or a midnight earlier.
    expect(firstOnChain - at).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("registers the rehearsal deal after the live one it copies", () => {
    // It had no devnet transaction when it was registered (its PDA held no
    // signatures on 2026-11-18T22:46Z), so any event it gets sorts after.
    expect(Date.parse(stagedRehearsalDeal.timeline[0].at)).toBeGreaterThan(
      Date.parse(stagedLiveDeal.timeline[0].at),
    );
    // v2 had no devnet transaction on its PDA when it was registered.
    expect(Date.parse(stagedRehearsalV2Deal.timeline[0].at)).toBeGreaterThan(
      Date.parse(stagedRehearsalDeal.timeline[0].at),
    );
  });

  it("reads the recorded first transactions it compares against", () => {
    expect(new Date(FIRST_ON_CHAIN[stagedDeal.id] ?? 0).toISOString()).toBe(
      "2026-11-18T17:41:17.000Z",
    );
    expect(
      new Date(FIRST_ON_CHAIN[stagedReleasedDeal.id] ?? 0).toISOString(),
    ).toBe("2026-11-18T17:48:33.000Z");
  });
});
