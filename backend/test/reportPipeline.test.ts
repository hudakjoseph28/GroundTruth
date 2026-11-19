import { readFileSync } from "node:fs";
import type { Check, CheckKind, CheckStatus } from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { OHIO_COUNTIES } from "../src/parcels/ohioCounties.js";
import {
  createFemaFloodClient,
  NFHL_OHIO_STUDIES_QUERY,
  OHIO_COUNTIES_WITHOUT_NFHL,
  toEsriPolygon,
  type FloodOutcome,
} from "../src/reports/femaFlood.js";
import { zoneLabel } from "../src/reports/floodCheck.js";
import { NWI_OHIO_STATUS_QUERY } from "../src/reports/nwiWetlands.js";
import { effectiveDateString } from "../src/reports/mapReport.js";
import {
  biggestOpenQuestion,
  reportCoverage,
} from "../src/reports/pipeline.js";

const check = (kind: CheckKind, status: CheckStatus): Check => ({
  kind,
  status,
  finding: "",
  limitation: "",
  sources: [],
  responsibleParty: { role: "" },
  nextAction: "",
});

describe("biggestOpenQuestion", () => {
  const noSfha = { floodInSfha: false };

  it("puts an unresolved access question ahead of a resolved flood finding", () => {
    expect(
      biggestOpenQuestion(
        [check("flood", "evidenceFound"), check("access", "unknown")],
        { floodInSfha: true },
      ),
    ).toBe("access");
  });

  it("puts an unresolved septic question ahead of an unresolved flood check", () => {
    expect(
      biggestOpenQuestion(
        [check("flood", "unknown"), check("septic", "unknown")],
        noSfha,
      ),
    ).toBe("septic");
  });

  it("puts a reviewer hold ahead of everything", () => {
    expect(
      biggestOpenQuestion(
        [check("access", "unknown"), check("sellerAuthority", "held")],
        noSfha,
      ),
    ).toBe("sellerAuthority");
  });

  it("counts needsReview as unresolved", () => {
    expect(
      biggestOpenQuestion(
        [check("access", "signedOff"), check("zoning", "needsReview")],
        noSfha,
      ),
    ).toBe("zoning");
  });

  it("names flood when everything is resolved and the lot is in an SFHA", () => {
    expect(
      biggestOpenQuestion(
        [check("access", "signedOff"), check("flood", "evidenceFound")],
        { floodInSfha: true },
      ),
    ).toBe("flood");
  });

  it("falls back to the highest-priority check when nothing is open", () => {
    expect(
      biggestOpenQuestion(
        [check("survey", "signedOff"), check("septic", "signedOff")],
        noSfha,
      ),
    ).toBe("septic");
  });
});

describe("reportCoverage", () => {
  it.each([
    [["unknown", "unknown"], "boundaryOnly"],
    [["evidenceFound", "unknown"], "partial"],
    [["evidenceFound", "signedOff"], "deep"],
  ] as const)("%j is %s", (statuses, coverage) => {
    expect(reportCoverage(statuses.map((s) => check("flood", s)))).toBe(
      coverage,
    );
  });
});

