import { randomUUID } from "node:crypto";
import { stagedDeal, type ActivityEvent, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

const app = createApp("db-test");
const run = randomUUID().slice(0, 8);
const publicId = `dbtest-${run}-activity`;
const privateId = `dbtest-${run}-activity-private`;
const tx = (n: number) => `dbact${run}${n}`.padEnd(64, "1");

const fixture = (id: string): Deal => ({
  ...stagedDeal,
  id,
  amountBaseUnits: "10000000",
  // escrowAddress is unique: the seeded staged deal already holds this PDA.
  escrowAddress: undefined,
  timeline: stagedDeal.timeline.map((event) => ({
    ...event,
    id: `${id}-created`,
    at: TEST_DEAL_CREATED_AT,
  })),
});

// Far ahead of any real devnet block time, so these rows are the newest in
// a database that also holds the staged deals and other tests' rows.
const base = Date.parse("2099-01-01T00:00:00.000Z");
const second = (n: number) => new Date(base + n * 1000);

beforeAll(async () => {
  await prisma.$transaction(async (db) => {
    await seedDeal(db, fixture(publicId));
    await seedDeal(db, fixture(privateId));
  });
  await prisma.dealRecord.update({
    where: { id: privateId },
    data: { publicDemo: false },
  });

  const confirmed = (n: number, eventIndex = 0, at = second(n)) => ({
    id: `${tx(n)}:${eventIndex}`,
    dealId: publicId,
    at,
    type: "approvalSigned",
    actorRole: "septic",
    buyerMessage: `Confirmed event ${n}.${eventIndex}.`,
    transactionSignature: tx(n),
    eventIndex,
    slot: BigInt(500_000_000 + n),
    confirmationStatus: "confirmed",
  });

  await prisma.timelineEventRecord.createMany({
    data: [
      // Ten confirmed rows, one second apart, inserted out of order.
      ...[3, 7, 1, 9, 2, 8, 4, 6, 5].map((n) => confirmed(n)),
      // Two events in one transaction at the newest second: index breaks the tie.
      confirmed(10, 0),
      { ...confirmed(10, 1), type: "released", actorRole: "escrow program" },
      // Newer than every confirmed row, but off-chain: never activity.
      {
        id: `${publicId}-evidence`,
        dealId: publicId,
        at: second(60),
        type: "evidenceReceived",
        buyerMessage: "Owner callback recorded for the reviewer.",
        confirmationStatus: "offChainEvidence",
      },
      // Confirmed and newest, but on a deal that is not a public demo.
      {
        ...confirmed(99),
        id: `${tx(99)}:0`,
        dealId: privateId,
        at: second(120),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [publicId, privateId] } },
  });
  await prisma.$disconnect();
});

describe("GET /api/activity against PostgreSQL", () => {
  it("serves the newest 8 confirmed public events, newest first", async () => {
    const res = await request(app).get("/api/activity");

    expect(res.status).toBe(200);
    const events = res.body as ActivityEvent[];
    expect(events.map((event) => event.id)).toEqual([
      `${tx(10)}:1`,
      `${tx(10)}:0`,
      `${tx(9)}:0`,
      `${tx(8)}:0`,
      `${tx(7)}:0`,
      `${tx(6)}:0`,
      `${tx(5)}:0`,
      `${tx(4)}:0`,
    ]);
    expect(events[0]).toEqual({
      id: `${tx(10)}:1`,
      dealId: publicId,
      dealAmountBaseUnits: "10000000",
      at: second(10).toISOString(),
      type: "released",
      actorRole: "escrow program",
      buyerMessage: "Confirmed event 10.1.",
      transactionSignature: tx(10),
      confirmationStatus: "confirmed",
    });
  });

  it("never includes off-chain rows or a private deal's events", async () => {
    const res = await request(app).get("/api/activity");
    const events = res.body as ActivityEvent[];

    expect(
      events.every((event) => event.confirmationStatus === "confirmed"),
    ).toBe(true);
    expect(events.every((event) => event.transactionSignature)).toBe(true);
    expect(events.map((event) => event.dealId)).not.toContain(privateId);
    const ids = events.map((event) => event.id);
    expect(ids).not.toContain(`${publicId}-evidence`);
    expect(ids).not.toContain(`${publicId}-created`);
    expect(ids).not.toContain(`${tx(99)}:0`);
  });
});
