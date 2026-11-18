import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  goldenReport,
  secondCountyReport,
  stagedDeal,
  type Check,
  type CheckKind,
  type ParcelReport,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { checkTitle } from "../content/parcel";
import { Ledger } from "../parcel/Ledger/Ledger";
import {
  buildLedger,
  getParcelLedger,
  ledgerKinds,
  summarizeDeal,
} from "./ledger";

/** The cards every report listed before `environmental` existed (Nov 18, 2026). */
const BEFORE_ENVIRONMENTAL = [
  "zoning",
  "flood",
  "access",
  "utilities",
  "easements",
  "sellerAuthority",
  "survey",
  "septic",
] as const;

const wetlands: Check = {
  kind: "environmental",
  status: "needsReview",
  finding:
    "The National Wetlands Inventory maps Freshwater Forested/Shrub Wetland (PFO1A) on about 31% of this lot.",
  limitation:
    "NWI outlines are approximate: they are not a wetland delineation.",
  sources: [
    {
      authority: "U.S. Fish and Wildlife Service",
      title:
        "National Wetlands Inventory: freshwater forested/shrub wetland mapped on the parcel",
      url: "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0",
      retrievedAt: "2026-11-18T23:43:22.732Z",
    },
  ],
  responsibleParty: {
    role: "County soil and water conservation district, or a wetland consultant",
  },
  nextAction: "Have a wetland consultant delineate it.",
};

/** A check kind from a newer API, which this build has never heard of. */
const newer = {
  ...wetlands,
  kind: "radonTest" as CheckKind,
  status: "unknown",
  finding: "No radon test is on file.",
  sources: [],
} satisfies Check;

const withChecks = (
  report: ParcelReport,
  ...checks: Check[]
): ParcelReport => ({
  ...report,
  checks: [...report.checks, ...checks],
});

const kindsOf = (report: ParcelReport, deal = false) =>
  buildLedger(report, deal ? stagedDeal : null).records.map(
    (record) => record.check.kind,
  );

describe("ledger kinds", () => {
  it("lists the golden parcel exactly as before: no environmental card", () => {
    expect(kindsOf(goldenReport)).toEqual([
      "access",
      ...BEFORE_ENVIRONMENTAL.filter((kind) => kind !== "access"),
    ]);
  });

  it("lists the golden parcel with its deal exactly as before: closing, no environmental", () => {
    const kinds = kindsOf(goldenReport, true);
    expect(kinds).toEqual([
      "access",
      ...BEFORE_ENVIRONMENTAL.filter((kind) => kind !== "access"),
      "closing",
    ]);
    const ledger = getParcelLedger(
      goldenReport.parcelKey,
      goldenReport,
      stagedDeal,
    );
    expect(ledger.records.map((record) => record.check.kind)).toEqual(kinds);
  });

  it("lists the Licking parcel exactly as before", () => {
    expect(kindsOf(secondCountyReport)).toEqual([
      "access",
      ...BEFORE_ENVIRONMENTAL.filter((kind) => kind !== "access"),
    ]);
  });

  it("lists environmental after flood when a live report carries it", () => {
    expect(kindsOf(withChecks(secondCountyReport, wetlands))).toEqual([
      "access",
      "zoning",
      "flood",
      "environmental",
      "utilities",
      "easements",
      "sellerAuthority",
      "survey",
      "septic",
    ]);
  });

  it("puts environmental first when it is the biggest open question", () => {
    const report = {
      ...withChecks(secondCountyReport, wetlands),
      biggestOpenQuestion: "environmental" as const,
    };
    expect(kindsOf(report)[0]).toBe("environmental");
    expect(buildLedger(report, null).records[0]?.check).toEqual(wetlands);
  });

  it("lists a kind this build does not know last, instead of dropping it", () => {
    const report = withChecks(goldenReport, newer);
    expect(ledgerKinds(report, false).at(-1)).toBe("radonTest");
    const ledger = buildLedger(report, null);
    expect(ledger.records.at(-1)?.check).toEqual(newer);
    expect(ledger.records.at(-1)?.steps).toEqual(["current", "todo", "todo"]);
  });

  it("does not change what the deal summary says", () => {
    const before = summarizeDeal(stagedDeal);
    buildLedger(withChecks(goldenReport, wetlands, newer), stagedDeal);
    expect(summarizeDeal(stagedDeal)).toEqual(before);
  });
});

describe("checkTitle", () => {
  it("names known kinds from the content file", () => {
    expect(checkTitle("environmental")).toBe("Wetlands & streams");
    expect(checkTitle("zoning")).toBe("Can you build here?");
  });

  it("reads an unknown kind as words", () => {
    expect(checkTitle("radonTest")).toBe("Radon test");
    expect(checkTitle("soil_percolation")).toBe("Soil percolation");
    expect(checkTitle("")).toBe("Other check");
  });
});

describe("the parcel ledger renders", () => {
  const render = (report: ParcelReport) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Ledger, {
          ledger: buildLedger(report, stagedDeal),
          deals: [summarizeDeal(stagedDeal)],
          dealNotice: null,
          revealed: true,
          animated: false,
        }),
      ),
    );

  it("renders the golden parcel with no wetlands card", () => {
    const html = render(goldenReport);
    expect(html).toContain("Can you build here?");
    expect(html).not.toContain("Wetlands &amp; streams");
  });

  it("renders a wetlands card and a card for a kind it does not know", () => {
    const html = render(withChecks(goldenReport, wetlands, newer));
    expect(html).toContain("Wetlands &amp; streams");
    expect(html).toContain("Radon test");
  });
});
