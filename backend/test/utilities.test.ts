import { readFileSync } from "node:fs";
import {
  findsNoPublicSewer,
  goldenParcel,
  NO_PUBLIC_SEWER,
  secondCountyParcel,
  type Check,
  type Parcel,
} from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { buildReport } from "../src/reports/pipeline.js";
import { utilitiesSourceTimeoutMs } from "../src/routes/report.js";
import {
  createUtilitiesClient,
  EPA_SEWERSHEDS_LAYER,
  EPA_SEWERSHED_ENDPOINTS_LAYER,
  EPA_WATER_SYSTEMS_LAYER,
  FCSE_PAGE,
  FCSE_SERVICE_AREAS_LAYER,
  MAIN_LAYERS,
  type MainLayer,
  type UtilitiesOutcome,
} from "../src/reports/utilities.js";
import {
  ADJACENT_MAIN_M,
  displayName,
  MAPS_ARE_NOT_PERMITS,
  utilitiesCheck,
} from "../src/reports/utilitiesCheck.js";

interface Exchange {
  method: string;
  url: string;
  body: string;
  status: number;
  responseBody: unknown;
}

interface Recording {
  name: string;
  parcel: Parcel;
  recordedAt: string;
  exchanges: Exchange[];
  outcome: UtilitiesOutcome;
  check: Check;
}

function load(name: string): Recording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/utilities/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as Recording;
}

/** Recorded live by scripts/record-utilities-fixtures.ts on 2026-11-19. */
const golden = load("golden-230-000918");
const dodridge = load("dodridge-010-042534");
const licking = load("licking-00500729609000");
const groveCity = load("grove-city-040-002918");

const key = (method: string, url: string, body: string) =>
  `${method} ${url}\n${body}`;

/** Serves a recording by exact request; `hang` URLs never answer. */
function replay(
  recording: Recording,
  hang: (url: string) => boolean = () => false,
) {
  const byRequest = new Map(
    recording.exchanges.map((e) => [key(e.method, e.url, e.body), e]),
  );
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (hang(url)) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }
    const recorded = byRequest.get(
      key(init?.method ?? "GET", url, String(init?.body ?? "")),
    );
    if (!recorded) throw new Error(`unrecorded request: ${url}`);
    return Response.json(recorded.responseBody, { status: recorded.status });
  });
}

async function run(
  recording: Recording,
  fetchImpl: typeof fetch,
  sourceTimeoutMs = 1_000,
) {
  const client = createUtilitiesClient({
    fetch: fetchImpl,
    now: () => new Date(recording.recordedAt),
    sourceTimeoutMs,
  });
  return client.utilities(recording.parcel, new AbortController().signal);
}

const layerUrls = (outcome: UtilitiesOutcome) =>
  outcome.mains.map((main) => main.layer.url);

