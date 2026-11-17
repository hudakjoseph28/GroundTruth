import type { GeoJsonPolygon } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { measure } from "../src/reports/franklinZoning.js";
import { zoningCheck } from "../src/reports/zoningCheck.js";

// A 0.001° square lot near Columbus (about 85 m × 111 m).
const X0 = -83.2;
const Y0 = 39.9;
const D = 0.001;
const lot: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [X0, Y0],
      [X0 + D, Y0],
      [X0 + D, Y0 + D],
      [X0, Y0 + D],
      [X0, Y0],
    ],
  ],
};

/** An Esri outer ring (clockwise) for the box [x1, x2] × [y1, y2]. */
const box = (x1: number, y1: number, x2: number, y2: number) => [
  [x1, y1],
  [x1, y2],
  [x2, y2],
  [x2, y1],
  [x1, y1],
];
/** A counter-clockwise ring: an Esri hole. */
const hole = (x1: number, y1: number, x2: number, y2: number) =>
  [...box(x1, y1, x2, y2)].reverse();

const district = (
  ZONING: string,
  rings: number[][][],
  Zoning_Class: string | null = null,
) => ({ attributes: { ZONING, Zoning_Class }, geometry: { rings } });

const AT = "2026-11-17T00:00:00.000Z";

describe("measure: shares of the lot in each district", () => {
  it("one district covering the lot", () => {
    const outcome = measure(
      lot,
      [district("R", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)], "Rural")],
      AT,
    );
    expect(outcome).toEqual({
      outcome: "found",
      retrievedAt: AT,
      districts: [{ code: "R", className: "Rural District", share: 1 }],
      uncovered: 0,
      contradicted: 0,
    });
    expect(
      outcome.outcome === "found" && zoningCheck(outcome, 1000).status,
    ).toBe("evidenceFound");
  });

  it("an even split between two districts needs review", () => {
    const mid = X0 + D / 2;
    const outcome = measure(
      lot,
      [
        district("R", [box(X0 - 1, Y0 - 1, mid, Y0 + 1)], "Rural"),
        district("CC", [box(mid, Y0 - 1, X0 + 1, Y0 + 1)], "Comm_Commercial"),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.districts.map((d) => d.code).sort()).toEqual(["CC", "R"]);
    for (const d of outcome.districts) expect(d.share).toBeCloseTo(0.5, 2);
    const check = zoningCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toMatch(
      /splits this parcel: about 50% in the .+ and about 50% in the /,
    );
  });

  it("ignores a sliver under 1% along the edge", () => {
    const sliver = X0 + D * 0.005;
    const outcome = measure(
      lot,
      [
        district("R", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)], "Rural"),
        district("LI", [box(X0 - 1, Y0 - 1, sliver, Y0 + 1)], "Lim_Ind"),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.districts.map((d) => d.code)).toEqual(["R"]);
    expect(zoningCheck(outcome, 1000).status).toBe("evidenceFound");
  });

  it("a lot outside every named district is missing (the county does not zone it)", () => {
    expect(
      measure(
        lot,
        [
          district("NOT IN JURISDICTION", [
            box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1),
          ]),
        ],
        AT,
      ),
    ).toEqual({ outcome: "missing", retrievedAt: AT });
    expect(measure(lot, [], AT)).toEqual({
      outcome: "missing",
      retrievedAt: AT,
    });
    expect(
      measure(lot, [district(" ", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)])], AT),
    ).toEqual({ outcome: "missing", retrievedAt: AT });
  });

  it("flags a named district the same map also marks not in county jurisdiction", () => {
    const outcome = measure(
      lot,
      [
        district("EU", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)], "Exc_Use"),
        district("NOT IN JURISDICTION", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)]),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.contradicted).toBe(1);
    const check = zoningCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toMatch(/the map disagrees with itself/);
  });

  it("cuts out holes, and reports the uncovered part", () => {
    const outcome = measure(
      lot,
      [
        district(
          "R",
          [
            box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1),
            hole(X0 + D / 2, Y0 - 1, X0 + 1, Y0 + 1),
          ],
          "Rural",
        ),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.districts[0]?.share).toBeCloseTo(0.5, 2);
    expect(outcome.uncovered).toBeCloseTo(0.5, 2);
    const check = zoningCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toMatch(
      /places about 50% of this parcel in the Rural District \(R\)\. About 50% of it is not in any county zoning district\./,
    );
  });

  it("normalizes a code stored on several lines and joins features with one code", () => {
    const mid = X0 + D / 2;
    const outcome = measure(
      lot,
      [
        district(
          "PR-10\nPR-10\nPR-10",
          [box(X0 - 1, Y0 - 1, mid, Y0 + 1)],
          "Plan_Man_Hous",
        ),
        district("PR-10", [box(mid, Y0 - 1, X0 + 1, Y0 + 1)], "Plan_Man_Hous"),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.districts).toEqual([
      {
        code: "PR-10",
        className: "Planned Manufactured Housing Residential District",
        share: 1,
      },
    ]);
  });

  it("ignores a district that only touches the lot's edge", () => {
    const outcome = measure(
      lot,
      [
        district("R", [box(X0 - 1, Y0 - 1, X0 + 1, Y0 + 1)], "Rural"),
        district("CS", [box(X0 + D, Y0 - 1, X0 + 1, Y0 + 1)], "Comm_Serv"),
      ],
      AT,
    );
    if (outcome.outcome !== "found") throw new Error(outcome.outcome);
    expect(outcome.districts.map((d) => d.code)).toEqual(["R"]);
  });
});
