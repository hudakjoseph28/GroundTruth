/**
 * Staged deal text alerts end to end: opt in through the public route, then
 * QuickNode deliveries through the real webhook, IDL decoder, and
 * applyConfirmedEvent, against PostgreSQL. Twilio is a fake sender; no text
 * leaves the process. Event logs are IDL-encoded test data (escrowLogs.ts).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { utils, web3 } from "@anchor-lang/core";
import { stagedDeal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { MAX_SMS_ATTEMPTS } from "../../src/sms/alerts.js";
import type { SmsMessage, SmsSender } from "../../src/sms/sender.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";
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
let slot = 420_000_000;

/** Records every text; `refuse` makes the next N sends fail like a Twilio 5xx. */
class FakeSender implements SmsSender {
  sent: SmsMessage[] = [];
  refuse = 0;
  async send(message: SmsMessage) {
    if (this.refuse > 0) {
      this.refuse -= 1;
      throw new Error("Twilio refused the message: HTTP 503");
    }
    this.sent.push(message);
    return { messageId: `SMfake${this.sent.length}` };
  }
}

const sender = new FakeSender();
const logs: string[] = [];
const app = createApp("db-test", {
  quicknode: { token: TOKEN },
  sms: { sender, log: (line) => logs.push(line) },
});

const newSignature = () => utils.bytes.bs58.encode(randomBytes(64));
const explorer = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

/** One signed Stream delivery holding one transaction. */
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

/** A successful transaction; returns what to pass to `deliver` to replay it. */
async function succeeded(lines: string[]) {
  const tx = {
    signature: newSignature(),
    logMessages: invocation(PROGRAM, lines),
  };
  await deliver(tx);
  return tx;
}

const subscribe = (dealId: string, phoneNumber: string) =>
  request(app)
    .post(`/api/deals/${dealId}/sms-subscriptions`)
    .send({ phoneNumber, consent: true });

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
      timeline: stagedDeal.timeline.map((e) => ({
        ...e,
        id: `${id}-created`,
        at: TEST_DEAL_CREATED_AT,
      })),
    }),
  );
}

const held = { id: `dbtest-${run}-sms-held`, keys: dealKeys() };
const cleared = { id: `dbtest-${run}-sms-cleared`, keys: dealKeys() };
const quiet = { id: `dbtest-${run}-sms-quiet`, keys: dealKeys() };

beforeEach(async () => {
  sender.sent = [];
  sender.refuse = 0;
  logs.length = 0;
  for (const deal of [held, cleared, quiet]) await seed(deal.id, deal.keys);
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({
    where: { id: { in: [held.id, cleared.id, quiet.id] } },
  });
  await prisma.$disconnect();
});