describe("zoneLabel", () => {
  it.each([
    [{ zone: "AE", subtype: "FLOODWAY" }, "Zone AE (regulatory floodway)"],
    [
      { zone: "X", subtype: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD" },
      "Zone X (0.2% annual chance flood hazard)",
    ],
    [{ zone: "A" }, "Zone A"],
    [{ zone: "OPEN WATER" }, "open water"],
  ])("%j reads as %s", (zone, label) => {
    expect(zoneLabel({ specialFloodHazardArea: false, ...zone })).toBe(label);
  });
});

describe("toEsriPolygon", () => {
  // Counter-clockwise outer ring with a clockwise hole (GeoJSON RFC 7946).
  const outer = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  const hole = [
    [0.2, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
    [0.8, 0.2],
    [0.2, 0.2],
  ];

  it("winds outer rings clockwise and holes counter-clockwise, as Esri reads them", () => {
    const esri = JSON.parse(
      toEsriPolygon({ type: "Polygon", coordinates: [outer, hole] }),
    );
    expect(esri.spatialReference).toEqual({ wkid: 4326 });
    expect(esri.rings[0]).toEqual([...outer].reverse());
    expect(esri.rings[1]).toEqual([...hole].reverse());
  });

  it("keeps every part of a MultiPolygon", () => {
    const esri = JSON.parse(
      toEsriPolygon({ type: "MultiPolygon", coordinates: [[outer], [outer]] }),
    );
    expect(esri.rings).toHaveLength(2);
  });
});

/**
 * Edge cases no recorded Ohio parcel shows. These answers are built by
 * hand in FEMA's response shape to test classification only.
 */
describe("FEMA outcome classification (synthetic NFHL answers)", () => {
  const square = {
    type: "Polygon" as const,
    coordinates: [
      [
        [-83, 40],
        [-83, 40.001],
        [-82.999, 40.001],
        [-82.999, 40],
        [-83, 40],
      ],
    ],
  };
  const at = new Date("2026-11-16T12:00:00.000Z");

  function femaAnswering(byLayer: Record<number, unknown[]>) {
    return createFemaFloodClient({
      now: () => at,
      fetch: vi.fn<typeof fetch>(async (input) => {
        const layer = Number(
          /MapServer\/(\d+)\/query/.exec(String(input))?.[1],
        );
        const features = (byLayer[layer] ?? []).map((attributes) => ({
          attributes,
        }));
        return new Response(JSON.stringify({ features }));
      }),
    });
  }

  const run = (byLayer: Record<number, unknown[]>): Promise<FloodOutcome> =>
    femaAnswering(byLayer).floodZones(square, new AbortController().signal);

  it("is a conflict when FEMA lists a study but no zone covers the parcel", async () => {
    expect(await run({ 0: [{ STUDY_ID: "39049C" }] })).toEqual({
      outcome: "conflict",
      retrievedAt: at.toISOString(),
      reason: "studyWithoutZones",
    });
  });

  it("is a conflict when a zone's SFHA flag contradicts its letter", async () => {
    expect(
      await run({
        0: [{ STUDY_ID: "39049C" }],
        28: [{ FLD_ZONE: "AE", ZONE_SUBTY: null, SFHA_TF: "F" }],
      }),
    ).toMatchObject({ outcome: "conflict", reason: "sfhaFlagMismatch" });
  });

  it("is missing when the only zone is FEMA's 'area not included'", async () => {
    expect(
      await run({
        0: [{ STUDY_ID: "39049C" }],
        28: [{ FLD_ZONE: "AREA NOT INCLUDED", SFHA_TF: "F" }],
      }),
    ).toEqual({ outcome: "missing", retrievedAt: at.toISOString() });
  });

  it("notes a parcel partly outside the studied area", async () => {
    expect(
      await run({
        28: [
          { FLD_ZONE: "X", SFHA_TF: "F" },
          { FLD_ZONE: "AREA NOT INCLUDED", SFHA_TF: "F" },
        ],
      }),
    ).toMatchObject({
      outcome: "found",
      partlyNotIncluded: true,
      zones: [{ zone: "X", specialFloodHazardArea: false }],
    });
  });

  it("drops LOMRs FEMA does not list as effective, and merges duplicate zones", async () => {
    const outcome = await run({
      1: [
        { CASE_NO: "01-05-0001P", EFF_DATE: 0, STATUS: "Superseded" },
        {
          CASE_NO: "15-05-3155P",
          EFF_DATE: 1461110400000,
          STATUS: "Effective",
        },
      ],
      28: [
        { FLD_ZONE: "AE", SFHA_TF: "T" },
        { FLD_ZONE: "AE", SFHA_TF: "T" },
      ],
    });
    expect(outcome).toMatchObject({
      outcome: "found",
      zones: [{ zone: "AE", specialFloodHazardArea: true }],
      lomrs: [{ id: "15-05-3155P", effectiveDate: "2016-04-20" }],
    });
  });
});

describe("OHIO_COUNTIES_WITHOUT_NFHL", () => {
  const recording = JSON.parse(
    readFileSync(
      new URL("./fixtures/report/nfhl-ohio-studies.json", import.meta.url),
      "utf8",
    ),
  ) as {
    url: string;
    status: number;
    body: { features: { attributes: { STUDY_ID: string } }[] };
  };

  it("matches FEMA's recorded list of Ohio studies exactly", () => {
    expect(recording.url).toBe(NFHL_OHIO_STUDIES_QUERY);
    expect(recording.status).toBe(200);
    const studied = new Set(
      recording.body.features.map(({ attributes }) =>
        attributes.STUDY_ID.slice(0, 5),
      ),
    );
    const without = OHIO_COUNTIES.filter((c) => !studied.has(c.fips));

    expect(studied.size).toBe(83);
    expect(without.map((c) => c.name)).toEqual([
      "Fayette",
      "Henry",
      "Vinton",
      "Williams",
      "Wyandot",
    ]);
    expect(new Set(without.map((c) => c.fips))).toEqual(
      OHIO_COUNTIES_WITHOUT_NFHL,
    );
  });
});

describe("NWI mapping status across Ohio", () => {
  const recording = JSON.parse(
    readFileSync(
      new URL("./fixtures/report/nwi-ohio-status.json", import.meta.url),
      "utf8",
    ),
  ) as {
    url: string;
    status: number;
    body: { features: { attributes: { STATUS: string } }[] };
  };

  it("is digital everywhere it touches Ohio, so every county can get a wetland answer", () => {
    expect(recording.url).toBe(NWI_OHIO_STATUS_QUERY);
    expect(recording.status).toBe(200);
    expect(recording.body.features.length).toBeGreaterThan(0);
    expect(
      new Set(
        recording.body.features.map(({ attributes }) => attributes.STATUS),
      ),
    ).toEqual(new Set(["Digital"]));
  });
});

describe("effectiveDateString", () => {
  it("writes a midnight-UTC effective date as a calendar date", () => {
    expect(effectiveDateString(new Date(1213660800000))).toBe("2008-06-17");
  });

  it("keeps the full timestamp for any other time", () => {
    expect(effectiveDateString(new Date("2026-11-16T15:30:00.000Z"))).toBe(
      "2026-11-16T15:30:00.000Z",
    );
  });
});
