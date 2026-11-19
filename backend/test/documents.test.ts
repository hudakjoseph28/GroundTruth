import { createHash } from "node:crypto";
import {
  DEAL_DOCUMENT_MAX_BYTES,
  DOCUMENT_UPLOAD_HEADERS,
} from "@groundtruth/shared";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakePdf,
  fakePng,
  signedHeaders,
  testWallet,
} from "./support/documentAuth.js";

const db = vi.hoisted(() => ({
  dealRecord: { findUnique: vi.fn() },
  dealDocumentRecord: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  documentAuthNonceRecord: { create: vi.fn() },
}));
vi.mock("../src/db.js", () => ({ prisma: db }));

const { createApp } = await import("../src/app.js");

const NOW = new Date("2026-11-19T15:00:00.000Z");
const app = createApp("test-commit", { documents: { now: () => NOW } });

const DEAL_ID = "staged-devnet-deal-rehearsal-v2";
const path = `/api/deals/${DEAL_ID}/documents`;
const buyer = testWallet();
const seller = testWallet();
const septic = testWallet();
const stranger = testWallet();

const deal = {
  id: DEAL_ID,
  publicDemo: true,
  buyerWallet: buyer.address,
  sellerWallet: seller.address,
  reviewers: [
    { wallet: testWallet().address, role: "title", position: 0 },
    { wallet: testWallet().address, role: "survey", position: 1 },
    { wallet: septic.address, role: "septic", position: 2 },
  ],
};

const pdf = fakePdf("septic");
const pdfHash = createHash("sha256").update(pdf).digest("hex");

function upload(
  bytes: Buffer,
  headers: Record<string, string>,
  filename = "Septic evaluation.pdf",
  type = "septicSoilEvaluation",
) {
  return request(app)
    .post(path)
    .set("content-type", "application/octet-stream")
    .set(DOCUMENT_UPLOAD_HEADERS.type, type)
    .set(DOCUMENT_UPLOAD_HEADERS.filename, encodeURIComponent(filename))
    .set(headers)
    .send(bytes);
}

const signUpload = (
  wallet = septic,
  sha256 = pdfHash,
  extra: Partial<Parameters<typeof signedHeaders>[0]> = {},
) =>
  signedHeaders({
    wallet,
    dealId: DEAL_ID,
    request: { action: "upload", sha256 },
    issuedAt: NOW.toISOString(),
    ...extra,
  });

