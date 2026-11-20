import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHECK_STALE_MS,
  cleanFacts,
  compareParcelId,
  dealParcelId,
  normalizeParcelId,
  toDocumentFindings,
  toParcelCheck,
} from "../src/documents/parcelCheck.js";
import { SAMPLE_DOCUMENTS, samplePdf } from "./support/samplePdf.js";

const UPLOADED = new Date("2026-11-20T15:00:00.000Z");
const LATER = new Date(UPLOADED.getTime() + 30_000);

describe("compareParcelId", () => {
  it("ignores separators and case", () => {
    expect(normalizeParcelId(" 230-000918 ")).toBe("230000918");
    expect(compareParcelId("230-000918", "230 000918")).toBe("matches");
    expect(compareParcelId("230-000918", "230.000918")).toBe("matches");
    expect(compareParcelId("00500729609000", "005-007296-09.000")).toBe(
      "matches",
    );
    expect(compareParcelId("ab-12", "AB12")).toBe("matches");
  });

  it("matches Franklin's printed -00 suffix on the same parcel", () => {
    expect(compareParcelId("230-000918", "230-000918-00")).toBe("matches");
  });

  it("calls any other ID different, including a near neighbor", () => {
    expect(compareParcelId("230-000918", "230-004411")).toBe("different");
    expect(compareParcelId("230-000918", "230-000917")).toBe("different");
    expect(compareParcelId("230-000918", "230-000918-01")).toBe("different");
    expect(compareParcelId("230-000918", "30-000918")).toBe("different");
  });

  it("reports no parcel ID when none was found", () => {
    expect(compareParcelId("230-000918", null)).toBe("noParcelId");
    expect(compareParcelId("230-000918", " - ")).toBe("noParcelId");
  });

  it("takes the deal's parcel ID from its parcel key", () => {
    expect(dealParcelId("ohio:39049:230-000918")).toBe("230-000918");
  });
});

describe("toParcelCheck (public status)", () => {
  const done = (parcelMatch: string) => ({
    status: "done",
    parcelMatch,
    checkedAt: LATER,
  });

  it("shows the match status and when it was read", () => {
    expect(toParcelCheck(done("matches"), UPLOADED, LATER)).toEqual({
      status: "matches",
      checkedAt: LATER.toISOString(),
    });
    expect(toParcelCheck(done("different"), UPLOADED, LATER).status).toBe(
      "different",
    );
    expect(toParcelCheck(done("noParcelId"), UPLOADED, LATER).status).toBe(
      "noParcelId",
    );
  });

  it("is checking while pending, and unavailable once a pending check is stale", () => {
    const pending = { status: "pending", parcelMatch: null, checkedAt: null };
    expect(toParcelCheck(pending, UPLOADED, LATER).status).toBe("checking");
    const stale = new Date(UPLOADED.getTime() + CHECK_STALE_MS + 1);
    expect(toParcelCheck(pending, UPLOADED, stale).status).toBe("unavailable");
  });

  it("never turns a failed, switched-off, missing, or unknown check into a finding", () => {
    for (const check of [
      null,
      undefined,
      { status: "failed", parcelMatch: null, checkedAt: LATER },
      { status: "off", parcelMatch: null, checkedAt: null },
      { status: "done", parcelMatch: "maybe", checkedAt: LATER },
    ]) {
      expect(toParcelCheck(check, UPLOADED, LATER)).toEqual({
        status: "unavailable",
      });
    }
  });
});

describe("toDocumentFindings (participants only)", () => {
  const stored = {
    status: "done",
    parcelMatch: "different",
    parcelId: "230-004411",
    address: "12 Sample Lane, Galloway, OH 43119",
    documentType: "Boundary Survey Plat",
    keyFinding:
      "Survey shows a 14 ft encroachment of a shed onto the north line.",
    model: "claude-opus-5-5",
    checkedAt: LATER,
  };

  it("carries what was read, the deal's parcel ID, and the model", () => {
    expect(
      toDocumentFindings(
        { id: "doc-1", uploadedAt: UPLOADED, check: stored },
        "ohio:39049:230-000918",
        LATER,
      ),
    ).toEqual({
      documentId: "doc-1",
      parcelCheck: { status: "different", checkedAt: LATER.toISOString() },
      dealParcelId: "230-000918",
      found: {
        parcelId: "230-004411",
        address: "12 Sample Lane, Galloway, OH 43119",
        documentType: "Boundary Survey Plat",
        keyFinding:
          "Survey shows a 14 ft encroachment of a shed onto the north line.",
      },
      model: "claude-opus-5-5",
    });
  });

  it("has no findings for a document that was not read", () => {
    const failed = { ...stored, status: "failed", parcelMatch: null };
    const findings = toDocumentFindings(
      { id: "doc-2", uploadedAt: UPLOADED, check: failed },
      "ohio:39049:230-000918",
      LATER,
    );
    expect(findings.parcelCheck.status).toBe("unavailable");
    expect(findings).not.toHaveProperty("found");
  });
});

describe("cleanFacts", () => {
  it("trims, collapses whitespace, bounds length, and blanks to null", () => {
    const facts = cleanFacts({
      parcelId: "  230-000918\n",
      address: "   ",
      documentType: "",
      keyFinding: "x".repeat(500),
    });
    expect(facts.parcelId).toBe("230-000918");
    expect(facts.address).toBeNull();
    expect(facts.documentType).toBe("Unknown document");
    expect(facts.keyFinding).toHaveLength(240);
    expect(facts.keyFinding.endsWith("…")).toBe(true);
  });
});

describe("sample documents", () => {
  it("are committed exactly as scripts/make-sample-documents.ts writes them", () => {
    for (const sample of Object.values(SAMPLE_DOCUMENTS)) {
      const committed = readFileSync(
        new URL(`./fixtures/documents/${sample.file}`, import.meta.url),
      );
      expect(committed.equals(samplePdf(sample.lines))).toBe(true);
      expect(committed.subarray(0, 5).toString()).toBe("%PDF-");
      expect(committed.toString("latin1")).toContain("NOT A REAL DOCUMENT");
    }
  });
});
