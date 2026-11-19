import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEAL_DOCUMENT_MAX_BYTES,
  type DealDocument,
  type TimelineEvent,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { DOCUMENTS } from "../content/documents";
import { viewTimeline } from "../data/dealView";
import { DealDocuments } from "./DealDocuments";
import { checkUpload, matchHash, sha256Hex, shortHash } from "./fileCheck";

const pdf = new TextEncoder().encode("%PDF-1.4\n% STAGED DEMO: NOT A REAL DOCUMENT\n%%EOF\n");
const pdfHash = createHash("sha256").update(pdf).digest("hex");

const doc: DealDocument = {
  id: "0b8f7c2e-8d1e-4a8e-9c37-3f0d3c1c2b11",
  dealId: "staged-devnet-deal-rehearsal-v2",
  type: "septicSoilEvaluation",
  filename: "Septic evaluation.pdf",
  contentType: "application/pdf",
  sizeBytes: pdf.length,
  sha256: pdfHash,
  uploaderRole: "septic",
  uploadedAt: "2026-11-19T15:00:00.000Z",
};

const approval: TimelineEvent = {
  id: "sig:0",
  at: "2026-11-19T15:05:00.000Z",
  type: "approvalSigned",
  actorRole: "septic",
  buyerMessage:
    "The septic reviewer signed their approval, relying on “Septic evaluation.pdf” (hash on-chain).",
  transactionSignature: "5".repeat(88),
  confirmationStatus: "confirmed",
  citedDocument: {
    sha256: pdfHash,
    document: { id: doc.id, type: doc.type, filename: doc.filename, uploaderRole: "septic" },
  },
};

describe("checking a file in the browser", () => {
  it("hashes exactly like the API (SHA-256, lowercase hex)", async () => {
    expect(await sha256Hex(pdf)).toBe(pdfHash);
    expect(await sha256Hex(new Blob([pdf]))).toBe(pdfHash);
  });

  it("matches the deal document and the approval that cited it", async () => {
    const result = matchHash(await sha256Hex(pdf), [doc], [approval]);
    expect(result.document?.id).toBe(doc.id);
    expect(result.citedBy.map((e) => e.id)).toEqual(["sig:0"]);
  });

  it("says no match for a file that differs by one byte", async () => {
    const changed = pdf.slice();
    changed[changed.length - 2] ^= 1;
    const result = matchHash(await sha256Hex(changed), [doc], [approval]);
    expect(result.sha256).not.toBe(pdfHash);
    expect(result.document).toBeUndefined();
    expect(result.citedBy).toEqual([]);
  });
});

describe("checkUpload", () => {
  it("accepts a PDF named .pdf", () => {
    expect(checkUpload("Septic evaluation.pdf", pdf)).toEqual({
      ok: true,
      contentType: "application/pdf",
    });
  });

  it("refuses bytes that are not what the extension says", () => {
    expect(checkUpload("evaluation.png", pdf)).toEqual({ ok: false, reason: "wrongType" });
    expect(checkUpload("evaluation.pdf", new TextEncoder().encode("hello"))).toEqual({
      ok: false,
      reason: "wrongType",
    });
  });

  it("refuses an empty file and one over 10 MB", () => {
    expect(checkUpload("a.pdf", new Uint8Array())).toEqual({ ok: false, reason: "noFile" });
    const big = new Uint8Array(DEAL_DOCUMENT_MAX_BYTES + 1);
    big.set(pdf);
    expect(checkUpload("a.pdf", big)).toEqual({ ok: false, reason: "tooBig" });
  });
});

describe("the public documents section", () => {
  const html = renderToStaticMarkup(
    createElement(DealDocuments, {
      state: { status: "ready", documents: [doc] },
      timeline: [approval],
    }),
  ).replaceAll("&#x27;", "'");

  it("shows the banner and metadata only: type, filename, role, time, short hash", () => {
    expect(html).toContain(DOCUMENTS.banner);
    expect(html).toContain("Septic / soil evaluation");
    expect(html).toContain("Septic evaluation.pdf");
    expect(html).toContain("Uploaded by septic reviewer");
    expect(html).toContain(shortHash(pdfHash));
    expect(html).toContain('dateTime="2026-11-19T15:00:00.000Z"');
    expect(html).toContain(DOCUMENTS.cited("Septic reviewer"));
    // No way to open the file without a connected participant wallet.
    expect(html).not.toContain(DOCUMENTS.view.button);
    expect(html).toContain(DOCUMENTS.check.title);
  });

  it("links the approval row on the timeline to the document", () => {
    const [row] = viewTimeline([approval]);
    expect(row?.citation).toEqual({
      sha256: pdfHash,
      documentId: doc.id,
      filename: "Septic evaluation.pdf",
    });
  });
});
