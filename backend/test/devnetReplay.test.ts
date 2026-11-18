// replay:devnet's pipeline (filter -> payload schema -> IDL decoder) on
// recorded data, without a database:
//   - SIMULATED demo closings (test/fixtures/devnet/demo-deals.simulated.json):
//     LiteSVM runs of the deployed bytecode, not devnet transactions;
//   - REAL devnet history of the program (program-history.json).
import { readFileSync } from "node:fs";
import {
  stagedDeal,
  stagedDemoChainAccounts,
  stagedReleasedDeal,
} from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import {
  replayTransactions,
  streamPayloadFor,
  type RpcTransaction,
} from "../src/chain/devnetReplay.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import type { ConfirmedEvent } from "../src/chain/programEvents.js";
import { decodeStreamPayload } from "../src/chain/streamPayload.js";
import { loadDevnetRecording } from "./fixtures/devnet/recording.js";

const simulated = JSON.parse(
  readFileSync(
    new URL("./fixtures/devnet/demo-deals.simulated.json", import.meta.url),
    "utf8",
  ),
) as { deals: Record<string, string>; transactions: RpcTransaction[] };
const decode = createEscrowDecoder();

const eventsFor = (pda: string | undefined) =>
  decodeStreamPayload(streamPayloadFor(simulated.transactions), decode).filter(
    (e) => e.event.dealPda === pda,
  );

describe("replay pipeline on the simulated demo closings", () => {
  it("was simulated for exactly the staged deals' PDAs", () => {
    expect(simulated.deals).toEqual({
      [stagedDeal.id]: stagedDeal.escrowAddress,
      [stagedReleasedDeal.id]: stagedReleasedDeal.escrowAddress,
    });
  });

  it("sends every program transaction, including the failed release, and skips the two setup transactions", () => {
    const payload = streamPayloadFor(simulated.transactions) as {
      transactions: { err?: unknown; releaseAccounts?: string[] }[];
    };
    // 13 = simulated faucet + seller USDC account + 11 GroundTruth transactions.
    expect(simulated.transactions).toHaveLength(13);
    expect(payload.transactions).toHaveLength(11);
    const failed = payload.transactions.filter((t) => t.err);
    expect(failed).toEqual([
      expect.objectContaining({
        err: { InstructionError: [0, { Custom: 6019 }] },
      }),
    ]);
    expect(failed[0]!.releaseAccounts?.[1]).toBe(stagedDeal.escrowAddress);
  });

  it("held deal: init, fund, title hold, release rejected with DealHeld (6019), refund", () => {
    const events = eventsFor(stagedDeal.escrowAddress).map((e) => e.event);
    expect(events.map((e) => e.name)).toEqual([
      "DealInitialized",
      "DealFunded",
      "HoldPlaced",
      "ReleaseRejected",
      "DealRefunded",
    ]);
    expect(events[2]).toMatchObject({
      reviewerWallet: stagedDeal.reviewers[0]!.wallet,
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
    });
    expect(events[3]).toMatchObject({
      errorName: "DealHeld",
      errorNumber: 6019,
    });
    expect(events[4]).toMatchObject({
      amountBaseUnits: "25000000",
      destinationTokenAccount:
        stagedDemoChainAccounts[stagedDeal.id]!.buyerTokenAccount,
    });
  });

  it("released deal: init, fund, three approvals, release to the seller", () => {
    const events = eventsFor(stagedReleasedDeal.escrowAddress).map(
      (e) => e.event,
    );
    expect(events.map((e) => e.name)).toEqual([
      "DealInitialized",
      "DealFunded",
      "ApprovalSigned",
      "ApprovalSigned",
      "ApprovalSigned",
      "DealReleased",
    ]);
    expect(
      events
        .filter((e) => e.name === "ApprovalSigned")
        .map((e) => "reviewerWallet" in e && [e.role, e.reviewerWallet]),
    ).toEqual(stagedReleasedDeal.reviewers.map((r) => [r.role, r.wallet]));
    expect(events[5]).toMatchObject({
      amountBaseUnits: "25000000",
      destinationTokenAccount: stagedReleasedDeal.sellerTokenAccount,
    });
  });

  it("applies every event in chain order", async () => {
    const apply = vi.fn<(e: ConfirmedEvent) => Promise<ApplyResult>>(
      async () => "applied",
    );
    const applied = await replayTransactions(simulated.transactions, {
      decode,
      apply,
    });
    expect(applied).toHaveLength(11);
    const slots = apply.mock.calls.map(([e]) => e.slot);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
  });
});

describe("replay pipeline on the real devnet program history", () => {
  it("applies nothing from the deploy, IDL, and upgrade transactions", async () => {
    const apply = vi.fn();
    const txs = (loadDevnetRecording().transactions as RpcTransaction[]).filter(
      (tx) =>
        !JSON.stringify(tx.transaction.message).includes(
          stagedDeal.escrowAddress,
        ) &&
        !JSON.stringify(tx.transaction.message).includes(
          stagedReleasedDeal.escrowAddress,
        ),
    );
    expect(txs).toHaveLength(4);
    expect(await replayTransactions(txs, { decode, apply })).toEqual([]);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("replay pipeline on the real devnet demo run", () => {
  // Saved by `replay:devnet --deal <id> --save` after the run on 2026-11-18.
  const recorded = (id: string) =>
    JSON.parse(
      readFileSync(
        new URL(`./fixtures/devnet/demo-run/${id}.json`, import.meta.url),
        "utf8",
      ),
    ) as { dealPda: string; transactions: RpcTransaction[] };

  it.each([
    [
      stagedDeal,
      [
        "DealInitialized",
        "DealFunded",
        "HoldPlaced",
        "ReleaseRejected",
        "DealRefunded",
      ],
    ],
    [
      stagedReleasedDeal,
      [
        "DealInitialized",
        "DealFunded",
        "ApprovalSigned",
        "ApprovalSigned",
        "ApprovalSigned",
        "DealReleased",
      ],
    ],
  ] as const)(
    "%s.id: every transaction of the PDA decodes in order",
    async (deal, names) => {
      const file = recorded(deal.id);
      expect(file.dealPda).toBe(deal.escrowAddress);
      const apply = vi.fn<(e: ConfirmedEvent) => Promise<ApplyResult>>(
        async () => "applied",
      );
      const applied = await replayTransactions(file.transactions, {
        decode,
        apply,
      });
      expect(applied.map((a) => a.event.event.name)).toEqual(names);
      expect(
        applied.every((a) => a.event.event.dealPda === deal.escrowAddress),
      ).toBe(true);
    },
  );

  it("held deal: the rejected release is DealHeld (6019) with its real signature", async () => {
    const applied = await replayTransactions(
      recorded(stagedDeal.id).transactions,
      { decode, apply: async () => "applied" },
    );
    const rejected = applied.find(
      (a) => a.event.event.name === "ReleaseRejected",
    );
    expect(rejected?.event.signature).toBe(
      "Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz",
    );
    expect(rejected?.event.event).toMatchObject({
      errorName: "DealHeld",
      errorNumber: 6019,
    });
  });
});
