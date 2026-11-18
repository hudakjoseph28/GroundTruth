import { randomUUID } from "node:crypto";
import { stagedDeal, type Deal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { recordOwnerCall } from "../../src/voice/ownerCall.js";
import {
  NOW,
  initiationFailure,
  signHeader,
  transcription,
} from "../support/elevenlabsPayloads.js";

const SECRET = "db-test-voice-secret";
const run = randomUUID().slice(0, 8);
const publicId = `dbtest-${run}-voice`;
const privateId = `dbtest-${run}-voice-private`;
const app = createApp("db-test", {
  elevenlabs: { secret: SECRET, now: () => NOW },
});

function seedFixture(id: string): Deal {
  return {
    ...stagedDeal,
    id,
    timeline: stagedDeal.timeline.map((e) => ({ ...e, id: `${id}-created` })),
  };
}

async function deliver(payload: unknown) {
  const raw = JSON.stringify(payload);
  return request(app)
    .post("/api/webhooks/elevenlabs")
    .set("content-type", "application/json")
    .set("elevenlabs-signature", signHeader(raw, SECRET))
    .send(raw);
}

async function loadDeal(id = publicId): Promise<Deal> {
  const res = await request(app).get(`/api/deals/${id}`);
  expect(res.status).toBe(200);
  return res.body as Deal;
}

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [publicId, privateId] } },
  });
  await prisma.$transaction(async (tx) => {
    await seedDeal(tx, seedFixture(publicId));
    await seedDeal(tx, seedFixture(privateId));
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

describe("ElevenLabs owner callback against PostgreSQL", () => {
  it("adds one evidence row to the deal and leaves its state alone", async () => {
    const conversationId = `conv_${run}_denies`;
    const res = await deliver(
      transcription({
        conversationId,
        dealId: publicId,
        saleAnswer: "not_selling",
      }),
    );

    expect(res.status).toBe(200);
    const deal = await loadDeal();
    expect(deal.state).toBe("draft");
    expect(deal.hold).toBeUndefined();
    expect(deal.reviewers.every((r) => !r.approvedAt)).toBe(true);
    expect(deal.timeline.at(-1)).toEqual({
      id: `owner-call:${conversationId}`,
      at: new Date(
        (transcription().data.metadata.start_time_unix_secs + 42) * 1000,
      ).toISOString(),
      type: "evidenceReceived",
      actorRole: "owner callback",
      buyerMessage: expect.stringContaining(
        "said they are not selling this lot",
      ),
      confirmationStatus: "offChainEvidence",
    });

    const stored = await prisma.ownerCallRecord.findUniqueOrThrow({
      where: { conversationId },
    });
    expect(stored).toMatchObject({
      dealId: publicId,
      participantLabel: "Satya (teammate, consented)",
      callSuccessful: "success",
      outcome: "ownerDeniesSale",
    });
    // Only the contract's fields exist on the row: no transcript or number.
    expect(Object.keys(stored).sort()).toEqual([
      "callSuccessful",
      "completedAt",
      "conversationId",
      "dealId",
      "outcome",
      "participantLabel",
      "receivedAt",
    ]);
  });

  it("ignores a replayed delivery: still one row", async () => {
    const payload = transcription({
      conversationId: `conv_${run}_replay`,
      dealId: publicId,
      saleAnswer: "not_selling",
    });

    expect((await deliver(payload)).status).toBe(200);
    expect((await deliver(payload)).status).toBe(200);

    const deal = await loadDeal();
    expect(
      deal.timeline.filter((e) => e.type === "evidenceReceived"),
    ).toHaveLength(1);
  });

  it("treats a concurrent replay as a duplicate, not an error", async () => {
    const parsed = {
      conversationId: `conv_${run}_race`,
      agentId: "agent_x",
      dealId: publicId,
      completedAt: NOW,
      participantLabel: "Satya (teammate, consented)",
      callSuccessful: "success",
      outcome: "ownerConfirmsSale" as const,
    };

    const results = await Promise.all([
      recordOwnerCall(prisma, parsed),
      recordOwnerCall(prisma, parsed),
    ]);

    expect(results.sort()).toEqual(["duplicate", "recorded"]);
  });

  it("records an unanswered call as evidence too", async () => {
    await deliver(
      initiationFailure({
        conversationId: `conv_${run}_busy`,
        dealId: publicId,
        reason: "busy",
      }),
    );

    const evidence = (await loadDeal()).timeline.at(-1);
    expect(evidence?.buyerMessage).toBe(
      "Owner callback: the owner on record could not be reached (busy). Unanswered calls go to the title reviewer.",
    );
  });

  it.each([
    ["a deal that is not a public demo", privateId],
    ["a deal that does not exist", `dbtest-${run}-nope`],
    ["a call with no deal ID", null],
  ])("acknowledges but stores nothing for %s", async (_label, dealId) => {
    const conversationId = `conv_${run}_${String(dealId)}`;
    const res = await deliver(transcription({ conversationId, dealId }));

    expect(res.status).toBe(200);
    expect(
      await prisma.ownerCallRecord.count({ where: { conversationId } }),
    ).toBe(0);
    expect((await loadDeal()).timeline).toHaveLength(1);
  });
});
