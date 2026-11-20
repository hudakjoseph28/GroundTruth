import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  goldenReport,
  NO_PUBLIC_SEWER,
  secondCountyReport,
  stagedDeal,
  stagedReleasedDeal,
  type Check,
  type CheckKind,
  type Deal,
  type ParcelReport,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { ReportSummary } from "../parcel/Ledger/ReportSummary";
import { bottomLine, septicRating } from "./bottomLine";
import { buildLedger, type ParcelLedger } from "./ledger";

const line = (report: ParcelReport | null, deal: Parameters<typeof buildLedger>[1] = null) =>
  bottomLine(buildLedger(report, deal));

/** The report with one check's status replaced. */
const withStatus = (
  report: ParcelReport,
  kind: CheckKind,
  status: ParcelReport["checks"][number]["status"],
): ParcelReport => ({
  ...report,
  checks: report.checks.map((check) => (check.kind === kind ? { ...check, status } : check)),
});

/** The staged deal, with the title reviewer's hold confirmed on-chain. */
const heldDeal: Deal = {
  ...stagedDeal,
  state: "held",
  hold: {
    placedByWallet: stagedDeal.reviewers[0].wallet,
    role: "title",
    reasonCode: "SELLER_IDENTITY_DISPUTED",
    buyerMessage: "The seller's identity is disputed.",
    transactionSignature: "5QovTestSignatureForAHeldDealJ2ib",
    placedAt: "2026-11-18T18:00:00.000Z",
  },
};

/** The report with one more check, settled by the report itself. */
const plus = (report: ParcelReport, kind: CheckKind, status: Check["status"]): ParcelReport => ({
  ...report,
  checks: [
    ...report.checks.filter((check) => check.kind !== kind),
    { ...report.checks[0], kind, status },
  ],
});

// Words the bottom line must never use: it is not a verdict.
const FORBIDDEN = /\b(safe|you can build|can be built|cleared to build|approved to build|guarantee)/i;

