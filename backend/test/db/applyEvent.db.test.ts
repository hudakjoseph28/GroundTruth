import { createHmac, randomUUID } from "node:crypto";
import { stagedDeal, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import {
  applyConfirmedEvent,
  ChainDriftError,
} from "../../src/chain/applyEvent.js";
import type {
  ConfirmedEvent,
  ConfirmedTransaction,
  ProgramEvent,
} from "../../src/chain/programEvents.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

// Base58 has no 0, so swap it out of the hex run id used in signatures.
const run = randomUUID().slice(0, 8).replace(/0/g, "z");
// 2026-11-15T00:00:00Z: after this test's copy of the deal is registered.
const BLOCK_TIME = 1_794_700_800;
const dealId = `dbtest-${run}-chain`;
const PDA = `dbtestPda${run}`.padEnd(44, "1");
const CHAIN_ID = "ab".repeat(32);
const [title, survey, septic] = stagedDeal.reviewers;
let txCounter = 0;

const base = { dealPda: PDA, dealId: CHAIN_ID };
const ev = {
  init: { name: "DealInitialized", ...base },
  fund: { name: "DealFunded", ...base, amountBaseUnits: "25000000" },
  approve: (r: typeof title) => ({
    name: "ApprovalSigned",
    ...base,
    reviewerWallet: r!.wallet,
    role: r!.role,
  }),
  hold: {
    name: "HoldPlaced",
    ...base,
    reviewerWallet: title!.wallet,
    role: "title",
    reasonCode: "SELLER_IDENTITY_DISPUTED",
  },
  release: {
    name: "DealReleased",
    ...base,
    amountBaseUnits: "25000000",
    destinationTokenAccount: stagedDeal.sellerTokenAccount,
  },
  refund: {
    name: "DealRefunded",
    ...base,
    amountBaseUnits: "25000000",
    destinationTokenAccount: stagedDeal.buyerWallet,
  },
} satisfies Record<string, ProgramEvent | ((r: typeof title) => ProgramEvent)>;

function confirmed(event: ProgramEvent, eventIndex = 0): ConfirmedEvent {
  txCounter += 1;
  return {
    signature: `dbtest${run}tx${txCounter}`.padEnd(88, "1"),
    slot: 400_000_000 + txCounter,
    blockTime: BLOCK_TIME + txCounter,
    eventIndex,
    event,
  };
}

const apply = (event: ProgramEvent) =>
  applyConfirmedEvent(prisma, confirmed(event));

async function loadDeal(): Promise<Deal> {
  const res = await request(createApp("db-test")).get(`/api/deals/${dealId}`);
  expect(res.status).toBe(200);
  return res.body as Deal;
}

beforeEach(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: dealId } });
  await prisma.$transaction((tx) =>
    seedDeal(tx, {
      ...stagedDeal,
      id: dealId,
      escrowAddress: PDA,
      timeline: stagedDeal.timeline.map((e) => ({
        ...e,
        id: `${dealId}-created`,
        at: TEST_DEAL_CREATED_AT,
      })),
    }),
  );
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: dealId } });
  await prisma.$disconnect();
});

