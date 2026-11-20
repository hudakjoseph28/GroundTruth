import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DOCUMENT_UPLOAD_HEADERS } from "@groundtruth/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentReadError } from "../src/documents/parcelCheck.js";
import { signedHeaders, testWallet } from "./support/documentAuth.js";
import { fixtureReader } from "./support/fixtureReader.js";
import { SAMPLE_DOCUMENTS } from "./support/samplePdf.js";

// An in-memory stand-in for the three tables a check touches. Any other
// Prisma call (a deal update, a hold) would be undefined and throw.
const db = vi.hoisted(() => ({
  dealRecord: { findUnique: vi.fn() },
  dealDocumentRecord: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  dealDocumentCheckRecord: { update: vi.fn() },
  documentAuthNonceRecord: { create: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: db }));

const { createApp } = await import("../src/app.js");

const NOW = new Date("2026-11-20T15:00:00.000Z");
const DEAL_ID = "staged-devnet-deal-rehearsal-v3";
const path = `/api/deals/${DEAL_ID}/documents`;
const buyer = testWallet();
const seller = testWallet();
const survey = testWallet();
const stranger = testWallet();

const deal = {
  id: DEAL_ID,
  parcelKey: "ohio:39049:230-000918",
  publicDemo: true,
  buyerWallet: buyer.address,
  sellerWallet: seller.address,
  reviewers: [
    { wallet: testWallet().address, role: "title", position: 0 },
    { wallet: survey.address, role: "survey", position: 1 },
    { wallet: testWallet().address, role: "septic", position: 2 },
  ],
};

const fixture = (file: string) =>
  readFileSync(new URL(`./fixtures/documents/${file}`, import.meta.url));

type Row = Record<string, unknown>;
/** A Prisma `select`: `true` for a column, `{ select }` for a relation. */
type Select = { [key: string]: true | { select: Select } };

/** Stored rows by document ID, as the mocked Prisma calls see them. */
let rows: Map<string, Row>;
let pending: (() => Promise<void>)[];

function appWith(reader = fixtureReader()) {
  return {
    reader,
    app: createApp("test-commit", {
      documents: {
        now: () => NOW,
        reader,
        schedule: (task) => pending.push(task),
        log: () => {},
      },
    }),
  };
}

async function runChecks() {
  const tasks = pending;
  pending = [];
  await Promise.all(tasks.map((task) => task()));
}

function upload(
  app: ReturnType<typeof createApp>,
  file: string,
  wallet = survey,
  type = "surveyPlat",
  filename = file,
) {
  const bytes = fixture(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return request(app)
    .post(path)
    .set("content-type", "application/octet-stream")
    .set(DOCUMENT_UPLOAD_HEADERS.type, type)
    .set(DOCUMENT_UPLOAD_HEADERS.filename, encodeURIComponent(filename))
    .set(
      signedHeaders({
        wallet,
        dealId: DEAL_ID,
        request: { action: "upload", sha256 },
        issuedAt: NOW.toISOString(),
      }),
    )
    .send(bytes);
}

const signFindings = (wallet = buyer) =>
  signedHeaders({
    wallet,
    dealId: DEAL_ID,
    request: { action: "findings" },
    issuedAt: NOW.toISOString(),
  });

beforeEach(() => {
  rows = new Map();
  pending = [];
  db.dealRecord.findUnique.mockResolvedValue(deal);
  db.dealDocumentRecord.findUnique.mockResolvedValue(null);
  db.documentAuthNonceRecord.create.mockResolvedValue({});
  db.dealDocumentRecord.create.mockImplementation(
    async ({
      data,
    }: {
      data: Row & { id: string; check: { create: Row } };
    }) => {
      const meta: Row = { ...data };
      delete meta.file;
      const row = { ...meta, check: { ...emptyCheck(), ...data.check.create } };
      rows.set(data.id, row);
      return row;
    },
  );
  db.dealDocumentCheckRecord.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { documentId: string };
      data: object;
    }) => {
      const row = rows.get(where.documentId)!;
      row.check = { ...(row.check as object), ...data };
      return row.check;
    },
  );
  // Both the public list and the findings route read the same rows; each
  // route's `select` decides what leaves the API.
  db.dealDocumentRecord.findMany.mockImplementation(
    async ({ select }: { select: Select }) =>
      [...rows.values()].map((row) => pick(row, select)),
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

function emptyCheck() {
  return {
    status: "pending",
    parcelMatch: null,
    parcelId: null,
    address: null,
    documentType: null,
    keyFinding: null,
    model: null,
    failure: null,
    checkedAt: null,
  };
}

/** Applies a Prisma `select` to a stored row, as Prisma would. */
function pick(row: Row, select: Select): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) out[key] = row[key];
    else out[key] = row[key] ? pick(row[key] as Row, value.select) : null;
  }
  return out;
}

