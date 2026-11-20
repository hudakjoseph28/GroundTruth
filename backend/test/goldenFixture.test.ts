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
import { biggestOpenQuestion } from "../src/reports/pipeline.js";
import {
  SEEDED_TEMPLATE_OVERRIDES,
  seededReport,
} from "../src/reports/seededReports.js";
import { isTemplateKind, templateCheck } from "../src/reports/templates.js";
import { floodEvidence } from "./support/floodEvidence.js";

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
    expect(access.finding).toContain("about 106 m");
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

  it("screens septic soils from the Living Atlas SSURGO copy, needing review", () => {
    const septic = check("septic");
    expect(septic.status).toBe("needsReview");
    const units = [
      ...septic.finding.matchAll(
        /([\d.]+)% (?:of the parcel )?as map unit (\w+)/g,
      ),
    ].map(([, share, symbol]) => [symbol, Number(share)]);
    expect(units).toEqual([
      ["Ko", 46.05],
      ["CrB", 38.31],
      ["CeB2", 15.64],
    ]);
    expect(
      units.reduce((sum, [, share]) => sum + Number(share), 0),
    ).toBeCloseTo(100, 6);
    expect(septic.finding).toContain(
      "All three are rated “Very limited” for septic-tank absorption fields.",
    );
    expect(septic.finding).not.toMatch(/not limited|somewhat limited/i);
    expect(`${septic.finding} ${septic.limitation}`).not.toMatch(
      /septic\s+(system\s+)?will\s+work|suitable for (a )?septic/i,
    );
    expect(septic.sources).toEqual([
      {
        authority:
          "USDA Natural Resources Conservation Service (SSURGO), hosted by Esri ArcGIS Living Atlas",
        title:
          "USA Soils Map Units (gSSURGO): septic-tank absorption fields, dominant-condition rating (engstafdcd)",
        url: "https://services5.arcgis.com/7weheFjxuNkGGiZi/arcgis/rest/services/USA_Soils_Map_Units/FeatureServer/0",
        retrievedAt: "2026-11-19T03:48:19.000Z",
      },
    ]);
    expect(septic.responsibleParty).toEqual({
      role: "Local health district (sewage treatment systems)",
      organization: "Franklin County Public Health",
      publicContactUrl: "https://myfcph.org/forms-permits/",
    });
    expect(septic.nextAction).toMatch(
      /^Ask Franklin County Public Health for a site and soil evaluation/,
    );
  });

  it("carries every check the live pipeline runs for a Franklin lot", () => {
    // db:seed writes this report with no expiry, so a check the pipeline
    // runs but the fixture lacks would never reach the golden lot.
    expect(goldenReport.checks.map((entry) => entry.kind)).toEqual([
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

  it("answers water and sewer from EPA and county maps, without claiming a distance", () => {
    const utilities = check("utilities");
    expect(utilities.status).toBe("needsReview");
    expect(utilities.finding).toMatch(
      /^Not inside any community water system or wastewater plant's sewershed/,
    );
    expect(utilities.finding).toContain(
      "the distance to a main wasn't measured",
    );
    expect(utilities.finding).toContain(
      "likely needs a private well and a septic system",
    );
    expect(utilities.sources.map((source) => source.authority)).toEqual([
      "U.S. Environmental Protection Agency",
      "U.S. Environmental Protection Agency",
      "Franklin County Sanitary Engineering",
    ]);
    expect(utilities.responsibleParty.organization).toBe(
      "Franklin County Sanitary Engineering",
    );
  });

  it("screens wetlands and the Big Darby setback, needing review", () => {
    const environmental = check("environmental");
    expect(environmental.status).toBe("needsReview");
    expect(environmental.finding).toContain("maps no wetland on this lot");
    expect(environmental.finding).toContain("about 4.7%");
    expect(environmental.limitation).toMatch(/not a wetland delineation/);
    // The zoning check's setback share agrees with the environmental check.
    expect(check("zoning").limitation).toContain("about 4.7% of the parcel");
  });

  it("keeps access the biggest open question with septic now under review", () => {
    expect(
      biggestOpenQuestion(goldenReport.checks, { floodInSfha: false }),
    ).toBe("access");
    expect(goldenReport.biggestOpenQuestion).toBe("access");
    expect(seededReport(goldenParcel, goldenReport)).toEqual(goldenReport);
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
    expect(secondCountyReport.checks).toHaveLength(8);
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

/**
 * Whether a seeded flood check names a Special Flood Hazard Area zone:
 * FEMA's A and V zones are SFHAs, X and D are not.
 */
function floodInSfha(report: ParcelReport): boolean {
  const flood = report.checks.find((entry) => entry.kind === "flood");
  if (!flood || flood.status === "unknown") return false;
  return floodEvidence(flood).zones.some((zone) => /^[AV]/.test(zone));
}

describe("seeded report rules", () => {
  it.each([
    ["golden", goldenReport, "access"],
    ["second county", secondCountyReport, "access"],
  ] as const)(
    "%s: biggestOpenQuestion follows #9's rule (%s)",
    (_label, report, expected) => {
      expect(report.biggestOpenQuestion).toBe(expected);
      expect(floodInSfha(report)).toBe(false);
      expect(report.biggestOpenQuestion).toBe(
        biggestOpenQuestion(report.checks, {
          floodInSfha: floodInSfha(report),
        }),
      );
    },
  );

  it("has no closing check in either seeded report", () => {
    for (const report of [goldenReport, secondCountyReport]) {
      expect(report.checks.map((entry) => entry.kind)).not.toContain("closing");
    }
  });

  it("keeps the documented Licking zoning override", () => {
    const zoning = secondCountyReport.checks.find(
      (entry) => entry.kind === "zoning",
    );
    expect(zoning?.finding).toBe(
      "GroundTruth doesn't check zoning in Licking County yet.",
    );
    expect(zoning?.responsibleParty.organization).toBe(
      "Bowling Green Township, Licking County",
    );
  });
});

describe("seeded unknown checks come from templateCheck()", () => {
  it.each([
    ["golden", goldenParcel, goldenReport],
    ["second county", secondCountyParcel, secondCountyReport],
  ] as const)(
    "%s: the seeded report is the shared fixture, unchanged",
    (_label, parcel, fixture) => {
      expect(seededReport(parcel, fixture)).toEqual(fixture);
    },
  );

  it.each([
    ["golden", goldenParcel, goldenReport],
    ["second county", secondCountyParcel, secondCountyReport],
  ] as const)(
    "%s: every unknown template-kind check is templateCheck() output, except a documented override",
    (_label, parcel, fixture) => {
      const overrides = SEEDED_TEMPLATE_OVERRIDES[parcel.key] ?? [];
      const seeded = seededReport(parcel, fixture);
      let templated = 0;
      for (const entry of seeded.checks) {
        if (entry.status !== "unknown" || !isTemplateKind(entry.kind)) continue;
        if (overrides.includes(entry.kind)) {
          expect(entry).not.toEqual(templateCheck(entry.kind, parcel));
        } else {
          expect(entry).toEqual(templateCheck(entry.kind, parcel));
          templated += 1;
        }
      }
      expect(templated).toBeGreaterThan(0);
    },
  );

  it("keeps the Licking zoning override as written in the fixture", () => {
    expect(SEEDED_TEMPLATE_OVERRIDES).toEqual({
      "ohio:39089:00500729609000": ["zoning"],
    });
    const seeded = seededReport(secondCountyParcel, secondCountyReport);
    const zoning = seeded.checks.find((entry) => entry.kind === "zoning");
    expect(zoning?.finding).toBe(
      "GroundTruth doesn't check zoning in Licking County yet.",
    );
  });

  it("keeps sourced checks exactly as verified", () => {
    const seeded = seededReport(goldenParcel, goldenReport);
    for (const kind of ["access", "zoning", "flood"] as const) {
      expect(seeded.checks.find((entry) => entry.kind === kind)).toBe(
        goldenReport.checks.find((entry) => entry.kind === kind),
      );
    }
  });

  it("refuses a report for another parcel", () => {
    expect(() => seededReport(secondCountyParcel, goldenReport)).toThrow(
      "Report does not belong to the parcel",
    );
  });
});
