// REAL DEVNET DATA (test/fixtures/devnet), recorded from the public RPC by
// scripts/record-devnet-transactions.ts. The IDL-encoded tests cover the six
// events; this file checks the same filter, webhook, and decoder against
// what is actually on chain.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
  stagedDeal,
  stagedDemoChainAccounts,
  stagedReleasedDeal,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import type {
  ConfirmedEvent,
  ConfirmedTransaction,
} from "../src/chain/programEvents.js";
import {
  idlFromMetadataAccount,
  IDL_METADATA_ACCOUNT,
  loadDevnetRecording,
  type RecordedTransaction,
} from "./fixtures/devnet/recording.js";

const recording = loadDevnetRecording();
const decode = createEscrowDecoder();
const signatureOf = (tx: RecordedTransaction) => tx.transaction.signatures[0];

const filter = new Function(
  `${readFileSync(new URL("../quicknode/groundtruth-filter.js", import.meta.url), "utf8")}\nreturn main;`,
)() as (stream: unknown) => { transactions: { signature: string }[] } | null;

/** A recorded transaction as one QuickNode Block dataset delivery. */
const asBlock = (tx: RecordedTransaction) => ({
  data: [
    {
      slot: tx.slot,
      blockTime: tx.blockTime,
      transactions: [{ transaction: tx.transaction, meta: tx.meta }],
    },
  ],
});

/**
 * Recorded transactions the filter must send to the API, with the events
 * each must decode to: the two staged demo closings run on devnet on
 * 2026-11-18 by escrow/scripts/demo-deals.ts (escrow/demo-results). The
 * deploy, IDL, and upgrade transactions are not sent.
 */
const EXPECTED_SENT: Record<string, ConfirmedEvent["event"]["name"][]> = {
  // staged-devnet-deal (held), PDA 54Va6qKN...E4tW
  "4ZscUVnfZ3W5ukt7H8tSBrQZNrvY5Hu3Qq9oRNJeTbHj61UvwcPAAssZJ4DtaxzeVQAb2rcFPYyRGWsQuaoPKjNv":
    ["DealInitialized"],
  grkKU9YqV1xpAkHySCjdhLgavpd5dW3mJsvbiZ1tjEyvuHC9T373Hmscubsm8UapaA7j93pHrseJMepw1C3dd74:
    ["DealFunded"],
  "5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib":
    ["HoldPlaced"],
  // The failed release: sent with its accounts, decoded as ReleaseRejected.
  Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz:
    ["ReleaseRejected"],
  SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo:
    ["DealRefunded"],
  // staged-devnet-deal-released, PDA 3uBECmkG...y2yu
  ZFo3g36XTKCaVkLJKpgD2S2sGf4zqNVp3tsFkpSPeJ9mNyfJbWCHtjPDbAV8oUvdXGZs7Ag7n9jTxGbRhh2hM9M:
    ["DealInitialized"],
  "4a2HxSta9rKio7BsFMVzTvKfA9yBBSzr9uFzJEtDDNG3wJi7hzsJCgkM8SuCt3qQfkUCg4VUM8VCwxHykhDwtxgR":
    ["DealFunded"],
  "5Rnsas4nLpLJM8ss63dB2768wbTRJteEWBMCE7Z4njzE1JNk547WQ7nQdp38W8Go25tX2YsQtvvn5nRNdEV5jBqt":
    ["ApprovalSigned"],
  "3D8ahBLYuhCiZfNZcMgQZZ3UQnHeoNcBFCgu9NLbyao1TZUMCKBn4RjWcKYJhQupNiZy1JiXnyN8UUARFM57jL9P":
    ["ApprovalSigned"],
  "7tnvjTxYw6vu7xFKCDTJ4fJGjerS6SCJ3QfSkFn3N916bXaBVEmBnrYwrF9hHSFyCurox1Kct9YdcJGxm4XS2fb":
    ["ApprovalSigned"],
  "5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC":
    ["DealReleased"],
};

