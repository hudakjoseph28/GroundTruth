import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DealDocument, DocumentFindings, DocumentParcelCheckStatus } from "@groundtruth/shared";
import { DealDocuments } from "./DealDocuments";
import { ParcelCheckNote, mismatchedDocuments } from "./ParcelCheckNote";

const doc = (status?: DocumentParcelCheckStatus, id = "doc-1"): DealDocument => ({
  id,
  dealId: "staged-devnet-deal-rehearsal-v3",
  type: "surveyPlat",
  filename: "Survey plat.pdf",
  contentType: "application/pdf",
  sizeBytes: 936,
  sha256: "8".repeat(64),
  uploaderRole: "survey",
  uploadedAt: "2026-11-20T15:00:00.000Z",
  ...(status ? { parcelCheck: { status } } : {}),
});

const differentFindings: DocumentFindings = {
  documentId: "doc-1",
  parcelCheck: { status: "different", checkedAt: "2026-11-20T15:00:05.000Z" },
  dealParcelId: "230-000918",
  found: {
    parcelId: "230-004411",
    address: "12 Sample Lane, Galloway, OH 43119",
    documentType: "Boundary Survey Plat",
    keyFinding: "Survey shows a 14 ft encroachment of a shed onto the north line.",
  },
  model: "claude-opus-5-5",
};

describe("ParcelCheckNote", () => {
  it("says a matching document matches this parcel", () => {
    const html = renderToStaticMarkup(<ParcelCheckNote doc={doc("matches")} />);
    expect(html).toContain("Matches this parcel");
    expect(html).toContain('data-tone="match"');
    expect(html).toContain("Advisory only");
  });

  it("warns publicly on a different parcel without naming it", () => {
    const html = renderToStaticMarkup(<ParcelCheckNote doc={doc("different")} />);
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Different parcel ID found");
    expect(html).toContain("Someone on the deal can sign to see which one.");
    expect(html).not.toContain("230-004411");
  });

  it("names the different parcel ID and what the document says for a signed participant", () => {
    const html = renderToStaticMarkup(
      <ParcelCheckNote doc={doc("different")} findings={differentFindings} />,
    );
    expect(html).toContain("Different parcel ID found: 230-004411");
    expect(html).toContain("This deal is for parcel 230-000918.");
    expect(html).toContain("12 Sample Lane, Galloway, OH 43119");
    expect(html).toContain("Boundary Survey Plat");
    expect(html).toContain("encroachment");
    expect(html).toContain("Read by AI (claude-opus-5-5)");
  });

  it.each([
    ["checking", "Checking the parcel ID…"],
    ["noParcelId", "No parcel ID found in this document"],
    ["unavailable", "Parcel ID not checked"],
    [undefined, "Parcel ID not checked"],
  ] as const)("shows %s as a quiet note, never a warning", (status, words) => {
    const html = renderToStaticMarkup(<ParcelCheckNote doc={doc(status)} />);
    expect(html).toContain(words);
    expect(html).toContain('data-tone="quiet"');
    expect(html).not.toContain('role="alert"');
  });
});

describe("DealDocuments", () => {
  it("puts the parcel check on each public document card", () => {
    const html = renderToStaticMarkup(
      <DealDocuments
        state={{ status: "ready", documents: [doc("matches", "a"), doc("different", "b")] }}
        timeline={[]}
      />,
    );
    expect(html).toContain("Matches this parcel");
    expect(html).toContain("Different parcel ID found");
  });
});

describe("mismatchedDocuments", () => {
  it("lists documents whose check found a different parcel, preferring a participant's findings", () => {
    const docs = [doc("matches", "a"), doc("different", "b"), doc("checking", "doc-1")];
    expect(mismatchedDocuments(docs).map((d) => d.id)).toEqual(["b"]);
    const byId = new Map([["doc-1", differentFindings]]);
    expect(mismatchedDocuments(docs, byId).map((d) => d.id)).toEqual(["b", "doc-1"]);
  });
});