describe("deal text alerts through the QuickNode webhook", () => {
  it("held deal: texts funded, hold, and rejected release once each", async () => {
    const opted = await subscribe(held.id, "614-555-0123");
    expect(opted.status).toBe(201);
    expect(opted.body).toEqual({
      dealId: held.id,
      maskedPhoneNumber: "+1 ••• ••• 0123",
    });

    const e = events(held.keys);
    await succeeded([e.init]);
    const fund = await succeeded([e.fund]);
    const hold = await succeeded([e.hold()]);
    const rejected = {
      signature: newSignature(),
      logMessages: heldReleaseLogs(),
      err: { InstructionError: [0, { Custom: 6019 }] },
      releaseAccounts: releaseAccounts(
        held.keys,
        web3.Keypair.generate().publicKey,
      ),
    };
    await deliver(rejected);

    expect(sender.sent).toEqual([
      {
        to: "+16145550123",
        body: `GroundTruth: your 25 test USDC escrow was funded on Solana devnet. Explorer: ${explorer(fund.signature)}`,
      },
      {
        to: "+16145550123",
        body: `GroundTruth: a reviewer placed a hold on your 25 test USDC escrow. Payment to the seller is blocked. Explorer: ${explorer(hold.signature)}`,
      },
      {
        to: "+16145550123",
        body: `GroundTruth: a release of your 25 test USDC escrow was rejected on-chain. No funds moved. Explorer: ${explorer(rejected.signature)}`,
      },
    ]);

    // QuickNode redelivers the same blocks: projected once, texted once.
    await deliver(fund);
    await deliver(hold);
    await deliver({ ...rejected });
    expect(sender.sent).toHaveLength(3);

    // The refund is not an alert event.
    await succeeded([e.refund]);
    expect(sender.sent).toHaveLength(3);

    // The public deal never carries the number, masked or not.
    const deal = await request(app).get(`/api/deals/${held.id}`);
    expect(deal.status).toBe(200);
    expect(deal.body.state).toBe("refunded");
    expect(JSON.stringify(deal.body)).not.toMatch(/5550123|0123|•/);
    // Logs name the event, never the number.
    expect(logs.join("\n")).not.toContain("5550123");
  });

  it("cleared deal: texts every subscriber on release, not on approvals", async () => {
    const e = events(cleared.keys);
    await succeeded([e.init]);
    await succeeded([e.fund]);
    // Opted in after funding: no text for events that already happened.
    expect((await subscribe(cleared.id, "+1 (614) 555-0123")).status).toBe(201);
    expect((await subscribe(cleared.id, "+44 20 7946 0958")).status).toBe(201);
    // The same number again re-confirms; it does not double the texts.
    expect((await subscribe(cleared.id, "6145550123")).status).toBe(200);

    await succeeded([e.approve("Title"), e.approve("Survey")]);
    await succeeded([e.approve("Septic")]);
    expect(sender.sent).toEqual([]);

    const release = await succeeded([e.release]);
    expect(sender.sent.map((m) => m.to).sort()).toEqual([
      "+16145550123",
      "+442079460958",
    ]);
    for (const message of sender.sent) {
      expect(message.body).toBe(
        `GroundTruth: your 25 test USDC escrow was released to the seller. Explorer: ${explorer(release.signature)}`,
      );
    }

    const rows = await prisma.smsAlertRecord.findMany({
      where: { event: { dealId: cleared.id } },
    });
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.status === "sent" && row.providerMessageId),
    ).toBe(true);

    // A closed deal takes no new opt-ins.
    expect((await subscribe(cleared.id, "6145550199")).status).toBe(409);
  });

  it("a refused text is retried by a replay, then given up on", async () => {
    await subscribe(quiet.id, "6145550123");
    const e = events(quiet.keys);
    await succeeded([e.init]);

    sender.refuse = 1;
    const fund = await succeeded([e.fund]);
    // Twilio refused: the event is still projected and the webhook still 204s.
    expect(sender.sent).toHaveLength(0);
    expect((await request(app).get(`/api/deals/${quiet.id}`)).body.state).toBe(
      "funded",
    );
    expect(logs.some((line) => line.startsWith("sms failed DealFunded"))).toBe(
      true,
    );

    await deliver(fund);
    expect(sender.sent).toHaveLength(1);
    await deliver(fund);
    expect(sender.sent).toHaveLength(1);

    // A hold Twilio keeps refusing stops after MAX_SMS_ATTEMPTS deliveries.
    sender.refuse = MAX_SMS_ATTEMPTS + 5;
    const hold = await succeeded([e.hold()]);
    for (let i = 1; i < MAX_SMS_ATTEMPTS + 2; i += 1) await deliver(hold);
    const row = await prisma.smsAlertRecord.findFirst({
      where: { eventId: `${hold.signature}:0` },
    });
    expect(row).toMatchObject({ status: "failed", attempts: MAX_SMS_ATTEMPTS });
    expect(sender.sent).toHaveLength(1);
  });

  it("texts nobody on a deal with no subscribers", async () => {
    const e = events(quiet.keys);
    await succeeded([e.init]);
    await succeeded([e.fund]);
    await succeeded([e.hold()]);
    expect(sender.sent).toEqual([]);
    expect(
      await prisma.smsAlertRecord.count({
        where: { event: { dealId: quiet.id } },
      }),
    ).toBe(0);
  });
});
