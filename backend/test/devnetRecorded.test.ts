// REAL DEVNET DATA (test/fixtures/devnet), recorded from the public RPC by
// scripts/record-devnet-transactions.ts. The IDL-encoded tests cover the six
// events; this file checks the same filter, webhook, and decoder against
// what is actually on chain.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import type { ConfirmedEvent } from "../src/chain/programEvents.js";
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
 * Recorded transactions the filter must send to the API. Empty until the
 * demo deals run on devnet: after re-recording, add each escrow transaction
 * here with the events it must decode to.
 */
const EXPECTED_SENT: Record<string, ConfirmedEvent["event"]["name"][]> = {};

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
      const events = decode({
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime ?? 0,
        logMessages: tx.meta.logMessages,
        err: tx.meta.err,
      });
      expect(events.map((e) => e.name)).toEqual(EXPECTED_SENT[signature] ?? []);
    },
  );

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
