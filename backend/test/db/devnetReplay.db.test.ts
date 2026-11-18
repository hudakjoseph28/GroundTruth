/**
 * replay:devnet's pipeline into PostgreSQL: filter -> payload schema -> IDL
 * decoder -> applyConfirmedEvent, run twice.
 *
 * Data, each replayed on its own:
 *   - RECORDED DEVNET RUN (test/fixtures/devnet/demo-run/*.json): the real
 *     transactions of both staged closings, saved by `replay:devnet --save`;
 *   - SIMULATED closings (demo-deals.simulated.json): LiteSVM runs of the
 *     deployed bytecode for the same PDAs, not devnet transactions.
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
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

const load = (file: string) =>
  (
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/devnet/${file}`, import.meta.url),
        "utf8",
      ),
    ) as { transactions: RpcTransaction[] }
  ).transactions;
const DATASETS: [string, RpcTransaction[], string | null][] = [
  [
    "recorded on devnet",
    [
      ...load("demo-run/staged-devnet-deal.json"),
      ...load("demo-run/staged-devnet-deal-released.json"),
    ],
    "Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz",
  ],
  ["simulated", load("demo-deals.simulated.json"), null],
];

const run = randomUUID().slice(0, 8);
const held = `dbtest-${run}-replay-held`;
const released = `dbtest-${run}-replay-released`;
const pdas = [stagedDeal.escrowAddress, stagedReleasedDeal.escrowAddress];
const app = createApp("db-test");
let detached: { id: string; escrowAddress: string | null }[] = [];

const copy = (deal: Deal, id: string): Deal => ({
  ...deal,
  id,
  timeline: deal.timeline.map((e) => ({
    ...e,
    id: `${id}-created`,
    at: TEST_DEAL_CREATED_AT,
  })),
});

const replay = (txs: RpcTransaction[]) =>
  replayTransactions(txs, {
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

/** Fresh dbtest copies of both staged deals, holding the real PDAs. */
async function resetCopies() {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [held, released] } },
  });
  await prisma.$transaction(async (tx) => {
    await seedDeal(tx, copy(stagedDeal, held));
    await seedDeal(tx, copy(stagedReleasedDeal, released));
  });
}

describe("replaying the demo closings into PostgreSQL", () => {
  it.for(DATASETS)(
    "%s: projects both deals, then changes nothing on a second replay",
    async ([, txs, rejectedSignature], ctx) => {
      // Timeline rows are unique by signature + index across all deals, so
      // real signatures already projected here (say, by replay:devnet into a
      // developer database) would read as duplicates. CI's database is fresh.
      const signatures = txs.map((tx) => tx.transaction.signatures[0]!);
      const present = await prisma.timelineEventRecord.count({
        where: { transactionSignature: { in: signatures } },
      });
      if (present > 0) {
        if (process.env.CI) {
          throw new Error(
            `${present} of these events are already in the CI database`,
          );
        }
        ctx.skip(
          `${present} of these events already exist in this database; run on a fresh one`,
        );
      }
      await resetCopies();
      const first = await replay(txs);
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
      if (rejectedSignature) {
        expect(rejected?.transactionSignature).toBe(rejectedSignature);
      }
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

      const second = await replay(txs);
      expect(second.map((a) => a.result)).toEqual(Array(11).fill("duplicate"));
      expect(await loadDeal(held)).toEqual(heldDeal);
      expect(await loadDeal(released)).toEqual(releasedDeal);
    },
  );
});
