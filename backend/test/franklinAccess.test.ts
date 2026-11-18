import type { GeoJsonPolygon } from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { accessCheck, distance } from "../src/reports/accessCheck.js";
import {
  classify,
  createFranklinAccessClient,
  FCEO_ROAD_LAYER,
  FRANKLIN_ROW_LAYER,
  roadName,
  type RoadFeature,
  type RowFeature,
} from "../src/reports/franklinAccess.js";

/**
 * Synthetic geometry: shapes no recorded parcel shows, built by hand in the
 * layers' response shape to test classification only. Recorded parcels are
 * covered in report.test.ts.
 */

// A 0.001° square lot near Columbus (about 85 m × 111 m).
const X0 = -83.2;
const Y0 = 39.9;
const D = 0.001;
/** Metres per degree at this latitude. */
const M_LAT = 111_320;
const M_LON = M_LAT * Math.cos((Y0 * Math.PI) / 180);
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

const box = (x1: number, y1: number, x2: number, y2: number) => [
  [x1, y1],
  [x1, y2],
  [x2, y2],
  [x2, y1],
  [x1, y1],
];

const row = (rings: number[][][], TYPE = "Plat - R/W"): RowFeature => ({
  attributes: { TYPE },
  geometry: { rings },
});

const road = (
  MSAG_LSN: string,
  path: number[][],
  RoadClass: string | null = "City Subdivision",
  Jurisdiction: string | null = "Columbus",
): RoadFeature => ({
  attributes: { MSAG_LSN, RoadClass, Jurisdiction },
  geometry: { paths: [path] },
});

/** A road running east-west `metres` south of the lot. */
const southRoad = (name: string, metres: number, roadClass?: string | null) =>
  road(
    name,
    [
      [X0 - 0.01, Y0 - metres / M_LAT],
      [X0 + 0.01, Y0 - metres / M_LAT],
    ],
    roadClass,
  );

/** The 20 m strip of right-of-way along the lot's south edge. */
const southRow = box(X0 - 0.01, Y0 - 20 / M_LAT, X0 + 0.01, Y0);

const AT = "2026-11-18T00:00:00.000Z";
const context = { retrievedAt: AT, searchedM: 200 };

