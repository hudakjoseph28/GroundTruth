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

  it("shows the golden parcel's seeded SSURGO septic screening, not a placeholder", () => {
    const septic = buildLedger(goldenReport, null).records.find(
      (record) => record.check.kind === "septic",
    );
    expect(septic?.check.status).toBe("needsReview");
    expect(septic?.check.finding).toContain(
      "46.05% of the parcel as map unit Ko",
    );
    expect(septic?.check.sources[0]?.retrievedAt).toBe(
      "2026-11-19T03:48:19.000Z",
    );
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

describe("a reviewer's own signed card", () => {
  const released = stagedDeal; // any deal with a title reviewer
  const title = released.reviewers.find((reviewer) => reviewer.role === "title")!;
  const signedDeal = {
    ...released,
    state: "funded" as const,
    hold: undefined,
    reviewers: released.reviewers.map((reviewer) =>
      reviewer.role === "title"
        ? { ...reviewer, approvedAt: "2026-11-19T00:00:00.000Z", approvalTransaction: "sig-title" }
        : reviewer,
    ),
  };
  const withTitle = (check: Partial<Check>): ParcelReport => ({
    ...goldenReport,
    checks: [
      ...goldenReport.checks.filter((entry) => entry.kind !== "sellerAuthority"),
      {
        kind: "sellerAuthority",
        status: "needsReview",
        finding: "Report words.",
        limitation: "Report limit.",
        sources: [],
        responsibleParty: { role: "Title reviewer" },
        nextAction: "Next.",
        ...check,
      } as Check,
    ],
  });

  it("keeps a report's words that already record this reviewer's sign-off", () => {
    const ledger = buildLedger(withTitle({ status: "signedOff", reviewerWallet: title.wallet }), signedDeal);
    const card = ledger.records.find((record) => record.check.kind === "sellerAuthority")!;
    expect(card.check.finding).toBe("Report words.");
    expect(card.check.status).toBe("signedOff");
    expect(card.signature).toBe("sig-title");
  });

  it("replaces any other report's words with the chain's", () => {
    for (const check of [{ status: "needsReview" as const }, { status: "signedOff" as const, reviewerWallet: "someone-else" }]) {
      const ledger = buildLedger(withTitle(check), signedDeal);
      const card = ledger.records.find((record) => record.check.kind === "sellerAuthority")!;
      expect(card.check.finding).not.toBe("Report words.");
      expect(card.check.status).toBe("signedOff");
    }
  });
});
