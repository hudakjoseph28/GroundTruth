/**
 * Document parcel checks against PostgreSQL: the sample PDFs are uploaded
 * through the public route, read (by the test fixture reader, standing in
 * for Claude), and compared with the deal's parcel 230-000918. The public
 * list carries only the match status; the findings route gives a signed
 * participant the text. The deal's state and reviewers do not change.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DOCUMENT_UPLOAD_HEADERS, stagedDeal } from "@groundtruth/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db.js";
import { seedDeal } from "../../src/deals/seedDeal.js";
import { signedHeaders, testWallet } from "../support/documentAuth.js";
import { dealKeys } from "../support/escrowLogs.js";
import { fixtureReader } from "../support/fixtureReader.js";
import { SAMPLE_DOCUMENTS } from "../support/samplePdf.js";
import { TEST_DEAL_CREATED_AT } from "../support/testDeal.js";

const pending: Promise<void>[] = [];
const app = createApp("db-test", {
  documents: {
    reader: fixtureReader(),
    schedule: (task) => pending.push(task()),
    log: () => {},
  },
});
const run = randomUUID().slice(0, 8);
const DEAL_ID = `dbtest-${run}-doc-checks`;
const buyer = testWallet();
const survey = testWallet();

const fixture = (file: string) =>
  readFileSync(new URL(`../fixtures/documents/${file}`, import.meta.url));

async function upload(file: string, type: string) {
  const bytes = fixture(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const res = await request(app)
    .post(`/api/deals/${DEAL_ID}/documents`)
    .set("content-type", "application/pdf")
    .set(DOCUMENT_UPLOAD_HEADERS.type, type)
    .set(DOCUMENT_UPLOAD_HEADERS.filename, encodeURIComponent(`${type}.pdf`))
    .set(
      signedHeaders({
        wallet: survey,
        dealId: DEAL_ID,
        request: { action: "upload", sha256 },
      }),
    )
    .send(bytes);
  expect(res.status).toBe(201);
  expect(res.body.parcelCheck).toEqual({ status: "checking" });
  return res.body.id as string;
}

beforeAll(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: DEAL_ID } });
  await prisma.$transaction((tx) =>
    seedDeal(tx, {
      ...stagedDeal,
      id: DEAL_ID,
      // A fresh PDA: escrowAddress is unique across deals.
      escrowAddress: dealKeys().deal.toBase58(),
      buyerWallet: buyer.address,
      reviewers: stagedDeal.reviewers.map((reviewer) =>
        reviewer.role === "survey"
          ? { ...reviewer, wallet: survey.address }
          : reviewer,
      ),
      timeline: stagedDeal.timeline.map((event) => ({
        ...event,
        id: `${DEAL_ID}-created`,
        at: TEST_DEAL_CREATED_AT,
      })),
    }),
  );
});

afterAll(async () => {
  await prisma.dealRecord.deleteMany({ where: { id: DEAL_ID } });
  await prisma.documentAuthNonceRecord.deleteMany({
    where: { wallet: { in: [buyer.address, survey.address] } },
  });
  await prisma.$disconnect();
});

describe("document parcel checks against PostgreSQL", () => {
  it("marks the matching sample, warns on the mismatched one, and changes no deal state", async () => {
    expect(stagedDeal.parcelKey).toBe("ohio:39049:230-000918");
    const before = await request(app).get(`/api/deals/${DEAL_ID}`);

    const matching = await upload(
      SAMPLE_DOCUMENTS.matching.file,
      "septicSoilEvaluation",
    );
    const mismatched = await upload(
      SAMPLE_DOCUMENTS.mismatched.file,
      "surveyPlat",
    );
    await Promise.all(pending);

    const list = await request(app).get(`/api/deals/${DEAL_ID}/documents`);
    const status = (id: string) =>
      list.body.find((doc: { id: string }) => doc.id === id).parcelCheck.status;
    expect(status(matching)).toBe("matches");
    expect(status(mismatched)).toBe("different");
    expect(JSON.stringify(list.body)).not.toContain("230-004411");

    const findings = await request(app)
      .post(`/api/deals/${DEAL_ID}/documents/findings`)
      .set(
        signedHeaders({
          wallet: buyer,
          dealId: DEAL_ID,
          request: { action: "findings" },
        }),
      );
    expect(findings.status).toBe(200);
    const different = findings.body.find(
      (row: { documentId: string }) => row.documentId === mismatched,
    );
    expect(different).toMatchObject({
      parcelCheck: { status: "different" },
      dealParcelId: "230-000918",
      found: { parcelId: "230-004411", documentType: "Boundary Survey Plat" },
    });

    const after = await request(app).get(`/api/deals/${DEAL_ID}`);
    expect(after.body.state).toBe(before.body.state);
    expect(after.body.reviewers).toEqual(before.body.reviewers);
    expect(after.body.hold).toEqual(before.body.hold);
    expect(after.body.timeline).toEqual(before.body.timeline);
  });
});
