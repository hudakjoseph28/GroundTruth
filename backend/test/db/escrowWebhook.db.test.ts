/**
 * QuickNode deliveries through the real webhook route, the IDL decoder,
 * and applyConfirmedEvent, against PostgreSQL.
 *
 * IDL-ENCODED TEST DATA (test/support/escrowLogs.ts), not recorded from
 * devnet. TODO(devnet): replay recorded devnet transactions for these two
 * flows once the escrow program is deployed.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { utils, web3 } from "@anchor-lang/core";
import { stagedDeal, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import {
  dealKeys,
  events,
  heldReleaseLogs,
  invocation,
  PROGRAM,
  releaseAccounts,
  type DealKeys,
} from "../support/escrowLogs.js";

const TOKEN = "db-test-stream-token";
const run = randomUUID().slice(0, 8);
const BLOCK_TIME = 1_794_700_800;
let slot = 410_000_000;

const app = createApp("db-test", { quicknode: { token: TOKEN } });

const newSignature = () => utils.bytes.bs58.encode(randomBytes(64));

/** One Stream delivery holding one transaction, signed like QuickNode. */
async function deliver(transaction: Record<string, unknown>) {
  slot += 1;
  const body = JSON.stringify({
    transactions: [
      { slot, blockTime: BLOCK_TIME + (slot % 1000), ...transaction },
    ],
  });
  const nonce = `n-${slot}`;
  const timestamp = String(BLOCK_TIME);
  const res = await request(app)
    .post("/api/webhooks/quicknode")
    .set("content-type", "application/json")
    .set({
      "x-qn-nonce": nonce,
      "x-qn-timestamp": timestamp,
      "x-qn-signature": createHmac("sha256", TOKEN)
        .update(nonce + timestamp)
        .update(body)
        .digest("hex"),
    })
    .send(body);
  expect(res.status).toBe(204);
}

/** A successful transaction whose GroundTruth invocation logged `lines`. */
const succeeded = (lines: string[], signature = newSignature()) =>
  deliver({ signature, logMessages: invocation(PROGRAM, lines) });

async function loadDeal(id: string): Promise<Deal> {
  const res = await request(app).get(`/api/deals/${id}`);
  expect(res.status).toBe(200);
  return res.body as Deal;
}

async function seed(id: string, k: DealKeys) {
  await prisma.dealRecord.deleteMany({ where: { id } });
  await prisma.$transaction((tx) =>
    seedDeal(tx, {
      ...stagedDeal,
      id,
      buyerWallet: k.buyer.toBase58(),
      sellerWallet: k.seller.toBase58(),
      sellerTokenAccount: k.sellerTokenAccount.toBase58(),
      escrowAddress: k.deal.toBase58(),
      reviewers: (["title", "survey", "septic"] as const).map((role) => ({
        wallet: k.reviewers[role].toBase58(),
        role,
        required: true,
      })),
      timeline: stagedDeal.timeline.map((e) => ({ ...e, id: `${id}-created` })),
    }),
  );
}

const held = { id: `dbtest-${run}-held`, keys: dealKeys() };
const cleared = { id: `dbtest-${run}-cleared`, keys: dealKeys() };

beforeEach(async () => {
  await seed(held.id, held.keys);
  await seed(cleared.id, cleared.keys);
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [held.id, cleared.id] } },
  });
  await prisma.$disconnect();
});

describe("QuickNode deliveries decoded from IDL-encoded logs, into PostgreSQL", () => {
  it("held flow: init, fund, hold, rejected release, refund", async () => {
    const e = events(held.keys);
    await succeeded([e.init]);
    await succeeded([e.fund]);
    await succeeded([e.hold()]);

    // A release while the hold is active fails on-chain with DealHeld.
    const rejected = newSignature();
    const failedRelease = {
      signature: rejected,
      logMessages: heldReleaseLogs(),
      err: { InstructionError: [0, { Custom: 6019 }] },
      releaseAccounts: releaseAccounts(
        held.keys,
        web3.Keypair.generate().publicKey,
      ),
    };
    await deliver(failedRelease);

    const afterRejection = await loadDeal(held.id);
    expect(afterRejection.state).toBe("held");
    expect(afterRejection.hold?.reasonCode).toBe("SELLER_IDENTITY_DISPUTED");
    const rejection = afterRejection.timeline.find(
      (event) => event.type === "releaseRejected",
    );
    expect(rejection).toMatchObject({
      type: "releaseRejected",
      actorRole: "escrow program",
      transactionSignature: rejected,
      confirmationStatus: "confirmed",
    });
    expect(rejection?.buyerMessage).toBe(
      "A release was rejected on-chain because a reviewer's hold is active. No funds moved. Program error: DealHeld (6019).",
    );

    // QuickNode redelivers the same block: deduplicated, nothing new.
    await deliver({ ...failedRelease });
    expect(
      (await loadDeal(held.id)).timeline.filter(
        (x) => x.type === "releaseRejected",
      ),
    ).toHaveLength(1);

    await succeeded([e.refund]);

    const deal = await loadDeal(held.id);
    expect(deal.state).toBe("refunded");
    expect(deal.timeline.map((event) => event.type)).toEqual([
      "dealCreated",
      "dealCreated",
      "funded",
      "holdPlaced",
      "releaseRejected",
      "refunded",
    ]);
  });

  it("released flow: init, fund, three approvals, release", async () => {
    const e = events(cleared.keys);
    await succeeded([e.init]);
    await succeeded([e.fund]);
    // Two approvals in one transaction: two events, indexes 0 and 1.
    await succeeded([e.approve("Title"), e.approve("Survey")]);
    await succeeded([e.approve("Septic")]);
    await succeeded([e.release]);

    const deal = await loadDeal(cleared.id);
    expect(deal.state).toBe("released");
    expect(
      deal.reviewers.every((r) => r.approvedAt && r.approvalTransaction),
    ).toBe(true);
    expect(deal.timeline.map((event) => event.type)).toEqual([
      "dealCreated",
      "dealCreated",
      "funded",
      "approvalSigned",
      "approvalSigned",
      "approvalSigned",
      "released",
    ]);
    expect(deal.timeline.at(-1)?.buyerMessage).toBe(
      "25 test USDC was paid to the seller.",
    );
  });
});