describe("water and sewer maps, recorded live on 2026-11-19", () => {
  it("replays every recording to the outcome and check it produced", async () => {
    for (const recording of [golden, dodridge, licking, groveCity]) {
      const fetchImpl = replay(recording);
      const outcome = await run(recording, fetchImpl);
      expect(outcome).toEqual(recording.outcome);
      expect(fetchImpl).toHaveBeenCalledTimes(recording.exchanges.length);
      expect(utilitiesCheck(recording.parcel, outcome, 8_000)).toEqual(
        recording.check,
      );
    }
  });

  it("uses the shared fixtures for the golden and Licking parcels", () => {
    expect(golden.parcel).toEqual(goldenParcel);
    expect(licking.parcel).toEqual(secondCountyParcel);
    expect(dodridge.parcel.key).toBe("ohio:39049:010-042534");
    expect(dodridge.parcel.siteAddress).toBe("84 W Dodridge St");
    expect(groveCity.parcel.key).toBe("ohio:39049:040-002918");
  });

  it("golden parcel (rural Pleasant Twp): no mapped water or sewer, so well and septic likely; needsReview", () => {
    const { outcome, check } = golden;
    expect(outcome.waterSystems).toMatchObject({
      status: "answered",
      value: [],
    });
    expect(outcome.sewersheds).toMatchObject({ status: "answered", value: [] });
    expect(outcome.countyAreas).toMatchObject({
      status: "answered",
      value: [],
    });
    expect(outcome.mains).toEqual([]);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toBe(
      "Not inside any community water system or wastewater plant's sewershed on EPA's maps, or any Franklin County Sanitary Engineering service area. " +
        "No public water or sewer main map is published for this area, so the distance to a main wasn't measured. " +
        NO_PUBLIC_SEWER.waterAndSewer,
    );
    expect(findsNoPublicSewer(check)).toBe(true);
    expect(check.limitation.startsWith(MAPS_ARE_NOT_PERMITS)).toBe(true);
    expect(check.nextAction).toBe(
      "Ask Franklin County Sanitary Engineering for a water/sewer availability letter before you buy. If neither can reach the lot, ask Franklin County Public Health about well and septic permits.",
    );
    expect(check.responsibleParty).toEqual({
      role: "Water and sewer utility",
      organization: "Franklin County Sanitary Engineering",
      publicContactUrl: FCSE_PAGE,
    });
    expect(check.sources.map((source) => source.url)).toEqual([
      EPA_WATER_SYSTEMS_LAYER,
      EPA_SEWERSHEDS_LAYER,
      FCSE_SERVICE_AREAS_LAYER,
    ]);
  });

  it("84 W Dodridge St (Columbus): inside Columbus water and sewer areas, no main map; needsReview naming both utilities", () => {
    const { outcome, check } = dodridge;
    expect(outcome.waterSystems).toMatchObject({
      status: "answered",
      value: [
        {
          pwsid: "OH2504412",
          name: "COLUMBUS PUBLIC WATER SYSTEM",
          modeled: false,
        },
      ],
    });
    expect(outcome.sewersheds).toMatchObject({
      status: "answered",
      value: [
        {
          cwnsId: "39001792001",
          facility: "Columbus Jackson Pike WWTP & Sewers",
          authority: "Columbus Division of Sewerage and Drainage",
          modeled: false,
        },
      ],
    });
    // No city main map reaches Clintonville; Columbus publishes none.
    expect(outcome.mains).toEqual([]);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toBe(
      "Inside the Columbus Public Water System service area on EPA's community water system map. " +
        "Inside the Columbus Jackson Pike WWTP & Sewers sewershed on EPA's map. " +
        "No public water or sewer main map is published for this area, so the distance to a main wasn't measured.",
    );
    expect(findsNoPublicSewer(check)).toBe(false);
    expect(check.limitation).toContain(MAPS_ARE_NOT_PERMITS);
    expect(check.limitation).toContain(
      "Being inside a service area doesn't mean a main runs to this lot.",
    );
    expect(check.nextAction).toBe(
      "Ask the Columbus Public Water System and the Columbus Division of Sewerage and Drainage for a water and sewer availability letter and tap fees before you buy.",
    );
  });

  it("Licking parcel: no mapped water or sewer, no county sewer source; names who to ask without inventing an office", () => {
    const { outcome, check } = licking;
    expect(outcome.countyAreas).toBeNull();
    expect(check.status).toBe("needsReview");
    expect(check.finding).toBe(
      "Not inside any community water system or wastewater plant's sewershed on EPA's maps. " +
        "No public water or sewer main map is published for this area, so the distance to a main wasn't measured. " +
        NO_PUBLIC_SEWER.waterAndSewer,
    );
    expect(check.responsibleParty).toEqual({ role: "Water and sewer utility" });
    expect(check.nextAction).toBe(
      "Ask the county sanitary engineer or the nearest water and sewer utility for a water/sewer availability letter before you buy. If neither can reach the lot, ask the local health district about well and septic permits.",
    );
    expect(check.sources.map((source) => source.url)).toEqual([
      EPA_WATER_SYSTEMS_LAYER,
      EPA_SEWERSHEDS_LAYER,
    ]);
  });

  it("2534 Dartmoor Rd (Grove City): inside Columbus's water area with Grove City mains along the lot; evidenceFound", () => {
    const { outcome, check } = groveCity;
    expect(layerUrls(outcome).sort()).toEqual(
      MAIN_LAYERS.filter((layer) => layer.publisher === "City of Grove City")
        .map((layer) => layer.url)
        .sort(),
    );
    for (const main of outcome.mains) {
      expect(main.answer).toMatchObject({
        status: "answered",
        value: { owner: "City of Grove City" },
      });
      if (main.answer.status === "answered") {
        expect(main.answer.value?.distanceM).toBeLessThan(1);
      }
    }
    expect(check.status).toBe("evidenceFound");
    expect(check.finding).toBe(
      "Inside the Columbus Public Water System service area on EPA's community water system map; a public water main runs along or through the lot (City of Grove City). " +
        "Inside the Columbus Southerly WWTP & Sewers sewershed on EPA's map; a public sanitary sewer main runs along or through the lot (City of Grove City).",
    );
    expect(check.limitation).toBe(MAPS_ARE_NOT_PERMITS);
    expect(check.nextAction).toBe(
      "Ask the City of Grove City for a water and sewer availability letter and tap fees before you buy.",
    );
    expect(check.sources.map((source) => source.authority)).toEqual([
      "U.S. Environmental Protection Agency",
      "U.S. Environmental Protection Agency",
      "Franklin County Sanitary Engineering",
      "City of Grove City",
      "City of Grove City",
    ]);
  });
});

