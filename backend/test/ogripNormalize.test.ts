import { describe, expect, it } from "vitest";
import {
  polygonCentroid,
  siteAddressMatches,
  siteAddressOnStreet,
  toParcelSummary,
} from "../src/parcels/normalize.js";
import {
  countyByFips,
  countyByName,
  OHIO_COUNTIES,
} from "../src/parcels/ohioCounties.js";
import {
  parseAddressQuery,
  parseStreetQuery,
  placeCounties,
  placeOnlyQuery,
  siteAddressAgrees,
  sitePlace,
} from "../src/parcels/addressQuery.js";
import {
  applyIdFormat,
  idFormat,
  parcelIdCandidates,
  parcelIdWhere,
} from "../src/parcels/parcelIdSearch.js";
import { isKeyableParcelId, parseParcelKey } from "../src/parcels/parcelKey.js";

const centroid = { latitude: 40, longitude: -83 };

describe("Ohio county table", () => {
  it("has 88 counties with odd FIPS codes 39001-39175", () => {
    expect(OHIO_COUNTIES).toHaveLength(88);
    expect(OHIO_COUNTIES[0]).toEqual({ name: "Adams", fips: "39001" });
    expect(OHIO_COUNTIES[87]).toEqual({ name: "Wyandot", fips: "39175" });
    expect(countyByFips("39049")?.name).toBe("Franklin");
    expect(countyByFips("39089")?.name).toBe("Licking");
    expect(countyByName("van wert")?.fips).toBe("39161");
    expect(countyByFips("39002")).toBeUndefined();
  });
});

describe("parcel IDs and keys", () => {
  it.each([
    "010-042534",
    "00100000601000",
    "D12-017-0-0005-00",
    "45-03349.000",
  ])("keys %s", (id) => expect(isKeyableParcelId(id)).toBe(true));

  it.each([
    "U/I",
    " ",
    "0000000000000",
    "ORD 958, Vacated 9/7/1982",
    " 01900106006",
    "-12",
  ])("does not key the non-parcel or untrimmed value %j", (id) =>
    expect(isKeyableParcelId(id)).toBe(false),
  );

  it("parses a key into county FIPS and parcel ID", () => {
    expect(parseParcelKey("ohio:39049:010-042534")).toEqual({
      countyFips: "39049",
      sourceParcelId: "010-042534",
    });
    expect(parseParcelKey("ohio:39049:STAGED-DEMO")?.sourceParcelId).toBe(
      "STAGED-DEMO",
    );
    expect(parseParcelKey("ohio:39049:a/b")).toBeNull();
  });
});

describe("parcel ID candidates", () => {
  it("re-punctuates a compact ID into every measured county layout", () => {
    expect(idFormat("010-042534")).toBe("3-6");
    expect(idFormat("45-03349.000")).toBe("2-5.3");
    expect(applyIdFormat("010042534", "3-6")).toBe("010-042534");
    expect(applyIdFormat("01004253", "3-6")).toBeNull();
  });

  it.each([
    ["010-042534", "010-042534"],
    ["010042534", "010-042534"],
    ["010 042534", "010-042534"],
    ["00100000601000", "00100000601000"],
    ["001-000006-01.000", "00100000601000"],
  ])("%s includes the published form %s", (typed, published) => {
    expect(parcelIdCandidates(typed)).toContain(published);
  });

  it("puts only quoted ID literals in the filter", () => {
    const where = parcelIdWhere("010042534") ?? "";
    expect(where).toMatch(
      /^LocalParcelID IN \('[A-Z0-9.-]+'(,'[A-Z0-9.-]+')*\)$/,
    );
    expect(where).toContain("'010-042534'");
  });

  it("reads the statewide form as county + local ID", () => {
    expect(parcelIdWhere("39049-010-042534")).toContain(
      "(County='Franklin' AND LocalParcelID IN ('010-042534'",
    );
  });

  it("produces no filter for values that are not parcel IDs", () => {
    expect(parcelIdWhere("1' OR '1'='1")).toBeNull();
    expect(parcelIdWhere("0000")).toBeNull();
  });
});