describe("applyConfirmedEvent against PostgreSQL", () => {
  it("plays the cleared path through to a single payout", async () => {
    for (const event of [
      ev.init,
      ev.fund,
      ev.approve(title),
      ev.approve(survey),
      ev.approve(septic),
      ev.release,
    ]) {
      expect(await apply(event)).toBe("applied");
    }

    const deal = await loadDeal();
    expect(deal.state).toBe("released");
    expect(
      deal.reviewers.every((r) => r.approvedAt && r.approvalTransaction),
    ).toBe(true);
    expect(deal.timeline.map((e) => e.type)).toEqual([
      "dealCreated",
      "dealCreated",
      "funded",
      "approvalSigned",
      "approvalSigned",
      "approvalSigned",
      "released",
    ]);
    expect(
      deal.timeline.slice(1).every((e) => e.confirmationStatus === "confirmed"),
    ).toBe(true);
    expect(deal.timeline.at(-1)?.buyerMessage).toBe(
      "25 test USDC was paid to the seller.",
    );
  });

  it("plays the held path: hold recorded, then refund", async () => {
    for (const event of [ev.init, ev.fund, ev.hold]) {
      expect(await apply(event)).toBe("applied");
    }

    let deal = await loadDeal();
    expect(deal.state).toBe("held");
    expect(deal.hold).toMatchObject({
      placedByWallet: title!.wallet,
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
    });

    expect(await apply(ev.refund)).toBe("applied");
    deal = await loadDeal();
    expect(deal.state).toBe("refunded");
    expect(deal.hold).toBeDefined();
  });

  it.each([
    ["approval after a hold", [ev.init, ev.fund, ev.hold], ev.approve(survey)],
    ["release after a hold", [ev.init, ev.fund, ev.hold], ev.release],
    ["release before funding", [ev.init], ev.release],
    ["a second release", [ev.init, ev.fund, ev.release], ev.release],
    ["refund without a hold", [ev.init, ev.fund], ev.refund],
    [
      "a duplicate approval",
      [ev.init, ev.fund, ev.approve(title)],
      ev.approve(title),
    ],
    [
      "an unbound reviewer",
      [ev.init, ev.fund],
      { ...ev.approve(title), reviewerWallet: "1".repeat(44) },
    ],
    ["a different amount", [ev.init], { ...ev.fund, amountBaseUnits: "1" }],
    [
      "a payout to another account",
      [ev.init, ev.fund],
      { ...ev.release, destinationTokenAccount: "2".repeat(44) },
    ],
  ] as [string, ProgramEvent[], ProgramEvent][])(
    "rejects %s as drift and writes nothing",
    async (_label, history, bad) => {
      for (const event of history) await apply(event);
      const before = await loadDeal();

      await expect(apply(bad)).rejects.toBeInstanceOf(ChainDriftError);

      expect(await loadDeal()).toEqual(before);
    },
  );

  it("skips events for a deal PDA the API does not know", async () => {
    const result = await apply({ ...ev.init, dealPda: "3".repeat(44) });

    expect(result).toBe("unknownDeal");
    expect((await loadDeal()).timeline).toHaveLength(1);
  });

  it("applies a replayed event once", async () => {
    const event = confirmed(ev.init);

    expect(await applyConfirmedEvent(prisma, event)).toBe("applied");
    expect(await applyConfirmedEvent(prisma, event)).toBe("duplicate");
    expect((await loadDeal()).timeline).toHaveLength(2);
  });

  it("treats a concurrent replay as a duplicate, not an error", async () => {
    const event = confirmed(ev.init);

    const results = await Promise.all([
      applyConfirmedEvent(prisma, event),
      applyConfirmedEvent(prisma, event),
    ]);

    expect(results.sort()).toEqual(["applied", "duplicate"]);
    expect((await loadDeal()).timeline).toHaveLength(2);
  });
});

describe("POST /api/webhooks/quicknode against PostgreSQL", () => {
  const TOKEN = "db-test-token";

  function signed(body: string) {
    const nonce = randomUUID();
    const ts = "1763200000";
    return {
      "x-qn-nonce": nonce,
      "x-qn-timestamp": ts,
      "x-qn-signature": createHmac("sha256", TOKEN)
        .update(nonce + ts)
        .update(body)
        .digest("hex"),
    };
  }

  it("projects a signed delivery and ignores a replay of it", async () => {
    // Stands in for the IDL decoder: each log line names one event.
    const byLog: Record<string, ProgramEvent> = {
      init: ev.init,
      fund: ev.fund,
      hold: ev.hold,
    };
    const decode = (tx: ConfirmedTransaction) =>
      tx.logMessages.map((line) => byLog[line]!);
    const app = createApp("db-test", { quicknode: { token: TOKEN, decode } });
    const sig = (n: number) => `dbtest${run}wh${n}`.padEnd(88, "1");
    const body = JSON.stringify({
      transactions: [
        {
          signature: sig(1),
          slot: 500_000_001,
          blockTime: BLOCK_TIME + 1,
          logMessages: ["init", "fund"],
        },
        {
          signature: sig(2),
          slot: 500_000_002,
          blockTime: BLOCK_TIME + 2,
          logMessages: ["hold"],
        },
      ],
    });

    const first = await request(app)
      .post("/api/webhooks/quicknode")
      .set("content-type", "application/json")
      .set(signed(body))
      .send(body);
    const replay = await request(app)
      .post("/api/webhooks/quicknode")
      .set("content-type", "application/json")
      .set(signed(body))
      .send(body);

    expect(first.status).toBe(204);
    expect(replay.status).toBe(204);
    const deal = await loadDeal();
    expect(deal.state).toBe("held");
    expect(deal.timeline.map((e) => [e.type, e.transactionSignature])).toEqual([
      ["dealCreated", undefined],
      ["dealCreated", sig(1)],
      ["funded", sig(1)],
      ["holdPlaced", sig(2)],
    ]);
  });
});
