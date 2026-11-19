/**
 * Deal documents end to end against PostgreSQL: a reviewer uploads through
 * the public route with a wallet signature, the list shows metadata only,
 * the file comes back only to a signed participant request, and an approval
 * delivered by QuickNode with a `groundtruth:doc:<sha256>` Memo links its
 * timeline row to the document. Event logs are IDL-encoded test data.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { utils, web3 } from "@anchor-lang/core";
import {
  DOCUMENT_UPLOAD_HEADERS,
  MEMO_PROGRAM_ID,
  documentMemo,
  stagedDeal,
} from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { fakePdf, signedHeaders, testWallet } from "../support/documentAuth.js";
import {
  dealKeys,
  events,
  invocation,
  PROGRAM,
} from "../support/escrowLogs.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

const TOKEN = "db-test-stream-token";
const app = createApp("db-test", { quicknode: { token: TOKEN } });
const run = randomUUID().slice(0, 8);
const DEAL_ID = `dbtest-${run}-documents`;
const BLOCK_TIME = 1_794_700_800;
let slot = 430_000_000;

const septic = testWallet();
const title = testWallet();
const stranger = testWallet();
const k = dealKeys();
k.reviewers.septic = new web3.PublicKey(septic.address);
k.reviewers.title = new web3.PublicKey(title.address);
const e = events(k);

const pdf = fakePdf(run);
const pdfHash = createHash("sha256").update(pdf).digest("hex");

/** One signed Stream delivery; `memos` is what the filter adds for Memo instructions. */
async function deliver(logMessages: string[], memos?: string[]) {
  slot += 1;
  const signature = utils.bytes.bs58.encode(randomBytes(64));
  const body = JSON.stringify({
    transactions: [
      {
        signature,
        slot,
        blockTime: BLOCK_TIME + (slot % 1000),
        logMessages,
        ...(memos ? { memos } : {}),
      },
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
  return signature;
}

/** Memo v1 writes no log lines of its own beyond invoke and success. */
const memoLogs = invocation(MEMO_PROGRAM_ID, []);

beforeAll(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: DEAL_ID } });
  await prisma.$transaction((tx) =>
    seedDeal(tx, {
      ...stagedDeal,
      id: DEAL_ID,
      buyerWallet: k.buyer.toBase58(),
      sellerWallet: k.seller.toBase58(),
      sellerTokenAccount: k.sellerTokenAccount.toBase58(),
      escrowAddress: k.deal.toBase58(),
      reviewers: (["title", "survey", "septic"] as const).map((role) => ({
        wallet: k.reviewers[role].toBase58(),
        role,
        required: true,
      })),
      timeline: stagedDeal.timeline.map((event) => ({
        ...event,
        id: `${DEAL_ID}-created`,
        at: TEST_DEAL_CREATED_AT,
      })),
    }),
  );
  await deliver(invocation(PROGRAM, [e.init]));
  await deliver(invocation(PROGRAM, [e.fund]));
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: DEAL_ID } });
  await prisma.documentAuthNonceRecord.deleteMany({
    where: {
      wallet: { in: [septic.address, title.address, stranger.address] },
    },
  });
  await prisma.$disconnect();
});

describe("deal documents against PostgreSQL", () => {
  let documentId = "";

  it("stores a septic reviewer's upload and lists only its metadata", async () => {
    const res = await request(app)
      .post(`/api/deals/${DEAL_ID}/documents`)
      .set("content-type", "application/pdf")
      .set(DOCUMENT_UPLOAD_HEADERS.type, "septicSoilEvaluation")
      .set(
        DOCUMENT_UPLOAD_HEADERS.filename,
        encodeURIComponent("Septic evaluation.pdf"),
      )
      .set(
        signedHeaders({
          wallet: septic,
          dealId: DEAL_ID,
          request: { action: "upload", sha256: pdfHash },
        }),
      )
      .send(pdf);
    expect(res.status).toBe(201);
    expect(res.body.sha256).toBe(pdfHash);
    expect(res.body.uploaderRole).toBe("septic");
    documentId = res.body.id;

    const stored = await prisma.dealDocumentFileRecord.findUnique({
      where: { documentId },
    });
    expect(Buffer.from(stored!.content).equals(pdf)).toBe(true);
    const row = await prisma.dealDocumentRecord.findUnique({
      where: { id: documentId },
    });
    expect(row?.uploaderWallet).toBe(septic.address);

    const list = await request(app).get(`/api/deals/${DEAL_ID}/documents`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([res.body]);
    expect(JSON.stringify(list.body)).not.toContain(septic.address);
    expect(JSON.stringify(list.body)).not.toContain("NOT A REAL DOCUMENT");
  });

  it("refuses a stranger and a replayed signature", async () => {
    const strangerRes = await request(app)
      .post(`/api/deals/${DEAL_ID}/documents/${documentId}/file`)
      .set(
        signedHeaders({
          wallet: stranger,
          dealId: DEAL_ID,
          request: { action: "view", documentId },
        }),
      );
    expect(strangerRes.status).toBe(403);

    const headers = signedHeaders({
      wallet: title,
      dealId: DEAL_ID,
      request: { action: "view", documentId },
    });
    const first = await request(app)
      .post(`/api/deals/${DEAL_ID}/documents/${documentId}/file`)
      .set(headers)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(first.status).toBe(200);
    expect(Buffer.from(first.body as Buffer).equals(pdf)).toBe(true);

    const replay = await request(app)
      .post(`/api/deals/${DEAL_ID}/documents/${documentId}/file`)
      .set(headers);
    expect(replay.status).toBe(401);
  });

  it("links the approval row to the document its memo names", async () => {
    const signature = await deliver(
      [
        ...invocation(PROGRAM, [
          "Program log: Instruction: SignApproval",
          e.approve("Septic"),
        ]),
        ...memoLogs,
      ],
      [documentMemo(pdfHash)],
    );

    const res = await request(app).get(`/api/deals/${DEAL_ID}/timeline`);
    const row = res.body.find(
      (event: { transactionSignature?: string }) =>
        event.transactionSignature === signature,
    );
    expect(row).toMatchObject({
      type: "approvalSigned",
      actorRole: "septic",
      buyerMessage:
        "The septic reviewer signed their approval, relying on “Septic evaluation.pdf” (hash on-chain).",
      citedDocument: {
        sha256: pdfHash,
        document: {
          id: documentId,
          type: "septicSoilEvaluation",
          filename: "Septic evaluation.pdf",
          uploaderRole: "septic",
        },
      },
    });
  });

  it("records a memo hash that matches no document without linking one", async () => {
    const unknown = createHash("sha256").update("not uploaded").digest("hex");
    const signature = await deliver(
      [...memoLogs, ...invocation(PROGRAM, [e.approve("Title")])],
      [documentMemo(unknown)],
    );
    const res = await request(app).get(`/api/deals/${DEAL_ID}`);
    const row = res.body.timeline.find(
      (event: { transactionSignature?: string }) =>
        event.transactionSignature === signature,
    );
    expect(row.citedDocument).toEqual({ sha256: unknown });
    expect(row.buyerMessage).toContain(
      "No document on this deal has that hash.",
    );
  });
});