describe("classify", () => {
  it("names the road through the right-of-way the lot touches", () => {
    const outcome = classify(
      lot,
      [row([southRow])],
      [southRoad("W DODRIDGE ST", 10)],
      context,
    );
    expect(outcome).toMatchObject({
      outcome: "touches",
      rowTypes: ["Plat - R/W"],
      roads: [{ name: "W Dodridge St", jurisdiction: "Columbus" }],
    });
    if (outcome.outcome !== "touches") throw new Error(outcome.outcome);
    expect(outcome.roads[0]?.distanceM).toBeCloseTo(10, 0);
    expect(accessCheck(outcome, 1000).status).toBe("evidenceFound");
  });

  it("names a corner lot's second street, but not the next street over in the same grid polygon", () => {
    const grid = box(X0 - 0.01, Y0 - 0.01, X0 + 0.01, Y0 + 0.01);
    const eastStreet = (name: string, metres: number) =>
      road(name, [
        [X0 + D + metres / M_LON, Y0 - 0.01],
        [X0 + D + metres / M_LON, Y0 + 0.01],
      ]);
    const outcome = classify(
      lot,
      [row([grid])],
      [southRoad("MAIN ST", 10), eastStreet("NEIL AVE", 20)],
      context,
    );
    if (outcome.outcome !== "touches") throw new Error(outcome.outcome);
    expect(outcome.roads.map((r) => r.name)).toEqual(["Main St", "Neil Ave"]);

    const farther = classify(
      lot,
      [row([grid])],
      [southRoad("MAIN ST", 10), eastStreet("NEIL AVE", 60)],
      context,
    );
    if (farther.outcome !== "touches") throw new Error(farther.outcome);
    expect(farther.roads.map((r) => r.name)).toEqual(["Main St"]);
  });

  it("measures 0 for a centerline inside the lot", () => {
    const outcome = classify(
      lot,
      [row([box(X0 - 0.01, Y0, X0 + 0.01, Y0 + D / 4)])],
      [southRoad("SEAMAN RD", -10)],
      context,
    );
    if (outcome.outcome !== "touches") throw new Error(outcome.outcome);
    expect(outcome.roads[0]?.distanceM).toBe(0);
    expect(accessCheck(outcome, 1000).finding).toContain(
      "the Seaman Rd centerline meets the parcel boundary",
    );
  });

  it("needs review when the only frontage is an interstate", () => {
    const outcome = classify(
      lot,
      [row([southRow], "Highway")],
      [southRoad("I-270   N", 10, "Federal Highway System")],
      context,
    );
    const check = accessCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toContain(
      "touches the public right-of-way of I-270 N",
    );
    expect(check.finding).toContain(
      "usually limited-access, with no driveways",
    );
    expect(check.nextAction).toContain("Ohio Department of Transportation");
  });

  it("needs review for right-of-way with no road through it (a paper street)", () => {
    const outcome = classify(
      lot,
      [row([southRow])],
      [southRoad("ALKIRE RD", 150, "COUNTY")],
      context,
    );
    if (outcome.outcome !== "touches") throw new Error(outcome.outcome);
    expect(outcome.roads).toEqual([]);
    const check = accessCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toContain('(recorded as "Plat - R/W")');
    expect(check.finding).toContain(
      "The nearest mapped road, Alkire Rd, is about 150 m (492 ft) away.",
    );
  });

  it("needs review with the distance when no right-of-way touches the lot", () => {
    const outcome = classify(lot, [], [southRoad("SEAMAN RD", 106)], context);
    expect(outcome).toMatchObject({
      outcome: "notTouching",
      nearest: { name: "Seaman Rd" },
    });
    const check = accessCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toBe(
      "No public road right-of-way touches this parcel in Franklin County's right-of-way layer. The nearest mapped road, Seaman Rd, is about 106 m (348 ft) away in the county engineer's road layer.",
    );
    expect(check.finding).not.toMatch(/landlocked|no access|inaccessible/i);
  });

  it("says when the nearest road is in another county", () => {
    const outcome = classify(
      lot,
      [],
      [southRoad("OLMSTEAD RD", 300, "Out of Area")],
      { retrievedAt: AT, searchedM: 1_609 },
    );
    expect(accessCheck(outcome, 1000).finding).toContain(
      "Olmstead Rd (outside Franklin County), is about 300 m (984 ft) away",
    );
  });

  it("says no road was found within the radius searched", () => {
    const outcome = classify(lot, [], [], {
      retrievedAt: AT,
      searchedM: 1_609,
    });
    const check = accessCheck(outcome, 1000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toBe(
      "No public road right-of-way touches this parcel in Franklin County's right-of-way layer. The county engineer's road layer shows no road within about 1.6 km (1 mile) of it.",
    );
  });
});

describe("createFranklinAccessClient", () => {
  const empty = { features: [] };

  it("widens the road search to a mile only when nothing is within 200 m", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const params = new URLSearchParams(String(init?.body));
      if (String(input) === `${FRANKLIN_ROW_LAYER}/query`) {
        return new Response(JSON.stringify(empty));
      }
      expect(String(input)).toBe(`${FCEO_ROAD_LAYER}/query`);
      const body =
        params.get("distance") === "1609"
          ? { features: [southRoad("ALKIRE RD", 900, "COUNTY")] }
          : empty;
      return new Response(JSON.stringify(body));
    });
    const client = createFranklinAccessClient({
      fetch: fetchImpl,
      now: () => new Date(AT),
    });

    const outcome = await client.access(lot, new AbortController().signal);

    expect(outcome).toMatchObject({
      outcome: "notTouching",
      searchedM: 1_609,
      nearest: { name: "Alkire Rd" },
    });
    const distances = fetchImpl.mock.calls
      .filter(([input]) => String(input).startsWith(FCEO_ROAD_LAYER))
      .map(([, init]) =>
        new URLSearchParams(String(init?.body)).get("distance"),
      );
    expect(distances).toEqual(["200", "1609"]);
  });

  it("is unavailable when a layer truncates its answer, never a guess from part of it", async () => {
    const client = createFranklinAccessClient({
      fetch: async () =>
        new Response(
          JSON.stringify({ features: [], exceededTransferLimit: true }),
        ),
    });
    expect(await client.access(lot, new AbortController().signal)).toEqual({
      outcome: "timeout",
      cause: "unavailable",
    });
  });

  it("is timedOut when the caller aborts", async () => {
    const controller = new AbortController();
    const client = createFranklinAccessClient({
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    const pending = client.access(lot, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ outcome: "timeout", cause: "timedOut" });
  });
});

describe("roadName", () => {
  it.each([
    ["W DODRIDGE ST", "W Dodridge St"],
    ["I-270   N", "I-270 N"],
    ["LILLY CHAPEL GEORGESVILLE RD SE", "Lilly Chapel Georgesville Rd SE"],
    ["N 3RD ST", "N 3rd St"],
    ["BALTIMORE-REYNOLDSBURG RD", "Baltimore-Reynoldsburg Rd"],
    ["SR 315 N", "SR 315 N"],
    ["None", "an unnamed road"],
    [" ", "an unnamed road"],
  ])("%j reads as %j", (raw, name) => {
    expect(roadName(raw)).toBe(name);
  });
});

describe("distance", () => {
  it.each([
    [0.4, "less than 1 m"],
    [105.75, "about 106 m (347 ft)"],
    [1_609, "about 1.6 km (1 mile)"],
    [2_400, "about 2.4 km (1.5 miles)"],
  ])("%d m reads as %j", (metres, text) => {
    expect(distance(metres)).toBe(text);
  });
});
