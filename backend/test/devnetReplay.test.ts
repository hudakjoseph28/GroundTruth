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
  it("finds nothing to apply in the deploy and IDL transactions", async () => {
    const apply = vi.fn();
    const txs = loadDevnetRecording().transactions as RpcTransaction[];
    expect(await replayTransactions(txs, { decode, apply })).toEqual([]);
    expect(apply).not.toHaveBeenCalled();
  });
});