describe("parseAddressQuery", () => {
  it.each([
    [
      "57 S Main St Johnstown OH",
      {
        houseNumber: "57",
        streetName: "MAIN",
        streetOnly: "57 S MAIN ST",
        place: "JOHNSTOWN",
      },
    ],
    [
      "10034 Appleton Rd, Johnstown",
      {
        houseNumber: "10034",
        streetName: "APPLETON",
        streetOnly: "10034 APPLETON RD",
        place: "JOHNSTOWN",
      },
    ],
    [
      "10034 Appleton Rd Johnstown 43031",
      { streetName: "APPLETON", place: "JOHNSTOWN" },
    ],
    [
      "84 W Dodridge St, Columbus, OH 43202",
      { streetName: "DODRIDGE", place: "COLUMBUS" },
    ],
    [
      "123 St Clair Ave Mt Vernon",
      { streetName: "ST CLAIR", place: "MOUNT VERNON" },
    ],
    [
      "84 W Dodridge St",
      { streetName: "DODRIDGE", streetOnly: "84 W DODRIDGE ST" },
    ],
  ])("%s", (query, expected) => {
    const parsed = parseAddressQuery(query);
    expect(parsed).toMatchObject({ ...expected, outOfState: false });
    if (!("place" in expected)) expect(parsed?.place).toBeUndefined();
  });

  it("flags another state and requires a house number", () => {
    expect(
      parseAddressQuery("1600 Pennsylvania Ave NW, Washington, DC 20500")
        ?.outOfState,
    ).toBe(true);
    expect(parseAddressQuery("Appleton Rd, Johnstown")).toBeNull();
  });

  it("maps places to counties from the Census table", () => {
    expect(placeCounties("Johnstown")).toEqual(["39089"]);
    expect(placeCounties("columbus")).toEqual(["39041", "39045", "39049"]);
    expect(placeCounties("Nowhereville")).toEqual([]);
  });
});

describe("parseStreetQuery: a street with no house number", () => {
  it.each([
    ["Seaman Rd", { streetName: "SEAMAN", streetOnly: "SEAMAN RD", suffix: "RD" }],
    ["dodridge st", { streetName: "DODRIDGE", streetOnly: "DODRIDGE ST" }],
    [
      "W Dodridge Street",
      { streetName: "DODRIDGE", streetOnly: "W DODRIDGE ST", direction: "W" },
    ],
    [
      "Seaman Rd, Galloway",
      { streetName: "SEAMAN", streetOnly: "SEAMAN RD", place: "GALLOWAY" },
    ],
    [
      "Seaman Road Oregon OH 43616",
      { streetName: "SEAMAN", streetOnly: "SEAMAN RD", place: "OREGON" },
    ],
    ["5th Ave", { streetName: "5TH", streetOnly: "5TH AVE" }],
    ["Dodridge", { streetName: "DODRIDGE", streetOnly: "DODRIDGE" }],
  ])("%s", (query, expected) => {
    expect(parseStreetQuery(query)).toMatchObject({
      ...expected,
      houseNumber: "",
      outOfState: false,
    });
  });

  it("leaves a query that starts with a number to the address parser", () => {
    expect(parseStreetQuery("84 W Dodridge St")).toBeNull();
    expect(parseStreetQuery("0 Seaman Rd")).toBeNull();
    expect(parseStreetQuery("1' OR '1'='1")).toBeNull();
    expect(parseAddressQuery("Seaman Rd")).toBeNull();
  });

  it("flags another state", () => {
    expect(parseStreetQuery("Pennsylvania Ave, Washington, DC")?.outOfState).toBe(
      true,
    );
  });
});

describe("placeOnlyQuery: a city or township and nothing else", () => {
  it.each([
    ["Columbus", "COLUMBUS"],
    ["columbus, oh", "COLUMBUS"],
    ["Johnstown OH 43031", "JOHNSTOWN"],
    ["Mt Vernon", "MOUNT VERNON"],
    ["North Lima", "NORTH LIMA"],
    // A village in Adams County, and also the golden parcel's road.
    ["Seaman", "SEAMAN"],
  ])("%s is a place", (query, place) => {
    expect(placeOnlyQuery(query)).toBe(place);
  });

  it.each([
    "Seaman Rd",
    "Columbus St",
    "Dodridge St, Columbus",
    "84 W Dodridge St, Columbus",
    "Dodridge",
    "asdfqwerzzz",
    "43031",
  ])("%s is not just a place", (query) => {
    expect(placeOnlyQuery(query)).toBeNull();
  });
});

describe("siteAddressOnStreet", () => {
  it.each([
    ["0  SEAMAN RD   ", "SEAMAN"],
    ["5771 SEAMAN RD", "seaman"],
    ["7522  SEAMAN RD  TOLEDO 43616", "SEAMAN"],
    ["MAIN ST   ", "MAIN"],
    ["8804  STAGE COACH RD", "STAGE COACH"],
  ])("%s is on %s", (situs, street) =>
    expect(siteAddressOnStreet(situs, street)).toBe(true),
  );

  it.each([
    ["12 SEAMANS LN", "SEAMAN"],
    ["0  GEO WRIGHTSVILLE RD", "SEAMAN"],
    ["8804 COACH STAGE RD", "STAGE COACH"],
    [null, "SEAMAN"],
    ["5771 SEAMAN RD", ""],
  ])("%s is not on %s", (situs, street) =>
    expect(siteAddressOnStreet(situs, street)).toBe(false),
  );
});

