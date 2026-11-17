import {
  goldenParcel,
  goldenReport,
  secondCountyParcel,
  secondCountyReport,
  stagedDeal,
  type ParcelReport,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { toParcelReport } from "../src/reports/mapReport.js";

const check = (kind: string) => {
  const found = goldenReport.checks.find((entry) => entry.kind === kind);
  if (!found) throw new Error(`golden report has no ${kind} check`);
  return found;
};

describe("golden parcel fixture", () => {
  it("is the published OGRIP parcel 230-000918 in Franklin County", () => {
    expect(goldenParcel).toMatchObject({
      key: "ohio:39049:230-000918",
      sourceParcelId: "230-000918",
      county: "Franklin",
      countyFips: "39049",
      geometry: { authority: "Ohio OGRIP" },
    });
    const url = new URL(goldenParcel.geometry.sourceUrl);
    expect(url.searchParams.get("where")).toBe(
      "County='Franklin' AND LocalParcelID='230-000918'",
    );
    expect(Number.isNaN(Date.parse(goldenParcel.geometry.retrievedAt))).toBe(
      false,
    );
  });

  it("carries no acreage, because OGRIP publishes none for it", () => {
    expect(goldenParcel).not.toHaveProperty("acreage");
  });

  it("is the parcel the staged deal closes on", () => {
    expect(stagedDeal.parcelKey).toBe(goldenParcel.key);
    expect(goldenReport.parcelKey).toBe(goldenParcel.key);
  });

  it("leads with legal access and never claims the parcel has no access", () => {
    expect(goldenReport.biggestOpenQuestion).toBe("access");
    const access = check("access");
    expect(["needsReview", "unknown"]).toContain(access.status);
    expect(`${access.finding} ${access.nextAction}`).not.toMatch(
      /\bno (legal )?access\b|landlocked|inaccessible/i,
    );
    expect(access.finding).toContain("about 107 m");
    expect(access.nextAction).toContain("§302.0391");
    // §302.0391 private lanes: platted, Planning Commission-approved, HOA-kept.
    expect(access.nextAction).toMatch(/subdivision plat/);
    expect(access.nextAction).toMatch(/Franklin County Planning Commission/);
    expect(access.nextAction).toMatch(/homeowners' association/);
    expect(access.nextAction).toContain("§302.042");
  });

  it("states the §302.042 frontage condition on the zoning check", () => {
    const zoning = check("zoning");
    expect(zoning.finding).toContain("§302.042");
    expect(zoning.finding).toContain("at least 150 feet");
    expect(zoning.limitation).toMatch(
      /frontage requirement needs county zoning review/,
    );
    // The riparian setback is conditional on where something would be built.
    expect(zoning.limitation).toMatch(
      /^.*If a building, driveway, or septic system would go near the stream/s,
    );
  });

  it("cites both FIRM panels that cover the parcel", () => {
    const flood = check("flood");
    expect(flood.finding).toContain("39049C0290K");
    expect(flood.finding).toContain("39097C0190E");
    expect(flood.sources.map((source) => source.effectiveDate)).toEqual([
      "2008-06-17",
      "2008-06-17",
      "2023-11-16",
    ]);
  });

  it("cites the Franklin County Auditor's legal acreage on the zoning check", () => {
    const zoning = check("zoning");
    expect(zoning.status).toBe("evidenceFound");
    expect(zoning.finding).toContain("3.015 legal acres");
    const auditor = zoning.sources.find(
      (source) => source.authority === "Franklin County Auditor",
    );
    expect(auditor).toMatchObject({
      url: "https://audr-apps.franklincountyohio.gov/redir/Link/Parcel/230-000918",
    });
    expect(Number.isNaN(Date.parse(auditor?.retrievedAt ?? ""))).toBe(false);
  });

  it("has a dated source for every finding and none for unknowns", () => {
    for (const entry of goldenReport.checks) {
      if (entry.status === "unknown") {
        expect(entry.sources).toEqual([]);
        continue;
      }
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(Number.isNaN(Date.parse(source.retrievedAt))).toBe(false);
        expect(source.url).toMatch(/^https:\/\//);
      }
    }
    expect(check("flood").sources[0]?.effectiveDate).toBe("2008-06-17");
  });

  it("survives the database row mapping unchanged", () => {
    const stored = {
      parcelKey: goldenReport.parcelKey,
      generatedAt: new Date(goldenReport.generatedAt),
      coverage: goldenReport.coverage,
      biggestOpenQuestion: goldenReport.biggestOpenQuestion,
      checks: goldenReport.checks.map((entry, position) => ({
        position,
        kind: entry.kind,
        status: entry.status,
        finding: entry.finding,
        limitation: entry.limitation,
        nextAction: entry.nextAction,
        responsibleRole: entry.responsibleParty.role,
        responsibleOrganization: entry.responsibleParty.organization ?? null,
        publicContactUrl: entry.responsibleParty.publicContactUrl ?? null,
        reviewerWallet: null,
        transactionSignature: null,
        sources: entry.sources.map((source, sourcePosition) => ({
          position: sourcePosition,
          authority: source.authority,
          title: source.title,
          url: source.url,
          retrievedAt: new Date(source.retrievedAt),
          effectiveDate: source.effectiveDate
            ? new Date(source.effectiveDate)
            : null,
        })),
      })),
    };

    const mapped = toParcelReport(stored);

    expect(mapped.checks.map((entry) => [entry.kind, entry.status])).toEqual(
      goldenReport.checks.map((entry) => [entry.kind, entry.status]),
    );
    expect(mapped.checks[1]?.sources.map((source) => source.authority)).toEqual(
      check("zoning").sources.map((source) => source.authority),
    );
  });
});

describe("second-county parcel fixture", () => {
  const find = (kind: string) =>
    secondCountyReport.checks.find((entry) => entry.kind === kind);

  it("is the published OGRIP parcel 00500729609000 in Licking County", () => {
    expect(secondCountyParcel).toMatchObject({
      key: "ohio:39089:00500729609000",
      county: "Licking",
      countyFips: "39089",
      acreage: 1.2,
      geometry: { authority: "Ohio OGRIP" },
    });
    expect(
      new URL(secondCountyParcel.geometry.sourceUrl).searchParams.get("where"),
    ).toBe("County='Licking' AND LocalParcelID='00500729609000'");
  });

  it("says GroundTruth has not checked Licking zoning, and names who can", () => {
    expect(find("zoning")).toMatchObject({
      status: "unknown",
      finding: "GroundTruth doesn't check zoning in Licking County yet.",
      sources: [],
      responsibleParty: { role: "Township zoning inspector" },
      nextAction:
        "Bowling Green Township's zoning inspector can confirm the district.",
    });
    const text = JSON.stringify(secondCountyReport);
    expect(text).not.toMatch(/R-2|\bAG\b|Agricultural|Residential District/);
    expect(text).not.toMatch(/(can't|cannot|can not) be resolved/i);
  });

  it("reports FEMA Zone X with its panel and effective date", () => {
    const flood = find("flood");
    expect(flood?.status).toBe("evidenceFound");
    expect(flood?.finding).toContain("39089C0505J");
    expect(flood?.sources.map((source) => source.effectiveDate)).toEqual([
      "2015-03-16",
      "2015-03-16",
      "2011-04-18",
    ]);
    expect(flood?.finding).toContain("39127C0050D");
  });

  it("leaves every other check unknown, and sets coverage from the results", () => {
    for (const entry of secondCountyReport.checks) {
      if (entry.kind !== "flood") expect(entry.status).toBe("unknown");
    }
    expect(secondCountyReport.checks).toHaveLength(9);
    expect(secondCountyReport.coverage).toBe(coverageOf(secondCountyReport));
    expect(goldenReport.coverage).toBe(coverageOf(goldenReport));
  });
});

/** Coverage that the checks support: any finding makes a report partial. */
function coverageOf(report: ParcelReport): ParcelReport["coverage"] {
  const statuses = new Set(report.checks.map((entry) => entry.status));
  if (!statuses.has("evidenceFound") && !statuses.has("needsReview")) {
    return "boundaryOnly";
  }
  return statuses.has("unknown") ? "partial" : "deep";
}

describe("unknown checks in the shared fixtures (Phase 2)", () => {
  it.each([
    ["golden", goldenReport],
    ["second county", secondCountyReport],
  ] as const)(
    "%s: every unknown check names who resolves it and a concrete next action",
    (_label, report) => {
      const unknowns = report.checks.filter(
        (entry) => entry.status === "unknown",
      );
      expect(unknowns.length).toBeGreaterThan(0);
      for (const entry of unknowns) {
        expect(entry.responsibleParty.role).not.toMatch(/unassigned/i);
        expect(entry.nextAction).not.toMatch(/no next action/i);
        expect(entry.finding).not.toMatch(
          /has not checked this for this parcel/i,
        );
      }
      const actions = report.checks.map((entry) => entry.nextAction);
      expect(new Set(actions).size).toBe(actions.length);
    },
  );

  it("points septic at the health district and easements at a title search", () => {
    const septic = secondCountyReport.checks.find(
      (entry) => entry.kind === "septic",
    );
    expect(septic?.responsibleParty.role).toMatch(/health district/i);
    expect(septic?.nextAction).toMatch(/site and soil evaluation/);
    for (const report of [goldenReport, secondCountyReport]) {
      const easements = report.checks.find(
        (entry) => entry.kind === "easements",
      );
      expect(easements?.nextAction).toMatch(
        /title company to search the recorded documents/,
      );
    }
  });
});
