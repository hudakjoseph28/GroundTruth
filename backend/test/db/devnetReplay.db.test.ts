/**
 * replay:devnet's pipeline into PostgreSQL: filter -> payload schema -> IDL
 * decoder -> applyConfirmedEvent, run twice.
 *
 * Data: SIMULATED demo closings (test/fixtures/devnet/demo-deals.simulated.json),
 * LiteSVM runs of the deployed bytecode for the staged deals' real PDAs. Not
 * devnet transactions. TODO(devnet): add the recorded devnet run.
 *
 * The seeded staged deals own these PDAs (escrowAddress is unique), so the
 * test detaches the PDAs from whichever rows hold them, replays into its own
 * dbtest-* copies, and restores the original rows' escrowAddress afterwards.
 * Their state and timeline are never touched; `db:seed` also restores the
 * addresses if a run is interrupted.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { stagedDeal, stagedReleasedDeal, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { applyConfirmedEvent } from "../../src/chain/applyEvent.js";
import {
  replayTransactions,
  type RpcTransaction,
} from "../../src/chain/devnetReplay.js";
import { createEscrowDecoder } from "../../src/chain/escrowDecoder.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";

const simulated = JSON.parse(
  readFileSync(
    new URL("../fixtures/devnet/demo-deals.simulated.json", import.meta.url),
    "utf8",
  ),
) as { transactions: RpcTransaction[] };

const run = randomUUID().slice(0, 8);
const held = `dbtest-${run}-replay-held`;
const released = `dbtest-${run}-replay-released`;
const pdas = [stagedDeal.escrowAddress, stagedReleasedDeal.escrowAddress];
const app = createApp("db-test");
let detached: { id: string; escrowAddress: string | null }[] = [];

const copy = (deal: Deal, id: string): Deal => ({
  ...deal,
  id,
  timeline: deal.timeline.map((e) => ({ ...e, id: `${id}-created` })),
});

const replay = () =>
  replayTransactions(simulated.transactions, {
    decode: createEscrowDecoder(),
    apply: (event) => applyConfirmedEvent(prisma, event),
  });

async function loadDeal(id: string): Promise<Deal> {
  const res = await request(app).get(`/api/deals/${id}`);
  expect(res.status).toBe(200);
  return res.body as Deal;
}

beforeAll(async () => {
  detached = await prisma.dealRecord.findMany({
    where: { escrowAddress: { in: pdas } },
    select: { id: true, escrowAddress: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.dealRecord.updateMany({
      where: { escrowAddress: { in: pdas } },
      data: { escrowAddress: null },
    });
    await seedDeal(tx, copy(stagedDeal, held));
    await seedDeal(tx, copy(stagedReleasedDeal, released));
  });
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [held, released] } },
  });
  for (const row of detached) {
    await prisma.dealRecord.update({
      where: { id: row.id },
      data: { escrowAddress: row.escrowAddress },
    });
  }
  await prisma.$disconnect();
});

describe("replaying the demo closings into PostgreSQL", () => {
  it("projects both deals, then changes nothing on a second replay", async () => {
    const first = await replay();
    expect(first.map((a) => a.result)).toEqual(Array(11).fill("applied"));

    const heldDeal = await loadDeal(held);
    expect(heldDeal.state).toBe("refunded");
    expect(heldDeal.timeline.map((e) => e.type)).toEqual([
      "dealCreated",
      "dealCreated",
      "funded",
      "holdPlaced",
      "releaseRejected",
      "refunded",
    ]);
    const rejected = heldDeal.timeline.find(
      (e) => e.type === "releaseRejected",
    );
    expect(rejected?.buyerMessage).toBe(
      "A release was rejected on-chain because a reviewer's hold is active. No funds moved. Program error: DealHeld (6019).",
    );
    expect(heldDeal.hold).toMatchObject({
      role: "title",
      reasonCode: "SELLER_IDENTITY_DISPUTED",
    });

    const releasedDeal = await loadDeal(released);
    expect(releasedDeal.state).toBe("released");
    expect(releasedDeal.reviewers.every((r) => r.approvalTransaction)).toBe(
      true,
    );
    expect(releasedDeal.timeline.at(-1)?.buyerMessage).toBe(
      "25 test USDC was paid to the seller.",
    );

    const second = await replay();
    expect(second.map((a) => a.result)).toEqual(Array(11).fill("duplicate"));
    expect(await loadDeal(held)).toEqual(heldDeal);
    expect(await loadDeal(released)).toEqual(releasedDeal);
  });
});