describe("document parcel checks", () => {
  it("answers the upload at once, then reads the matching sample: Matches this parcel", async () => {
    const { app } = appWith();
    const res = await upload(app, SAMPLE_DOCUMENTS.matching.file, testWallet());
    // A wallet not on the deal is refused before anything is read.
    expect(res.status).toBe(403);
    expect(pending).toHaveLength(0);

    const ok = await upload(app, SAMPLE_DOCUMENTS.matching.file, survey);
    expect(ok.status).toBe(201);
    expect(ok.body.parcelCheck).toEqual({ status: "checking" });
    expect(pending).toHaveLength(1);

    await runChecks();
    const list = await request(app).get(path);
    expect(list.body[0].parcelCheck).toEqual({
      status: "matches",
      checkedAt: NOW.toISOString(),
    });
  });

  it("flags the mismatched sample as a different parcel, publicly by status only", async () => {
    const { app } = appWith();
    // A neutral filename: the sample's own name spells out its parcel ID.
    await upload(
      app,
      SAMPLE_DOCUMENTS.mismatched.file,
      survey,
      "surveyPlat",
      "Survey plat.pdf",
    );
    await runChecks();

    const list = await request(app).get(path);
    expect(list.status).toBe(200);
    expect(list.body[0].parcelCheck.status).toBe("different");
    // The public list never carries what the document says.
    const text = JSON.stringify(list.body);
    expect(text).not.toContain("230-004411");
    expect(text).not.toContain("Sample Lane");
    expect(text).not.toContain("encroachment");
    const { select } = db.dealDocumentRecord.findMany.mock.calls[0]![0];
    expect(select.check.select).toEqual({
      status: true,
      parcelMatch: true,
      checkedAt: true,
    });
  });

  it("shows a signed participant the different parcel ID and what the document says", async () => {
    const { app } = appWith();
    await upload(app, SAMPLE_DOCUMENTS.mismatched.file);
    await upload(
      app,
      SAMPLE_DOCUMENTS.matching.file,
      survey,
      "septicSoilEvaluation",
    );
    await upload(app, SAMPLE_DOCUMENTS.noParcelId.file, seller, "zoningLetter");
    await runChecks();

    const res = await request(app)
      .post(`${path}/findings`)
      .set(signFindings(buyer));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body).toHaveLength(3);
    const [mismatched, matching, noParcel] = res.body;
    expect(mismatched).toMatchObject({
      parcelCheck: { status: "different" },
      dealParcelId: "230-000918",
      found: {
        parcelId: "230-004411",
        address: "12 Sample Lane, Galloway, OH 43119",
        documentType: "Boundary Survey Plat",
        keyFinding:
          "Survey shows a 14 ft encroachment of a shed onto the north line.",
      },
      model: "test-fixture-reader",
    });
    expect(matching).toMatchObject({
      parcelCheck: { status: "matches" },
      found: { parcelId: "230-000918-00" },
    });
    expect(noParcel).toMatchObject({
      parcelCheck: { status: "noParcelId" },
      found: { parcelId: null, address: null },
    });
  });

  it("refuses findings without a signature, to a stranger, and on another request's signature", async () => {
    const { app } = appWith();
    expect((await request(app).post(`${path}/findings`)).status).toBe(401);
    expect(
      (await request(app).post(`${path}/findings`).set(signFindings(stranger)))
        .status,
    ).toBe(403);
    const viewSig = signedHeaders({
      wallet: buyer,
      dealId: DEAL_ID,
      request: {
        action: "view",
        documentId: "0b8f7c2e-8d1e-4a8e-9c37-3f0d3c1c2b11",
      },
      issuedAt: NOW.toISOString(),
    });
    expect(
      (await request(app).post(`${path}/findings`).set(viewSig)).status,
    ).toBe(401);
    expect(db.dealDocumentRecord.findMany).not.toHaveBeenCalled();
  });

  it("records a failed read as unavailable, never as a finding, and keeps the upload", async () => {
    const reader = fixtureReader();
    reader.read = async () => {
      throw new DocumentReadError("TIMEOUT");
    };
    const { app } = appWith(reader);
    const res = await upload(app, SAMPLE_DOCUMENTS.mismatched.file);
    expect(res.status).toBe(201);
    await runChecks();

    const stored = [...rows.values()][0]!.check as Record<string, unknown>;
    expect(stored).toMatchObject({ status: "failed", failure: "TIMEOUT" });
    const list = await request(app).get(path);
    expect(list.body[0].parcelCheck).toEqual({ status: "unavailable" });
    const findings = await request(app)
      .post(`${path}/findings`)
      .set(signFindings(seller));
    expect(findings.body[0]).not.toHaveProperty("found");
  });

  it("writes only the document's own check row: no deal, hold, or approval change", async () => {
    const { app } = appWith();
    await upload(app, SAMPLE_DOCUMENTS.mismatched.file);
    await runChecks();
    expect(db.dealDocumentCheckRecord.update).toHaveBeenCalledOnce();
    // The mocked client has no dealRecord.update, holdRecord, or reviewer
    // writes; any such call would have thrown and failed the check.
    expect([...rows.values()][0]!.check).toMatchObject({ status: "done" });
  });
});
