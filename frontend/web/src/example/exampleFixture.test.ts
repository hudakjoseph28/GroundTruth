import { createHash } from "node:crypto";
import { CHECK_KINDS, MAP_LAYER_IDS, goldenParcel, stagedDemoDeals } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { EXAMPLE_PATHS } from "../content/example";
import { bottomLine } from "../data/bottomLine";
import { dealPath } from "../data/dealSource";
import { parcelPath } from "../data/parcelSource";
import { getParcelLedger } from "../data/ledger";
import {
  EXAMPLE_BOTTOM_LINE,
  EXAMPLE_DEAL,
  EXAMPLE_DOCUMENTS,
  EXAMPLE_DOCUMENT_TEXT,
  EXAMPLE_HELD_DEAL,
  EXAMPLE_KEY,
  EXAMPLE_LAYERS,
  EXAMPLE_PARCEL,
  EXAMPLE_RECEIPTS,
  EXAMPLE_REPORT,
  EXAMPLE_TIMELINE,
  EXAMPLE_WALLETS,
  exampleDealAfter,
} from "./exampleFixture";
import meta from "../../public/parcels/EX-000250/meta.json";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("the example fixture", () => {
  it("is not a real parcel or deal", () => {
    // Franklin parcel IDs read 123-456789; the example's can't be one.
    expect(EXAMPLE_PARCEL.sourceParcelId).not.toMatch(/^\d{3}-\d{6}$/);
    expect(EXAMPLE_PARCEL.key).not.toMatch(/^ohio:/);
    expect(EXAMPLE_PARCEL.key).not.toBe(goldenParcel.key);
    expect(stagedDemoDeals.map((deal) => deal.id)).not.toContain(EXAMPLE_DEAL.id);
    expect(EXAMPLE_KEY).toBe("sample");
    expect(EXAMPLE_PATHS).toEqual({ parcel: parcelPath(EXAMPLE_KEY), deal: dealPath(EXAMPLE_KEY) });
  });

  it("sits inside the baked land block, so the imagery under it is the bake's", () => {
    expect(meta.sourceParcelId).toBe(EXAMPLE_PARCEL.sourceParcelId);
    expect(EXAMPLE_LAYERS.bbox).toEqual(meta.bbox);
    for (const [lon = 0, lat = 0] of EXAMPLE_PARCEL.geometry.geojson.coordinates[0] as number[][]) {
      expect(lon).toBeGreaterThan(meta.bbox.west);
      expect(lon).toBeLessThan(meta.bbox.east);
      expect(lat).toBeGreaterThan(meta.bbox.south);
      expect(lat).toBeLessThan(meta.bbox.north);
    }
  });

  it("answers every check with a source: nothing reads as unknown", () => {
    const kinds = EXAMPLE_REPORT.checks.map((check) => check.kind);
    expect(new Set(kinds)).toEqual(new Set(CHECK_KINDS.filter((kind) => kind !== "closing")));
    for (const check of EXAMPLE_REPORT.checks) {
      expect(check.status).not.toBe("unknown");
      expect(check.sources.length).toBeGreaterThan(0);
    }
    const ledger = getParcelLedger(EXAMPLE_KEY, EXAMPLE_REPORT, EXAMPLE_DEAL);
    expect(ledger.records).toHaveLength(10);
    expect(ledger.answered).toBe(10);
    expect(ledger.records.every((record) => record.check.status !== "unknown")).toBe(true);
    expect(ledger.records.at(-1)?.check).toMatchObject({ kind: "closing", status: "signedOff" });
  });

  it("keeps each reviewer's own finding on their signed card", () => {
    const ledger = getParcelLedger(EXAMPLE_KEY, EXAMPLE_REPORT, EXAMPLE_DEAL);
    const survey = ledger.records.find((record) => record.check.kind === "survey");
    expect(survey?.check.finding).toContain("five corner pins");
    expect(survey?.signature).toBe(EXAMPLE_RECEIPTS.survey);
  });

  it("has the bottom line the demo asks for, starting from flood", () => {
    expect(EXAMPLE_REPORT.biggestOpenQuestion).toBe("flood");
    expect(`${EXAMPLE_BOTTOM_LINE.opening} ${EXAMPLE_BOTTOM_LINE.ask}`).toBe(
      "Buildable with conditions. Check first: flood zone permit.",
    );
    // The worked-out line for real reports is unchanged by the example.
    const worked = bottomLine(getParcelLedger(EXAMPLE_KEY, EXAMPLE_REPORT, EXAMPLE_DEAL));
    expect(worked?.opening).toBe("Possibly buildable.");
  });

  it("draws something for every map layer", () => {
    expect(EXAMPLE_LAYERS.layers.map((layer) => layer.id)).toEqual([...MAP_LAYER_IDS]);
    for (const layer of EXAMPLE_LAYERS.layers) {
      expect(layer.status).toBe("found");
      expect(layer.shapes.length).toBeGreaterThan(0);
      expect(layer.source).toBeDefined();
    }
    const zoning = EXAMPLE_LAYERS.layers.find((layer) => layer.id === "zoning");
    expect(zoning?.shapes.map((shape) => shape.label)).toEqual(["R", "NC"]);
    expect(EXAMPLE_LAYERS.layers.find((layer) => layer.id === "roadRightOfWay")?.distanceM).toBe(0);
  });

  it("fingerprints each document with the SHA-256 of its own text", () => {
    expect(EXAMPLE_DOCUMENTS.map((doc) => doc.type)).toEqual([
      "titleCommitment",
      "surveyPlat",
      "septicSoilEvaluation",
      "zoningLetter",
    ]);
    for (const doc of EXAMPLE_DOCUMENTS) {
      expect(doc.sha256).toBe(sha256(EXAMPLE_DOCUMENT_TEXT[doc.type as keyof typeof EXAMPLE_DOCUMENT_TEXT]));
    }
  });

  it("closes the deal in the order the demo tells it", () => {
    expect(EXAMPLE_TIMELINE.map((event) => `${event.type}:${event.actorRole}`)).toEqual([
      "dealCreated:buyer",
      "funded:buyer",
      "evidenceReceived:owner callback",
      "approvalSigned:title",
      "approvalSigned:survey",
      "approvalSigned:septic",
      "evidenceReceived:buyer",
      "released:buyer",
    ]);
    const times = EXAMPLE_TIMELINE.map((event) => Date.parse(event.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Each approval names its own document on-chain.
    expect(EXAMPLE_TIMELINE.slice(3, 6).map((event) => event.citedDocument?.document?.uploaderRole)).toEqual([
      "title",
      "survey",
      "septic",
    ]);
    // The call and the zoning letter are evidence: no transaction.
    for (const event of EXAMPLE_TIMELINE.filter((row) => row.type === "evidenceReceived")) {
      expect(event.confirmationStatus).toBe("offChainEvidence");
      expect(event.transactionSignature).toBeUndefined();
    }
    expect(EXAMPLE_DEAL).toMatchObject({ state: "released", amountBaseUnits: "25000000" });
    expect(EXAMPLE_DEAL.reviewers.every((reviewer) => reviewer.approvedAt)).toBe(true);
  });

  it("replays the deal step by step for the walkthrough", () => {
    expect(exampleDealAfter(1).state).toBe("draft");
    expect(exampleDealAfter(2).state).toBe("funded");
    expect(exampleDealAfter(4).reviewers.filter((reviewer) => reviewer.approvedAt)).toHaveLength(1);
    expect(exampleDealAfter(6).reviewers.filter((reviewer) => reviewer.approvedAt)).toHaveLength(3);
    expect(exampleDealAfter(7).state).toBe("funded");
    expect(exampleDealAfter(8)).toMatchObject({ state: "released" });
  });

  it("holds the bonus deal on the title reviewer's hold, with a rejected release", () => {
    expect(EXAMPLE_HELD_DEAL.state).toBe("held");
    expect(EXAMPLE_HELD_DEAL.hold).toMatchObject({ role: "title", reasonCode: "SELLER_IDENTITY_DISPUTED" });
    expect(EXAMPLE_HELD_DEAL.timeline.map((event) => event.type)).toEqual([
      "dealCreated",
      "funded",
      "evidenceReceived",
      "holdPlaced",
      "releaseRejected",
    ]);
    expect(EXAMPLE_HELD_DEAL.timeline.at(-1)?.buyerMessage).toContain("DealHeld (6019)");
    expect(EXAMPLE_HELD_DEAL.reviewers.some((reviewer) => reviewer.approvedAt)).toBe(false);
  });

  it("uses distinct wallets and receipts", () => {
    expect(new Set(Object.values(EXAMPLE_WALLETS)).size).toBe(Object.values(EXAMPLE_WALLETS).length);
    expect(new Set(Object.values(EXAMPLE_RECEIPTS)).size).toBe(Object.values(EXAMPLE_RECEIPTS).length);
  });
});