describe("each map on its own limit", () => {
  it("EPA's water map hanging leaves the sewer answer and keeps the check out of evidenceFound", async () => {
    const fetchImpl = replay(groveCity, (url) =>
      url.startsWith(EPA_WATER_SYSTEMS_LAYER),
    );
    const started = Date.now();
    const outcome = await run(groveCity, fetchImpl, 150);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(outcome.waterSystems).toEqual({
      status: "failed",
      cause: "timedOut",
    });
    expect(outcome.sewersheds.status).toBe("answered");
    const check = utilitiesCheck(groveCity.parcel, outcome, 8_000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toContain(
      "EPA's community water system map didn't answer, so the water service area wasn't checked",
    );
    expect(check.finding).toContain(
      "a public sanitary sewer main runs along or through the lot (City of Grove City)",
    );
    expect(check.sources.map((source) => source.url)).not.toContain(
      EPA_WATER_SYSTEMS_LAYER,
    );
  });

  it("a city sewer map that hangs is not a missing main: needsReview, never evidenceFound", async () => {
    const sewerLayer = MAIN_LAYERS.find(
      (layer) =>
        layer.publisher === "City of Grove City" && layer.kind === "sewer",
    ) as MainLayer;
    const fetchImpl = replay(groveCity, (url) =>
      url.startsWith(sewerLayer.url),
    );
    const outcome = await run(groveCity, fetchImpl, 150);
    const check = utilitiesCheck(groveCity.parcel, outcome, 8_000);
    expect(check.status).toBe("needsReview");
    expect(check.finding).toContain(
      "the City of Grove City's sewer map didn't answer",
    );
    expect(findsNoPublicSewer(check)).toBe(false);
  });

  it("the sewershed's utility name is optional: a failed endpoint lookup names the plant instead", async () => {
    const fetchImpl = replay(dodridge, (url) =>
      url.startsWith(EPA_SEWERSHED_ENDPOINTS_LAYER),
    );
    const outcome = await run(dodridge, fetchImpl, 150);
    expect(outcome.sewersheds).toMatchObject({
      status: "answered",
      value: [{ facility: "Columbus Jackson Pike WWTP & Sewers" }],
    });
    const check = utilitiesCheck(dodridge.parcel, outcome, 8_000);
    expect(check.nextAction).toBe(
      "Ask the Columbus Public Water System and the operator of Columbus Jackson Pike WWTP & Sewers for a water and sewer availability letter and tap fees before you buy.",
    );
  });

  it("no source answering is unknown, with no sources, naming who to ask", async () => {
    const down = vi.fn<typeof fetch>(
      async () => new Response("bad gateway", { status: 502 }),
    );
    for (const [recording, ask] of [
      [
        golden,
        "Ask Franklin County Sanitary Engineering whether public water and sewer reach the lot, and what connecting would cost.",
      ],
      [
        licking,
        "Ask the county sanitary engineer or the nearest water and sewer utility whether public water and sewer reach the lot, and what connecting would cost.",
      ],
    ] as const) {
      const outcome = await run(recording, down);
      const check = utilitiesCheck(recording.parcel, outcome, 8_000);
      expect(check.status).toBe("unknown");
      expect(check.sources).toEqual([]);
      expect(check.finding).toMatch(
        /couldn't be reached, so water and sewer service weren't checked\.$/,
      );
      expect(check.nextAction).toBe(ask);
      expect(findsNoPublicSewer(check)).toBe(false);
    }
  });

  it("all sources timing out says how long it waited", async () => {
    const fetchImpl = replay(golden, () => true);
    const outcome = await run(golden, fetchImpl, 100);
    const check = utilitiesCheck(golden.parcel, outcome, 8_000);
    expect(check.status).toBe("unknown");
    expect(check.finding).toBe(
      "EPA's water system and sewershed maps and Franklin County Sanitary Engineering's service area map didn't answer within 8 seconds, so water and sewer service weren't checked.",
    );
  });
});

describe("the utilities check in a report", () => {
  it("runs on its own limit beside the other checks and keeps a timed-out answer out of the cache", async () => {
    const hanging = replay(dodridge, () => true);
    const built = await buildReport(dodridge.parcel, {
      fema: {
        floodZones: async () => ({ outcome: "timeout", cause: "unavailable" }),
      },
      floodTimeoutMs: 500,
      utilities: createUtilitiesClient({
        fetch: hanging,
        sourceTimeoutMs: 5_000,
      }),
      utilitiesTimeoutMs: 200,
      now: () => new Date(dodridge.recordedAt),
    });
    const utilities = built.report.checks.find(
      (check) => check.kind === "utilities",
    );
    expect(utilities?.status).toBe("unknown");
    expect(utilities?.finding).toContain("didn't answer within 0.2 seconds");
    expect(built.complete).toBe(false);
  });

  it("a complete answer is cacheable and fills the utilities slot in contract order", async () => {
    const built = await buildReport(groveCity.parcel, {
      fema: {
        floodZones: async () => ({ outcome: "timeout", cause: "unavailable" }),
      },
      floodTimeoutMs: 500,
      utilities: createUtilitiesClient({
        fetch: replay(groveCity),
        now: () => new Date(groveCity.recordedAt),
      }),
      now: () => new Date(groveCity.recordedAt),
    });
    const kinds = built.report.checks.map((check) => check.kind);
    expect(kinds.indexOf("utilities")).toBe(kinds.indexOf("access") + 1);
    expect(
      built.report.checks.find((check) => check.kind === "utilities"),
    ).toEqual(groveCity.check);
  });
});

describe("wording rules", () => {
  /** The Dodridge answer with one sewer main map added at `distanceM`. */
  function withSewerMain(distanceM: number | null): UtilitiesOutcome {
    const layer = MAIN_LAYERS.find(
      (item) =>
        item.publisher === "City of Grove City" && item.kind === "sewer",
    ) as MainLayer;
    return {
      ...groveCity.outcome,
      mains: [
        ...groveCity.outcome.mains.filter(
          (main) => main.layer.kind === "water",
        ),
        {
          layer,
          answer: {
            status: "answered",
            retrievedAt: groveCity.recordedAt,
            value:
              distanceM === null
                ? null
                : { distanceM, owner: "City of Grove City" },
          },
        },
      ],
    };
  }

  it(`a sewer main counts as adjacent up to ${ADJACENT_MAIN_M} m, and farther needs review`, () => {
    const near = utilitiesCheck(
      groveCity.parcel,
      withSewerMain(ADJACENT_MAIN_M),
      8_000,
    );
    expect(near.status).toBe("evidenceFound");
    expect(near.finding).toContain(
      "nearest public sanitary sewer main about 30 m away (City of Grove City).",
    );
    const far = utilitiesCheck(groveCity.parcel, withSewerMain(143), 8_000);
    expect(far.status).toBe("needsReview");
    expect(far.finding).toContain(
      "nearest public sanitary sewer main about 140 m away (City of Grove City), so connecting may need a sewer extension.",
    );
    expect(far.limitation).toContain(MAPS_ARE_NOT_PERMITS);
  });

  it("a covering city map with no main within 500 m says so for that map only", () => {
    const none = utilitiesCheck(groveCity.parcel, withSewerMain(null), 8_000);
    expect(none.status).toBe("needsReview");
    expect(none.finding).toContain(
      "the City of Grove City's sewer map shows no public sanitary sewer main within 500 m",
    );
    // Still inside Columbus's sewershed, so this is not "no public sewer".
    expect(findsNoPublicSewer(none)).toBe(false);
  });

  it("title-cases names published in capitals and keeps acronyms", () => {
    expect(displayName("COLUMBUS PUBLIC WATER SYSTEM")).toBe(
      "Columbus Public Water System",
    );
    expect(displayName("CANAL WINCHESTER CITY PWS")).toBe(
      "Canal Winchester City PWS",
    );
    expect(displayName("MIFFLIN NO. 1")).toBe("Mifflin No. 1");
    expect(displayName("Columbus Jackson Pike WWTP & Sewers")).toBe(
      "Columbus Jackson Pike WWTP & Sewers",
    );
  });
});

describe("each map's limit follows the check's", () => {
  it("stops each map 2 s before the whole check, and never below half of it", () => {
    expect(utilitiesSourceTimeoutMs(8_000)).toBe(6_000);
    expect(utilitiesSourceTimeoutMs(3_000)).toBe(1_500);
    expect(utilitiesSourceTimeoutMs(500)).toBe(250);
  });
});