beforeEach(() => {
  db.dealRecord.findUnique.mockResolvedValue(deal);
  db.dealDocumentRecord.findUnique.mockResolvedValue(null);
  db.documentAuthNonceRecord.create.mockResolvedValue({});
  db.dealDocumentRecord.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      dealId: data.dealId,
      type: data.type,
      filename: data.filename,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
      uploaderRole: data.uploaderRole,
      uploadedAt: data.uploadedAt,
    }),
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/deals/:id/documents", () => {
  it("stores a participant's PDF with the API's own hash and the signer's role", async () => {
    const res = await upload(pdf, signUpload());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      dealId: DEAL_ID,
      type: "septicSoilEvaluation",
      filename: "Septic evaluation.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf.length,
      sha256: pdfHash,
      uploaderRole: "septic",
      uploadedAt: NOW.toISOString(),
    });
    const { data } = db.dealDocumentRecord.create.mock.calls[0]![0];
    expect(data).toMatchObject({
      dealId: DEAL_ID,
      sha256: pdfHash,
      uploaderWallet: septic.address,
      uploaderRole: "septic",
    });
    expect(Buffer.from(data.file.create.content).equals(pdf)).toBe(true);
    expect(db.documentAuthNonceRecord.create).toHaveBeenCalledOnce();
  });

  it("names the buyer and seller by their roles", async () => {
    for (const [wallet, role] of [
      [buyer, "buyer"],
      [seller, "seller"],
    ] as const) {
      const res = await upload(pdf, signUpload(wallet));
      expect(res.status).toBe(201);
      expect(res.body.uploaderRole).toBe(role);
    }
  });

  it("rejects a valid signature from a wallet that is not on the deal", async () => {
    const res = await upload(pdf, signUpload(stranger));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toBe(
      "Only this deal's buyer, seller, or assigned reviewers can do this.",
    );
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature", async () => {
    const res = await upload(pdf, {});
    expect(res.status).toBe(401);
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects a signature over a different message", async () => {
    const res = await upload(
      pdf,
      signUpload(septic, pdfHash, {
        tamper: (message) =>
          message.replace(DEAL_ID, "staged-devnet-deal-live"),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(
      "The signature does not match this wallet and request. Sign it again.",
    );
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects a signature by one wallet presented as another", async () => {
    const headers = signUpload(stranger);
    headers["x-groundtruth-wallet"] = septic.address;
    const res = await upload(pdf, headers);
    expect(res.status).toBe(401);
  });

  it("rejects a signature that covers a different file", async () => {
    const otherHash = createHash("sha256").update("other").digest("hex");
    const res = await upload(pdf, signUpload(septic, otherHash));
    expect(res.status).toBe(401);
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects an expired signature", async () => {
    const res = await upload(
      pdf,
      signUpload(septic, pdfHash, {
        issuedAt: new Date(NOW.getTime() - 5 * 60 * 1000 - 1).toISOString(),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(
      "This signature has expired. Sign the request again to continue.",
    );
  });

  it("accepts a signature just inside the five-minute window", async () => {
    const res = await upload(
      pdf,
      signUpload(septic, pdfHash, {
        issuedAt: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("rejects a signature dated in the future", async () => {
    const res = await upload(
      pdf,
      signUpload(septic, pdfHash, {
        issuedAt: new Date(NOW.getTime() + 2 * 60 * 1000).toISOString(),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a replayed signed request", async () => {
    db.documentAuthNonceRecord.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const res = await upload(pdf, signUpload());
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(
      "This signed request was already used. Sign again to continue.",
    );
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes are not the type its extension claims", async () => {
    const png = fakePng();
    const pngHash = createHash("sha256").update(png).digest("hex");
    const res = await upload(
      png,
      signUpload(septic, pngHash),
      "evaluation.pdf",
    );
    expect(res.status).toBe(415);
    expect(res.body.error.message).toBe(
      "Upload a PDF, PNG, or JPG file. The file's contents must match its extension.",
    );
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects types other than PDF, PNG, and JPG, whatever the name", async () => {
    const exe = Buffer.from("MZ\x90\x00 pretend program", "latin1");
    const exeHash = createHash("sha256").update(exe).digest("hex");
    for (const name of ["evaluation.pdf", "evaluation.exe", "evaluation"]) {
      const res = await upload(exe, signUpload(septic, exeHash), name);
      expect(res.status).toBe(415);
    }
    // A real PDF with a text extension is refused too.
    const res = await upload(pdf, signUpload(), "evaluation.txt");
    expect(res.status).toBe(415);
  });

  it("accepts a PNG and a JPG whose bytes match", async () => {
    const png = fakePng();
    const pngHash = createHash("sha256").update(png).digest("hex");
    expect(
      (await upload(png, signUpload(septic, pngHash), "plat.PNG")).body
        .contentType,
    ).toBe("image/png");
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const jpgHash = createHash("sha256").update(jpg).digest("hex");
    expect(
      (await upload(jpg, signUpload(septic, jpgHash), "letter.jpeg")).body
        .contentType,
    ).toBe("image/jpeg");
  });

  it("rejects a file over 10 MB before storing anything", async () => {
    const big = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(DEAL_DOCUMENT_MAX_BYTES),
    ]);
    const res = await upload(big, signUpload(septic, "0".repeat(64)));
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe(
      "That file is larger than 10 MB. Upload a smaller copy.",
    );
    expect(db.dealRecord.findUnique).not.toHaveBeenCalled();
    expect(db.dealDocumentRecord.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown document type and an empty file", async () => {
    expect((await upload(pdf, signUpload(), "a.pdf", "deed")).status).toBe(400);
    expect((await upload(Buffer.alloc(0), signUpload())).status).toBe(400);
  });

  it("refuses the same bytes twice on one deal", async () => {
    db.dealDocumentRecord.findUnique.mockResolvedValue({
      filename: "first.pdf",
    });
    const res = await upload(pdf, signUpload());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("answers 404 for a deal that is not a public staged deal", async () => {
    db.dealRecord.findUnique.mockResolvedValue({ ...deal, publicDemo: false });
    expect((await upload(pdf, signUpload())).status).toBe(404);
  });

  it("keeps only the last path segment of the filename", async () => {
    const res = await upload(
      pdf,
      signUpload(),
      "../../etc/Septic evaluation.pdf",
    );
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe("Septic evaluation.pdf");
  });
});

describe("GET /api/deals/:id/documents", () => {
  it("returns metadata only: never the bytes or the uploader's wallet", async () => {
    db.dealDocumentRecord.findMany.mockResolvedValue([
      {
        id: "0b8f7c2e-8d1e-4a8e-9c37-3f0d3c1c2b11",
        dealId: DEAL_ID,
        type: "septicSoilEvaluation",
        filename: "Septic evaluation.pdf",
        contentType: "application/pdf",
        sizeBytes: pdf.length,
        sha256: pdfHash,
        uploaderRole: "septic",
        uploadedAt: NOW,
      },
    ]);

    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      [
        "contentType",
        "dealId",
        "filename",
        "id",
        "sha256",
        "sizeBytes",
        "type",
        "uploadedAt",
        "uploaderRole",
      ].sort(),
    );
    const { select } = db.dealDocumentRecord.findMany.mock.calls[0]![0];
    expect(select).not.toHaveProperty("file");
    expect(select).not.toHaveProperty("uploaderWallet");
    expect(JSON.stringify(res.body)).not.toContain(septic.address);
  });
});

describe("POST /api/deals/:id/documents/:documentId/file", () => {
  const documentId = "0b8f7c2e-8d1e-4a8e-9c37-3f0d3c1c2b11";
  const filePath = `${path}/${documentId}/file`;
  const signView = (
    wallet = buyer,
    id = documentId,
    issuedAt = NOW.toISOString(),
  ) =>
    signedHeaders({
      wallet,
      dealId: DEAL_ID,
      request: { action: "view", documentId: id },
      issuedAt,
    });

  beforeEach(() => {
    db.dealDocumentRecord.findFirst.mockResolvedValue({
      filename: "Septic evaluation.pdf",
      contentType: "application/pdf",
      file: { content: new Uint8Array(pdf) },
    });
  });

  it("returns the bytes to a participant with a fresh signature, uncached", async () => {
    const res = await request(app)
      .post(filePath)
      .set(signView())
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.from(res.body as Buffer).equals(pdf)).toBe(true);
  });

  it("refuses without a signature, and to a wallet not on the deal", async () => {
    expect((await request(app).post(filePath)).status).toBe(401);
    expect(
      (await request(app).post(filePath).set(signView(stranger))).status,
    ).toBe(403);
    expect(db.dealDocumentRecord.findFirst).not.toHaveBeenCalled();
  });

  it("refuses an upload signature or one for another document", async () => {
    const uploadSig = signUpload(buyer);
    expect((await request(app).post(filePath).set(uploadSig)).status).toBe(401);
    const other = signView(buyer, "7d1a3c55-1b0b-4f62-9b0e-0e3a7b9d6a01");
    expect((await request(app).post(filePath).set(other)).status).toBe(401);
  });

  it("refuses an expired signature", async () => {
    const stale = signView(
      buyer,
      documentId,
      new Date(NOW.getTime() - 6 * 60 * 1000).toISOString(),
    );
    expect((await request(app).post(filePath).set(stale)).status).toBe(401);
  });

  it("answers 404 when the document is not on this deal", async () => {
    db.dealDocumentRecord.findFirst.mockResolvedValue(null);
    expect((await request(app).post(filePath).set(signView())).status).toBe(
      404,
    );
  });
});
