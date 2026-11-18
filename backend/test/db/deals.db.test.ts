import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { stagedDeal, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

const app = createApp("db-test");
const run = randomUUID().slice(0, 8);
const publicId = `dbtest-${run}-public`;
const privateId = `dbtest-${run}-private`;
const TX_A = `dbtestA${run}`.padEnd(64, "1");
const TX_B = `dbtestB${run}`.padEnd(64, "1");

const fixture = (id: string): Deal => ({
  ...stagedDeal,
  id,
  // escrowAddress is unique: the seeded staged deal already holds this PDA.
  escrowAddress: undefined,
  timeline: stagedDeal.timeline.map((event) => ({
    ...event,
    id: `${id}-created`,
    at: TEST_DEAL_CREATED_AT,
  })),
});

beforeAll(async () => {
  await prisma.$transaction(async (tx) => {
    await seedDeal(tx, fixture(publicId));
    await seedDeal(tx, fixture(privateId));
  });
  await prisma.dealRecord.update({
    where: { id: privateId },
    data: { publicDemo: false },
  });
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [publicId, privateId] } },
  });
  await prisma.$disconnect();
});

describe("deals against PostgreSQL", () => {
  it("serves a seeded deal through the real query", async () => {
    const res = await request(app).get(`/api/deals/${publicId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fixture(publicId));
  });

  it("hides a deal that is not a public demo", async () => {
    const res = await request(app).get(`/api/deals/${privateId}`);

    expect(res.status).toBe(404);
  });

  it("orders timeline rows by time, then slot and event index", async () => {
    const blockTime = new Date("2026-11-15T10:00:00.000Z");
    const confirmed = {
      dealId: publicId,
      at: blockTime,
      actorRole: "title",
      slot: 400_000_000n,
      confirmationStatus: "confirmed",
    };
    // Inserted out of order on purpose.
    await prisma.timelineEventRecord.createMany({
      data: [
        {
          ...confirmed,
          id: `${publicId}-b1`,
          type: "holdPlaced",
          buyerMessage: "Hold placed.",
          transactionSignature: TX_B,
          eventIndex: 1,
        },
        {
          id: `${publicId}-evidence`,
          dealId: publicId,
          at: new Date("2026-11-15T11:00:00.000Z"),
          type: "evidenceReceived",
          buyerMessage: "Owner callback recorded for the reviewer.",
          confirmationStatus: "offChainEvidence",
        },
        {
          ...confirmed,
          id: `${publicId}-b0`,
          type: "approvalSigned",
          buyerMessage: "Approval signed.",
          transactionSignature: TX_B,
          eventIndex: 0,
        },
        {
          ...confirmed,
          id: `${publicId}-a0`,
          slot: 399_999_999n,
          type: "funded",
          buyerMessage: "Deal funded.",
          transactionSignature: TX_A,
          eventIndex: 0,
        },
      ],
    });

    const res = await request(app).get(`/api/deals/${publicId}/timeline`);

    expect(res.status).toBe(200);
    expect(res.body.map((event: { id: string }) => event.id)).toEqual([
      `${publicId}-created`,
      `${publicId}-a0`,
      `${publicId}-b0`,
      `${publicId}-b1`,
      `${publicId}-evidence`,
    ]);
  });

  it("rejects a second row for the same signature and event index", async () => {
    const duplicate = prisma.timelineEventRecord.create({
      data: {
        id: `${publicId}-replay`,
        dealId: publicId,
        at: new Date(),
        type: "holdPlaced",
        buyerMessage: "Replayed delivery.",
        transactionSignature: TX_B,
        eventIndex: 1,
        confirmationStatus: "confirmed",
      },
    });

    await expect(duplicate).rejects.toSatisfy(
      (error) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002",
    );
  });

  it("keeps chain projections when the fixture is seeded again", async () => {
    const titleReviewer = stagedDeal.reviewers[0]!;
    await prisma.dealRecord.update({
      where: { id: publicId },
      data: { state: "funded", escrowAddress: "dbtestEscrow" },
    });
    await prisma.reviewerRecord.update({
      where: {
        dealId_wallet_role: {
          dealId: publicId,
          wallet: titleReviewer.wallet,
          role: titleReviewer.role,
        },
      },
      data: {
        approvedAt: new Date("2026-11-15T10:00:00.000Z"),
        approvalTransaction: TX_B,
      },
    });

    await prisma.$transaction((tx) => seedDeal(tx, fixture(publicId)));

    const res = await request(app).get(`/api/deals/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("funded");
    expect(res.body.escrowAddress).toBe("dbtestEscrow");
    expect(res.body.reviewers[0].approvalTransaction).toBe(TX_B);
    expect(res.body.timeline).toHaveLength(5);
  });

  it("moves the seed row to the fixture's new time and leaves confirmed rows alone", async () => {
    const confirmedBefore = await prisma.timelineEventRecord.findMany({
      where: { dealId: publicId, confirmationStatus: "confirmed" },
      orderBy: { id: "asc" },
    });
    expect(confirmedBefore.length).toBeGreaterThan(0);

    // The fixture with the time the real staged deal now carries.
    const retimed: Deal = {
      ...fixture(publicId),
      timeline: stagedDeal.timeline.map((event) => ({
        ...event,
        id: `${publicId}-created`,
      })),
    };
    await prisma.$transaction((tx) => seedDeal(tx, retimed));

    const seedRow = await prisma.timelineEventRecord.findUniqueOrThrow({
      where: { id: `${publicId}-created` },
    });
    expect(seedRow.at.toISOString()).toBe(stagedDeal.timeline[0].at);
    expect(seedRow.confirmationStatus).toBe("offChainEvidence");
    expect(seedRow.transactionSignature).toBeNull();
    const confirmedAfter = await prisma.timelineEventRecord.findMany({
      where: { dealId: publicId, confirmationStatus: "confirmed" },
      orderBy: { id: "asc" },
    });
    expect(confirmedAfter).toEqual(confirmedBefore);
  });
});