describe("the bottom line", () => {
  it("leads with the biggest open question and who can answer it", () => {
    const result = line(goldenReport);
    expect(goldenReport.biggestOpenQuestion).toBe("access");
    expect(result?.first?.check.kind).toBe("access");
    expect(result?.ask).toMatch(/^Check first: road access \(title reviewer/);
  });

  it("says possibly buildable once zoning has evidence, and nothing stronger", () => {
    const zoning = goldenReport.checks.find((check) => check.kind === "zoning");
    expect(zoning?.status).not.toBe("unknown");
    const result = line(goldenReport);
    expect(result?.lead).toBe("possibly");
    expect(result?.opening).toBe("Possibly buildable.");
  });

  it("says too early to tell while zoning has no answer, whatever else is answered", () => {
    const result = line(withStatus(goldenReport, "zoning", "unknown"));
    expect(result?.lead).toBe("tooEarly");
    expect(result?.opening).toBe("Too early to tell.");
  });

  it("reads the second county's report, which has no zoning record, as too early", () => {
    const result = line(secondCountyReport);
    expect(result?.lead).toBe("tooEarly");
    expect(result?.text).toContain("Check first:");
  });

  it("names a hold the deal placed, in the same words as its card", () => {
    const result = line(goldenReport, heldDeal);
    expect(result?.held).toEqual(["sellerAuthority"]);
    expect(result?.opening).toBe("Possibly buildable, but seller authority is on hold.");
  });

  it("names no hold on a deal that released", () => {
    const result = line(goldenReport, stagedReleasedDeal);
    expect(result?.held).toEqual([]);
  });

  it("joins a hold onto too early to tell without claiming more", () => {
    const report = plus(withStatus(goldenReport, "zoning", "unknown"), "septic", "held");
    expect(line(report)?.opening).toBe("Too early to tell, and septic is on hold.");
  });

  it("omits the party when the check names nobody", () => {
    const report: ParcelReport = {
      ...goldenReport,
      biggestOpenQuestion: "closing",
      checks: goldenReport.checks.filter((check) => check.kind !== "closing"),
    };
    // A closing is listed only with a deal; with one and no report entry it reads as unknown.
    const ledger = buildLedger(report, { ...stagedDeal, state: "draft", hold: undefined, reviewers: [], timeline: [] });
    expect(bottomLine(ledger)?.ask).toBe("Check first: the closing.");
  });

  it("keeps acronyms when it lowercases a party mid-sentence", () => {
    const report: ParcelReport = { ...goldenReport, biggestOpenQuestion: "flood" };
    const flood = report.checks.find((check) => check.kind === "flood");
    const result = line(report);
    if (/^[A-Z]{2}/.test(flood?.responsibleParty.role ?? "")) {
      expect(result?.party).toBe(flood?.responsibleParty.role);
    } else {
      expect(result?.party?.charAt(0)).toBe(result?.party?.charAt(0).toLowerCase());
    }
  });

  it("drops the role's own aside so parentheses never nest", () => {
    const report: ParcelReport = {
      ...goldenReport,
      biggestOpenQuestion: "flood",
      checks: goldenReport.checks.map((check) =>
        check.kind === "flood"
          ? {
              ...check,
              status: "needsReview",
              responsibleParty: {
                role: "Community floodplain administrator (city, village, or county)",
              },
            }
          : check,
      ),
    };
    expect(line(report)?.ask).toBe(
      "Check first: flood risk (community floodplain administrator).",
    );
  });

  describe("when the water and sewer check finds no public sewer", () => {
    /** The golden report with a utilities answer shaped like its live one (recorded 2026-11-19). */
    const noSewer = (finding: string, report: ParcelReport = goldenReport): ParcelReport => ({
      ...report,
      checks: report.checks.map((check) =>
        check.kind === "utilities"
          ? {
              ...check,
              status: "needsReview",
              finding,
              sources: [
                {
                  authority: "U.S. Environmental Protection Agency",
                  title: "Community Water System Service Area Boundaries",
                  url: "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0",
                  retrievedAt: "2026-11-20T00:15:58.950Z",
                },
              ],
            }
          : check,
      ),
    });
    const golden = noSewer(
      `Not inside any community water system or wastewater plant's sewershed on EPA's maps, or any Franklin County Sanitary Engineering service area. ${NO_PUBLIC_SEWER.waterAndSewer}`,
    );
    const withSeptic = (report: ParcelReport, septic: Partial<Check>): ParcelReport => ({
      ...report,
      checks: report.checks.map((check) => (check.kind === "septic" ? { ...check, ...septic } : check)),
    });

    it("adds what the septic soils say, from the septic card's own rating", () => {
      const result = line(golden);
      expect(result?.wastewater).toBe(
        "No public sewer is mapped here, so the septic soils matter: USDA rates them “Very limited” for a septic drain field.",
      );
      expect(result?.text).toBe(`${result?.opening} ${result?.ask} ${result?.wastewater}`);
      // The opening and the ask are unchanged.
      expect(result?.opening).toBe(line(goldenReport)?.opening);
      expect(result?.ask).toBe(line(goldenReport)?.ask);
    });

    it("says part of the soil when the map units disagree, naming the most limiting rating", () => {
      const mixed = withSeptic(golden, {
        finding:
          "USDA NRCS SSURGO maps 60% of the parcel as map unit A (A loam), rated “Somewhat limited” for septic-tank absorption fields and 40% of the parcel as map unit B (B clay), rated “Very limited” for septic-tank absorption fields.",
      });
      expect(line(mixed)?.wastewater).toBe(
        "No public sewer is mapped here, so the septic soils matter: USDA rates part of them “Very limited” for a septic drain field.",
      );
    });

    it("says the soils are unrated when the septic check has no answer", () => {
      const unrated = withSeptic(golden, { status: "unknown", finding: "No septic site review is on file for this lot." });
      expect(line(unrated)?.wastewater).toBe(
        "No public sewer is mapped here, so the septic soils matter, and they haven't been rated yet.",
      );
      expect(septicRating(unrated.checks.find((check) => check.kind === "septic"))).toBeNull();
    });

    it("works for the sewer-only sentence too", () => {
      const result = line(noSewer(`Inside the X service area on EPA's community water system map. ${NO_PUBLIC_SEWER.sewer}`));
      expect(result?.wastewater).toMatch(/^No public sewer is mapped here, so the septic soils matter/);
    });

    it("says nothing when sewer is mapped, unchecked, or only the seeded template is there", () => {
      const inSewershed = noSewer(
        "Inside the Columbus Public Water System service area on EPA's community water system map. Inside the Columbus Jackson Pike WWTP & Sewers sewershed on EPA's map.",
      );
      for (const report of [goldenReport, secondCountyReport, inSewershed]) {
        expect(line(report)?.wastewater).toBe("");
        expect(line(report)?.text).not.toMatch(/septic soils/);
      }
    });

    it("never calls the lot safe or buildable", () => {
      expect(line(golden)?.text).not.toMatch(FORBIDDEN);
    });

    it("renders after the ask in the summary", () => {
      const html = renderToStaticMarkup(
        createElement(ReportSummary, { ledger: buildLedger(golden, null), onOpen: () => {} }),
      );
      expect(html).toContain("USDA rates them “Very limited” for a septic drain field.");
    });
  });

  it("is absent when there is no report", () => {
    expect(line(null)).toBeNull();
  });

  it("never calls a lot safe or says it can be built on", () => {
    const reports = [
      goldenReport,
      secondCountyReport,
      withStatus(goldenReport, "zoning", "signedOff"),
      withStatus(goldenReport, "zoning", "unknown"),
    ];
    for (const report of reports) {
      for (const deal of [null, stagedDeal, heldDeal, stagedReleasedDeal]) {
        expect(line(report, deal)?.text).not.toMatch(FORBIDDEN);
      }
    }
  });
});

describe("the report summary renders", () => {
  const render = (ledger: ParcelLedger) =>
    renderToStaticMarkup(createElement(ReportSummary, { ledger, onOpen: () => {} }));

  it("shows the sentence, the count, and one icon per check in ledger order", () => {
    const ledger = buildLedger(goldenReport, heldDeal);
    const html = render(ledger);
    expect(html).toContain("Possibly buildable, but seller authority is on hold.");
    expect(html).toContain(`${ledger.answered} of ${ledger.records.length} checks answered`);
    const statuses = [...html.matchAll(/data-status="(\w+)"/g)].map((match) => match[1]);
    expect(statuses).toEqual(ledger.records.map((record) => record.check.status));
  });

  it("names each icon's check and status in words, and marks the biggest question", () => {
    const html = render(buildLedger(goldenReport, heldDeal));
    expect(html).toContain("Road access: Needs review (biggest open question)");
    expect(html).toContain("Seller authority: Held");
    expect(html.match(/data-biggest/g)).toHaveLength(1);
  });

  it("renders nothing without a report", () => {
    expect(render(buildLedger(null, null))).toBe("");
  });
});