describe("sitePlace", () => {
  it.each([
    [
      "10034 APPLETON RD JOHNSTOWN, OH 43031 JOHNSTOWN 43031",
      "APPLETON",
      "JOHNSTOWN",
      "named",
    ],
    [
      "123 MAIN ST PATASKALA, OH 43062 PATASKALA 43062",
      "MAIN",
      "JOHNSTOWN",
      "other",
    ],
    ["84 W DODRIDGE ST", "DODRIDGE", "COLUMBUS", "absent"],
    ["84 W DODRIDGE ST UNIT 2", "DODRIDGE", "COLUMBUS", "absent"],
    ["7511  DAVIS-KIRK RD  PROSPECT 43342", "DAVIS-KIRK", "PROSPECT", "named"],
  ] as const)("%s for %s", (situs, street, place, expected) => {
    expect(sitePlace(situs, street, place)).toBe(expected);
  });
});

describe("siteAddressMatches", () => {
  it.each([
    ["84 W DODRIDGE ST", "84", "DODRIDGE"],
    ["7511  DAVIS-KIRK RD  PROSPECT 43342", "7511", "DAVIS-KIRK"],
    ["10034 APPLETON RD JOHNSTOWN, OH 43031", "10034", "appleton"],
    ["7738  STATE ROUTE 257 N  PROSPECT", "7738", "STATE ROUTE 257"],
  ])("%s matches %s %s", (situs, number, street) =>
    expect(siteAddressMatches(situs, number, street)).toBe(true),
  );

  it.each([
    ["184 W DODRIDGE ST", "84", "DODRIDGE"],
    ["84 W DODRIDGEVILLE RD", "84", "DODRIDGE"],
    ["DODRIDGE ST", "84", "DODRIDGE"],
    [null, "84", "DODRIDGE"],
    ["84 STATE ROUTE 2", "84", "STATE ROUTE 257"],
  ])("%j does not match %s %s", (situs, number, street) =>
    expect(siteAddressMatches(situs, number, street)).toBe(false),
  );
});

describe("toParcelSummary", () => {
  const franklin = {
    County: "Franklin",
    LocalParcelID: "010-042534",
    StateParcelID: "39049-010-042534",
    SitusAddressAll: "84 W DODRIDGE ST   ",
    LandArea: 0,
  };

  it("maps OGRIP fields to the v1 parcel and omits unrecorded acreage", () => {
    expect(toParcelSummary(franklin, centroid)).toEqual({
      key: "ohio:39049:010-042534",
      sourceParcelId: "010-042534",
      county: "Franklin",
      countyFips: "39049",
      siteAddress: "84 W Dodridge St",
      centroid,
    });
  });

  it("measures the boundary's mapped acreage from Shape__Area (square US feet)", () => {
    // The golden lot: 132,394 sq ft in OGRIP; the Auditor lists 3.015 acres.
    const summary = toParcelSummary(
      {
        ...franklin,
        LocalParcelID: "230-000918",
        StateParcelID: "39049-230-000918",
        Shape__Area: 132_394,
      },
      centroid,
    );
    expect(summary?.mappedAcreage).toBe(3.04);
    expect(summary).not.toHaveProperty("acreage");
    expect(
      toParcelSummary({ ...franklin, Shape__Area: 0 }, centroid),
    ).not.toHaveProperty("mappedAcreage");
  });

  it("keeps published acreage", () => {
    expect(
      toParcelSummary({ ...franklin, LandArea: 5.61 }, centroid)?.acreage,
    ).toBe(5.61);
  });

  it.each([
    [
      "a FIPS prefix that disagrees with the county",
      { StateParcelID: "39089-010-042534" },
    ],
    ["an unknown county", { County: "Narnia" }],
    ["a placeholder ID", { LocalParcelID: "0000000000000" }],
    ["no ID", { LocalParcelID: null }],
  ])("refuses %s", (_label, change) => {
    expect(toParcelSummary({ ...franklin, ...change }, centroid)).toBeNull();
  });
});