describe("recorded devnet state of the GroundTruth program", () => {
  it("is the deployed, executable program the API is built for", () => {
    expect(recording.cluster).toBe("devnet");
    expect(recording.programId).toBe(GROUNDTRUTH_PROGRAM_ID);
    expect(recording.program.account).toMatchObject({
      executable: true,
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
    });
  });

  it("publishes exactly the checked-in IDL the decoder reads", () => {
    expect(recording.idlMetadata.address).toBe(IDL_METADATA_ACCOUNT);
    const onChain = idlFromMetadataAccount(recording.idlMetadata.account!);
    expect(onChain).toEqual(GROUNDTRUTH_ESCROW_IDL);
  });

  it("starts with the deploy transaction from #22", () => {
    expect(signatureOf(recording.transactions[0]!)).toBe(
      "4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU",
    );
  });
});

describe("recorded devnet transactions through the filter and decoder", () => {
  it("sends exactly the expected transactions", () => {
    const sent = recording.transactions
      .flatMap((tx) => filter(asBlock(tx))?.transactions ?? [])
      .map((entry) => entry.signature);
    expect(sent).toEqual(Object.keys(EXPECTED_SENT));
  });

  it.each(recording.transactions.map((tx) => [signatureOf(tx), tx] as const))(
    "reads the real runtime logs of %s",
    (signature, tx) => {
      // What the API sees: the filter's entry if it sends this transaction
      // (a failed release carries its accounts), else the raw logs.
      const sent = filter(asBlock(tx))?.transactions[0] as
        | ConfirmedTransaction
        | undefined;
      const events = decode(
        sent ?? {
          signature,
          slot: tx.slot,
          blockTime: tx.blockTime ?? 0,
          logMessages: tx.meta.logMessages,
          err: tx.meta.err,
        },
      );
      expect(events.map((e) => e.name)).toEqual(EXPECTED_SENT[signature] ?? []);
    },
  );

  it("decodes the held deal's rejected release as DealHeld (6019) and both settlements as exactly 25 USDC", () => {
    const events = recording.transactions.flatMap((tx) => {
      const sent = filter(asBlock(tx))?.transactions[0] as
        | ConfirmedTransaction
        | undefined;
      return sent ? decode(sent) : [];
    });
    expect(events.find((e) => e.name === "ReleaseRejected")).toEqual({
      name: "ReleaseRejected",
      dealPda: stagedDeal.escrowAddress,
      errorName: "DealHeld",
      errorNumber: 6019,
    });
    expect(events.find((e) => e.name === "DealRefunded")).toMatchObject({
      dealPda: stagedDeal.escrowAddress,
      amountBaseUnits: "25000000",
      destinationTokenAccount:
        stagedDemoChainAccounts[stagedDeal.id]!.buyerTokenAccount,
    });
    expect(events.find((e) => e.name === "DealReleased")).toMatchObject({
      dealPda: stagedReleasedDeal.escrowAddress,
      amountBaseUnits: "25000000",
      destinationTokenAccount: stagedReleasedDeal.sellerTokenAccount,
    });
  });

  it("posts every sent transaction through the real webhook and decoder", async () => {
    const token = "devnet-recording-token";
    const apply = vi.fn<(event: ConfirmedEvent) => Promise<ApplyResult>>(
      async () => "applied",
    );
    const app = createApp("test", { quicknode: { token, apply } });
    for (const tx of recording.transactions) {
      const body = filter(asBlock(tx));
      if (!body) continue;
      const raw = JSON.stringify(body);
      const res = await request(app)
        .post("/api/webhooks/quicknode")
        .set("content-type", "application/json")
        .set({
          "x-qn-nonce": "n",
          "x-qn-timestamp": "0",
          "x-qn-signature": createHmac("sha256", token)
            .update("n0")
            .update(raw)
            .digest("hex"),
        })
        .send(raw);
      expect(res.status).toBe(204);
    }
    expect(apply.mock.calls.map(([e]) => e.event.name)).toEqual(
      Object.values(EXPECTED_SENT).flat(),
    );
  });
});