describe("polygonCentroid", () => {
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ];

  it("finds the center of a square in either winding", () => {
    expect(polygonCentroid({ type: "Polygon", coordinates: [square] })).toEqual(
      {
        latitude: 2,
        longitude: 2,
      },
    );
    expect(
      polygonCentroid({
        type: "Polygon",
        coordinates: [[...square].reverse()],
      }),
    ).toEqual({ latitude: 2, longitude: 2 });
  });

  it("subtracts holes and weights multipolygon parts by area", () => {
    const hole = [
      [0, 0],
      [2, 0],
      [2, 4],
      [0, 4],
      [0, 0],
    ];
    const withHole = polygonCentroid({
      type: "Polygon",
      coordinates: [square, hole],
    });
    expect(withHole?.longitude).toBeCloseTo(3);
    expect(withHole?.latitude).toBeCloseTo(2);

    const small = square.map(([x = 0, y = 0]) => [x / 2 + 10, y / 2]);
    const multi = polygonCentroid({
      type: "MultiPolygon",
      coordinates: [[square], [small]],
    });
    // Areas 16 and 4: (16*2 + 4*11) / 20.
    expect(multi?.longitude).toBeCloseTo(3.8);
  });
});

describe("polygonCentroid on real Ohio coordinates", () => {
  it("stays inside a small Franklin County lot (no float cancellation)", () => {
    // OGRIP boundary of ohio:39049:010-042534, recorded 2026-11-16.
    const ring = [
      [-83.0142782, 40.0164132],
      [-83.014393, 40.0163945],
      [-83.0144793, 40.0167287],
      [-83.014367, 40.0167465],
      [-83.0143261, 40.016593],
      [-83.0142782, 40.0164132],
    ];
    const c = polygonCentroid({ type: "Polygon", coordinates: [ring] });
    expect(c?.longitude).toBeGreaterThan(-83.0144793);
    expect(c?.longitude).toBeLessThan(-83.0142782);
    expect(c?.latitude).toBeGreaterThan(40.0163945);
    expect(c?.latitude).toBeLessThan(40.0167465);
  });
});

describe("typed direction and suffix", () => {
  it.each([
    [
      "1739 N High St, Columbus",
      {
        streetName: "HIGH",
        direction: "N",
        suffix: "ST",
        streetOnly: "1739 N HIGH ST",
      },
    ],
    [
      "1739 North High Street, Columbus",
      {
        streetName: "HIGH",
        direction: "N",
        suffix: "ST",
        streetOnly: "1739 N HIGH ST",
        abbreviated: "1739 N HIGH ST, COLUMBUS",
      },
    ],
    [
      "37 South High Street, Columbus",
      { direction: "S", suffix: "ST", abbreviated: "37 S HIGH ST, COLUMBUS" },
    ],
    [
      "7738 State Route 257 N, Prospect",
      { streetName: "STATE ROUTE 257", direction: "N" },
    ],
    ["100 North St, Columbus", { streetName: "NORTH", suffix: "ST" }],
    ["1739 High Avenue", { streetName: "HIGH", suffix: "AVE" }],
  ])("%s", (query, expected) => {
    expect(parseAddressQuery(query)).toMatchObject(expected);
  });

  it("leaves direction and suffix unset when none was typed", () => {
    const parsed = parseAddressQuery("1739 High, Columbus");
    expect(parsed?.direction).toBeUndefined();
    expect(parsed?.suffix).toBeUndefined();
    expect(parseAddressQuery("100 North St")?.direction).toBeUndefined();
    expect(parseAddressQuery("84 W Dodridge St")?.abbreviated).toBeUndefined();
  });

  it("requires the published direction to equal a typed one", () => {
    expect(
      siteAddressAgrees("1739 S HIGH ST", "HIGH", { direction: "N" }),
    ).toBe(false);
    expect(
      siteAddressAgrees("1739 N HIGH ST", "HIGH", { direction: "N" }),
    ).toBe(true);
    expect(siteAddressAgrees("1739 HIGH ST", "HIGH", { direction: "N" })).toBe(
      false,
    );
    expect(
      siteAddressAgrees(
        "7738  STATE ROUTE 257 N  PROSPECT",
        "STATE ROUTE 257",
        { direction: "N" },
      ),
    ).toBe(true);
  });

  it("accepts any direction when none was typed", () => {
    for (const situs of ["750 N HIGH ST", "750 S HIGH ST", "750 HIGH ST"]) {
      expect(siteAddressAgrees(situs, "HIGH", {})).toBe(true);
      expect(siteAddressAgrees(situs, "HIGH", { suffix: "ST" })).toBe(true);
    }
  });

  it("checks the suffix the same way, across spellings", () => {
    expect(siteAddressAgrees("1739 S HIGH ST", "HIGH", { suffix: "AVE" })).toBe(
      false,
    );
    expect(
      siteAddressAgrees("10034 APPLETON RD JOHNSTOWN, OH 43031", "APPLETON", {
        suffix: "RD",
      }),
    ).toBe(true);
    expect(siteAddressAgrees("25 MAIN AV", "MAIN", { suffix: "AVE" })).toBe(
      true,
    );
    expect(siteAddressAgrees("25 MAIN", "MAIN", { suffix: "ST" })).toBe(false);
  });
});
