import { readFileSync } from "node:fs";
import type { Coverage, Parcel, ParcelSearchResult } from "@groundtruth/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  createOgripClient,
  OGRIP_LOCATOR,
  OGRIP_PARCELS_LAYER,
} from "../src/parcels/ogrip.js";
import { OHIO_COUNTIES_WITHOUT_NFHL } from "../src/reports/femaFlood.js";
import {
  OGRIP_SCENARIOS,
  type OgripRecording,
  type OgripScenario,
} from "./fixtures/ogrip/scenarios.js";

function load(name: OgripScenario): OgripRecording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/ogrip/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as OgripRecording;
}

/** Serves recorded OGRIP responses by exact URL; anything else fails. */
function replay(...names: OgripScenario[]) {
  const byUrl = new Map<string, { status: number; body: unknown }>();
  for (const name of names) {
    for (const exchange of load(name).exchanges)
      byUrl.set(exchange.url, exchange);
  }
  return vi.fn<typeof fetch>(async (input) => {
    const recorded = byUrl.get(String(input));
    if (!recorded)
      throw new Error(`unrecorded OGRIP request: ${String(input)}`);
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
    });
  });
}

function appWith(
  fetchImpl: typeof fetch,
  at = new Date("2026-11-16T18:44:00.000Z"),
) {
  return createApp("test-commit", {
    ogrip: createOgripClient({
      fetch: fetchImpl,
      now: () => at,
      timeoutMs: 1_000,
    }),
  });
}

function scenarioApp(name: OgripScenario) {
  const recording = load(name);
  const fetchImpl = replay(name);
  return {
    app: appWith(fetchImpl, new Date(recording.recordedAt)),
    fetchImpl,
    recording,
  };
}

const searchUrl = (q: string) =>
  `/api/parcels/search?q=${encodeURIComponent(q)}`;
const parcelUrl = (key: string) => `/api/parcels/${encodeURIComponent(key)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/parcels/search with recorded OGRIP responses", () => {
  it("finds a Franklin County parcel by street address", async () => {
    const { app, recording } = scenarioApp("franklin-address");

    const res = await request(app).get(OGRIP_SCENARIOS["franklin-address"]);

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results[0]).toEqual({
      parcel: {
        key: "ohio:39049:010-042534",
        sourceParcelId: "010-042534",
        county: "Franklin",
        countyFips: "39049",
        siteAddress: "84 W Dodridge St",
        // OGRIP publishes no LandArea for Franklin; this is the boundary's area.
        mappedAcreage: 0.09,
        centroid: {
          latitude: expect.closeTo(40.01657, 4),
          longitude: expect.closeTo(-83.01438, 4),
        },
      },
      matchedOn: "siteAddress",
    });
    expect(res.body).toEqual(recording.apiResponse.body);
  });

  it("finds the same Franklin parcel by its published parcel ID", async () => {
    const { app } = scenarioApp("franklin-parcel-id");

    const res = await request(app).get(searchUrl("010-042534"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      parcel: { key: "ohio:39049:010-042534", county: "Franklin" },
      matchedOn: "parcelId",
    });
  });

  it("finds a Licking County parcel by street address, with published acreage", async () => {
    const { app } = scenarioApp("licking-address");

    const res = await request(app).get(OGRIP_SCENARIOS["licking-address"]);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      parcel: {
        key: "ohio:39089:00100000601000",
        sourceParcelId: "00100000601000",
        county: "Licking",
        countyFips: "39089",
        acreage: 5.61,
        mappedAcreage: 5.58,
      },
      matchedOn: "siteAddress",
    });
  });

  it("finds a Licking parcel from the auditor's dotted ID format", async () => {
    const { app } = scenarioApp("licking-parcel-id");

    const res = await request(app).get(searchUrl("001-000006-01.000"));

    expect(res.status).toBe(200);
    expect(res.body.map((r: ParcelSearchResult) => r.parcel.key)).toEqual([
      "ohio:39089:00100000601000",
    ]);
    expect(res.body[0].matchedOn).toBe("parcelId");
  });

  it.each([
    ["parcel ID", "no-match-parcel-id"],
    ["address outside Ohio", "no-match-address"],
  ] as const)(
    "returns [] for a valid %s with no match",
    async (_label, name) => {
      const { app } = scenarioApp(name);

      const res = await request(app).get(OGRIP_SCENARIOS[name]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    },
  );

  it("never returns geometry or owner mailing fields in search results", async () => {
    const { app, fetchImpl } = scenarioApp("franklin-address");

    const res = await request(app).get(OGRIP_SCENARIOS["franklin-address"]);

    expect(JSON.stringify(res.body)).not.toMatch(/mail|geometry/i);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).not.toMatch(/mail/i);
    }
  });

  it("drops mailing fields even if OGRIP sends them unasked", async () => {
    const recorded = load("franklin-parcel-id").exchanges[0];
    const body = structuredClone(recorded?.body) as {
      features: { attributes: Record<string, unknown> }[];
    };
    for (const feature of body.features) {
      feature.attributes.MailAddressAll = "PO BOX 1 SECRET OH";
    }
    const app = appWith(async () => new Response(JSON.stringify(body)));

    const res = await request(app).get(searchUrl("010-042534"));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");
  });
});

describe("GET /api/parcels/search validation", () => {
  it.each([
    ["missing", "/api/parcels/search"],
    ["too short", searchUrl("ab")],
    ["short after trimming", searchUrl("   ab   ")],
    ["too long", searchUrl("1".repeat(121))],
    ["repeated", "/api/parcels/search?q=010-042534&q=84%20Main"],
  ])("rejects a %s query with 400 and no OGRIP call", async (_label, url) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(appWith(fetchImpl)).get(url);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts exactly 3 and 120 characters", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ candidates: [], features: [] })),
    );
    const app = appWith(fetchImpl);

    expect((await request(app).get(searchUrl("a1b"))).status).toBe(200);
    expect(
      (await request(app).get(searchUrl(`1 ${"a".repeat(118)}`))).status,
    ).toBe(200);
  });

  it("sends an address with quotes to the locator, never into a parcel query", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ candidates: [] })),
    );

    const res = await request(appWith(fetchImpl)).get(
      searchUrl("1' OR '1'='1"),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(
      new RegExp(`^${OGRIP_LOCATOR}/findAddressCandidates\\?`),
    );
  });
});

describe("GET /api/parcels/:parcelKey with recorded OGRIP responses", () => {
  it.each([
    ["Franklin", "franklin-parcel", "ohio:39049:010-042534"],
    ["Licking", "licking-parcel", "ohio:39089:00100000601000"],
  ] as const)(
    "returns the published %s boundary with its source",
    async (_county, name, key) => {
      const { app, recording } = scenarioApp(name);

      const res = await request(app).get(parcelUrl(key));

      expect(res.status).toBe(200);
      const parcel = res.body as Parcel;
      expect(parcel.key).toBe(key);
      expect(parcel.geometry.authority).toBe("Ohio OGRIP");
      expect(parcel.geometry.sourceUrl).toBe(recording.exchanges[0]?.url);
      expect(
        parcel.geometry.sourceUrl.startsWith(`${OGRIP_PARCELS_LAYER}/query?`),
      ).toBe(true);
      expect(parcel.geometry.retrievedAt).toBe(recording.recordedAt);
      expect(["Polygon", "MultiPolygon"]).toContain(
        parcel.geometry.geojson.type,
      );

      const points = parcel.geometry.geojson.coordinates.flat(3);
      const lons = points.filter((_, i) => i % 2 === 0);
      const lats = points.filter((_, i) => i % 2 === 1);
      expect(parcel.centroid.longitude).toBeGreaterThan(Math.min(...lons));
      expect(parcel.centroid.longitude).toBeLessThan(Math.max(...lons));
      expect(parcel.centroid.latitude).toBeGreaterThan(Math.min(...lats));
      expect(parcel.centroid.latitude).toBeLessThan(Math.max(...lats));
      expect(JSON.stringify(parcel)).not.toMatch(/mail/i);
      expect(res.body).toEqual(recording.apiResponse.body);
    },
  );

  it("returns 404 when OGRIP has no such parcel in the county", async () => {
    const { app } = scenarioApp("missing-parcel");

    const res = await request(app).get(parcelUrl("ohio:39049:999-999999"));

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Ohio's parcel map has no parcel 999-999999 in Franklin County.",
      retryable: false,
    });
  });

  it.each([
    ["no ohio prefix", "39049:010-042534"],
    ["short county code", "ohio:3904:010-042534"],
    ["empty parcel id", "ohio:39049:"],
    ["path characters", "ohio:39049:../etc"],
    ["spaces", "ohio:39049:010 042534"],
  ])(
    "rejects a malformed key (%s) without calling OGRIP",
    async (_label, key) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const res = await request(appWith(fetchImpl)).get(parcelUrl(key));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("answers NO_COVERAGE for a county code outside Ohio's 88", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(appWith(fetchImpl)).get(
      parcelUrl("ohio:39177:123"),
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_COVERAGE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats a shared all-zero placeholder ID as not found", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const res = await request(appWith(fetchImpl)).get(
      parcelUrl("ohio:39089:0000000000000"),
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("OGRIP failures", () => {
  /** A request that only ends when its abort signal fires. */
  const hang: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      );
    });

  it.each([
    ["parcel-ID search", searchUrl("010-042534")],
    ["address search", searchUrl("84 W Dodridge St")],
    ["parcel", parcelUrl("ohio:39049:010-042534")],
    ["coverage", "/api/coverage"],
  ])(
    "a timeout on %s is a retryable PROVIDER_TIMEOUT, not a result",
    async (_label, url) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const app = createApp("test-commit", {
        ogrip: createOgripClient({ fetch: hang, timeoutMs: 20 }),
      });

      const res = await request(app).get(url);

      expect(res.status).toBe(504);
      expect(res.body).toEqual({
        error: {
          code: "PROVIDER_TIMEOUT",
          message:
            "Ohio's parcel service did not answer in time. Try again in a moment.",
          requestId: res.headers["x-request-id"],
          retryable: true,
        },
      });
    },
  );

  it("times out a search whose later requests would run past the budget", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recorded = load("johnstown-no-such-address").exchanges;
    const slow = vi.fn<typeof fetch>(async (input, init) => {
      const exchange = recorded.find((e) => e.url === String(input));
      await new Promise((resolve) => setTimeout(resolve, 35));
      if (init?.signal?.aborted) throw init.signal.reason;
      return new Response(JSON.stringify(exchange?.body));
    });
    // Locator, 500 m box, then 1,500 m box: each fits in 40 ms, but three
    // in a row exceed the 80 ms budget.
    const app = createApp("test-commit", {
      ogrip: createOgripClient({ fetch: slow, timeoutMs: 40 }),
    });

    const res = await request(app).get(
      OGRIP_SCENARIOS["johnstown-no-such-address"],
    );

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe("PROVIDER_TIMEOUT");
  });

  it.each([
    [
      "the connection fails",
      async () => Promise.reject(new TypeError("fetch failed")),
    ],
    [
      "OGRIP answers HTTP 500",
      async () => new Response("oops", { status: 500 }),
    ],
    [
      "ArcGIS reports a query error",
      async () =>
        new Response(JSON.stringify({ error: { code: 400, message: "bad" } })),
    ],
    ["the body is not JSON", async () => new Response("<html>")],
  ] as [string, typeof fetch][])(
    "%s: a retryable 502, not a result",
    async (_label, fetchImpl) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await request(appWith(fetchImpl)).get(
        searchUrl("010-042534"),
      );

      expect(res.status).toBe(502);
      expect(res.body.error).toMatchObject({
        code: "INTERNAL_ERROR",
        message:
          "Ohio's parcel service could not be reached. Try again in a moment.",
        retryable: true,
      });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("OgripUnavailableError"),
      );
    },
  );
});

describe("GET /api/coverage", () => {
  it("lists only counties measured in OGRIP, with flood where FEMA has a study and zoning in Franklin", async () => {
    const { app, fetchImpl, recording } = scenarioApp("coverage");

    const res = await request(app).get("/api/coverage");
    const again = await request(app).get("/api/coverage");

    expect(res.status).toBe(200);
    const rows = res.body as Coverage[];
    expect(rows).toHaveLength(88);
    expect(rows.find((row) => row.county === "Franklin")).toEqual({
      county: "Franklin",
      countyFips: "39049",
      boundarySearchable: true,
      evidenceKinds: ["zoning", "flood"],
      lastVerifiedAt: recording.recordedAt,
    });
    expect(rows.find((row) => row.county === "Licking")?.countyFips).toBe(
      "39089",
    );
    expect(again.body).toEqual(res.body);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("parcel key rule: ohio:<countyFips>:<LocalParcelID exactly as published>", () => {
  it.each([
    ["franklin-parcel-id", "39049"],
    ["licking-parcel-id-published", "39089"],
  ] as const)(
    "%s keys the recorded LocalParcelID unchanged",
    async (name, fips) => {
      const { app, recording } = scenarioApp(name);
      const published = (
        recording.exchanges[0]?.body as {
          features: { attributes: { LocalParcelID: string } }[];
        }
      ).features.map((f) => f.attributes.LocalParcelID);

      const res = await request(app).get(OGRIP_SCENARIOS[name]);

      expect(res.status).toBe(200);
      for (const result of res.body as ParcelSearchResult[]) {
        expect(published).toContain(result.parcel.sourceParcelId);
        expect(result.parcel.key).toBe(
          `ohio:${fips}:${result.parcel.sourceParcelId}`,
        );
      }
    },
  );
});

describe("parcel ID search with or without punctuation", () => {
  it.each([
    ["franklin-parcel-id", "ohio:39049:010-042534"],
    ["franklin-parcel-id-compact", "ohio:39049:010-042534"],
    ["franklin-parcel-id-spaced", "ohio:39049:010-042534"],
    ["licking-parcel-id-published", "ohio:39089:00100000601000"],
    ["licking-parcel-id", "ohio:39089:00100000601000"],
  ] as const)("%s finds %s", async (name, key) => {
    const { app } = scenarioApp(name);

    const res = await request(app).get(OGRIP_SCENARIOS[name]);

    expect(res.status).toBe(200);
    expect(res.body.map((r: ParcelSearchResult) => r.parcel.key)).toEqual([
      key,
    ]);
    expect(res.body[0].matchedOn).toBe("parcelId");
  });
});

describe("address search fallbacks", () => {
  const steps = (recording: OgripRecording) =>
    recording.exchanges.map(({ url }) => {
      const params = new URL(url).searchParams;
      if (url.startsWith(OGRIP_LOCATOR))
        return `locator:${params.get("SingleLine")}`;
      // Box queries also filter on SitusAddressAll, by house number.
      if (params.has("geometry")) return "box";
      if (params.get("where")?.includes("SitusAddressAll LIKE"))
        return "siteAddress";
      return "other";
    });

  it.each([
    ["licking-address-no-zip", "ohio:39089:00100000601000"],
    ["licking-address-city-comma", "ohio:39089:00100000601000"],
  ] as const)(
    "%s: retries the locator with only number + street when the city is rejected",
    async (name, key) => {
      const { app, recording } = scenarioApp(name);

      const res = await request(app).get(OGRIP_SCENARIOS[name]);

      expect(res.status).toBe(200);
      expect(res.body.map((r: ParcelSearchResult) => r.parcel.key)).toEqual([
        key,
      ]);
      expect(steps(recording)).toEqual([
        `locator:${decodeURIComponent(OGRIP_SCENARIOS[name].split("q=")[1] ?? "")}`,
        "locator:10034 APPLETON RD",
        "box",
      ]);
    },
  );

  it("finds a Main St address in Johnstown without a ZIP", async () => {
    const { app } = scenarioApp("licking-main-st-no-zip");

    const res = await request(app).get(
      OGRIP_SCENARIOS["licking-main-st-no-zip"],
    );

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      parcel: {
        key: "ohio:39089:05317758800000",
        siteAddress: "57 S Main St, Johnstown, OH 43031",
      },
      matchedOn: "siteAddress",
    });
    // OGRIP publishes this lot as two polygons (4,906 and 4,148 sq ft). One
    // part's area is not the lot's, so search leaves the mapped area out.
    expect(res.body[0].parcel.acreage).toBe(0.23);
    expect(res.body[0].parcel).not.toHaveProperty("mappedAcreage");
  });

  it("returns [] for 123 Main St, Johnstown: the street exists, the parcel does not", async () => {
    const { app, recording } = scenarioApp("johnstown-no-such-address");

    const res = await request(app).get(
      OGRIP_SCENARIOS["johnstown-no-such-address"],
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    // 123 MAIN ST in Pataskala, Utica, and Alexandria are not offered, and
    // the slow site-address scan is skipped because the locator knew the street.
    expect(steps(recording)).not.toContain("siteAddress");
  });

  it("matches SitusAddressAll in the city's county when the locator is down", async () => {
    const { app, recording } = scenarioApp("locator-down-with-city");

    const res = await request(app).get(
      OGRIP_SCENARIOS["locator-down-with-city"],
    );

    expect(res.status).toBe(200);
    expect(res.body.map((r: ParcelSearchResult) => r.parcel.key)).toEqual([
      "ohio:39089:05317758800000",
    ]);
    expect(recording.exchanges[0]).toMatchObject({
      status: 503,
      forcedFailure: true,
    });
    expect(steps(recording)).toEqual([
      "locator:57 S Main St, Johnstown",
      "siteAddress",
    ]);
    expect(
      new URL(recording.exchanges[1]?.url ?? "").searchParams.get("where"),
    ).toBe("County IN ('Licking') AND SitusAddressAll LIKE '57 %MAIN%'");
  });

  it("reports the outage when the locator is down and no city narrows the search", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = scenarioApp("locator-down-without-city");

    const res = await request(app).get(
      OGRIP_SCENARIOS["locator-down-without-city"],
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: true,
    });
  });
});

describe("house number 0: lots with no assigned address (recorded live)", () => {
  const GOLDEN = "ohio:39049:230-000918";
  const locatorQueries = (recording: OgripRecording) =>
    recording.exchanges.flatMap(({ url }) =>
      url.startsWith(OGRIP_LOCATOR)
        ? [new URL(url).searchParams.get("SingleLine")]
        : [],
    );

  it("finds the golden parcel's published 0 SEAMAN RD by locating the street", async () => {
    const { app, recording } = scenarioApp("seaman-0");

    const res = await request(app).get(OGRIP_SCENARIOS["seaman-0"]);

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results.map((r) => r.parcel.key)).toContain(GOLDEN);
    // Franklin publishes seven 0 SEAMAN RD lots; each is a real match.
    for (const { parcel } of results) {
      expect(parcel.siteAddress).toMatch(/^0 Seaman Rd\b/);
    }
    // The locator has no point for house number 0, so it is never asked
    // for one: only for the street.
    expect(locatorQueries(recording)).toEqual(["SEAMAN RD"]);
    for (const { url } of recording.exchanges) {
      const where = new URL(url).searchParams.get("where");
      if (where) expect(where).toContain("SitusAddressAll LIKE '0 %'");
    }
  });

  it("retries without a city the locator does not hold, and keeps only lots that fit it", async () => {
    const { app, recording } = scenarioApp("seaman-0-galloway");

    const res = await request(app).get(OGRIP_SCENARIOS["seaman-0-galloway"]);

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results.map((r) => r.parcel.key)).toContain(GOLDEN);
    // 0 SEAMAN RD OREGON 43616 names another city, so it is dropped.
    expect(results.every((r) => r.parcel.countyFips === "39049")).toBe(true);
    expect(locatorQueries(recording)).toEqual([
      "SEAMAN RD, GALLOWAY",
      "SEAMAN RD",
    ]);
  });

  /** The seaman-0 recording, with chosen box queries answering 503. */
  function seamanWithFailingBoxes(fails: (body: unknown) => boolean) {
    const recorded = replay("seaman-0");
    const failing = new Set(
      load("seaman-0")
        .exchanges.filter(
          ({ url, body }) =>
            new URL(url).searchParams.has("geometry") && fails(body),
        )
        .map(({ url }) => url),
    );
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) =>
      failing.has(String(input))
        ? new Response("{}", { status: 503 })
        : recorded(input, init),
    );
    return { app: appWith(fetchImpl), failing };
  }

  it("keeps the lots it found when a box on another street fails", async () => {
    // Every box except the one that holds the golden parcel fails.
    const { app, failing } = seamanWithFailingBoxes(
      (body) => !JSON.stringify(body).includes("230-000918"),
    );
    expect(failing.size).toBeGreaterThan(0);

    const res = await request(app).get(OGRIP_SCENARIOS["seaman-0"]);

    expect(res.status).toBe(200);
    expect(
      (res.body as ParcelSearchResult[]).map((r) => r.parcel.key),
    ).toContain(GOLDEN);
  });

  it("reports the failure when every box fails, instead of answering no match", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = seamanWithFailingBoxes(() => true);

    const res = await request(app).get(OGRIP_SCENARIOS["seaman-0"]);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ retryable: true });
  });

  it("reports a locator outage instead of answering no match", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = scenarioApp("seaman-0-locator-down");

    const res = await request(app).get(
      OGRIP_SCENARIOS["seaman-0-locator-down"],
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ retryable: true });
  });
});

describe("a street with no house number (recorded live)", () => {
  const boxWheres = (recording: OgripRecording) =>
    recording.exchanges.flatMap(({ url }) => {
      const params = new URL(url).searchParams;
      return params.has("geometry") ? [params.get("where") ?? ""] : [];
    });
  const locatorQueries = (recording: OgripRecording) =>
    recording.exchanges.flatMap(({ url }) =>
      url.startsWith(OGRIP_LOCATOR)
        ? [new URL(url).searchParams.get("SingleLine")]
        : [],
    );

  it("returns up to ten lots on Seaman Rd, each with its address, from every street of that name", async () => {
    const { app, recording } = scenarioApp("street-seaman-rd");

    const res = await request(app).get(OGRIP_SCENARIOS["street-seaman-rd"]);

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result.matchedOn).toBe("siteAddress");
      expect(result.parcel.siteAddress).toMatch(/^\d+ Seaman Rd(,|$)/);
      expect(result.parcel).not.toHaveProperty("geometry");
    }
    expect(new Set(results.map((r) => r.parcel.key)).size).toBe(10);
    // Seaman Rd is several streets: the golden parcel's in Franklin County,
    // and others in Adams and Lucas. Each is represented, in turn.
    expect(new Set(results.map((r) => r.parcel.county))).toEqual(
      new Set(["Adams", "Franklin", "Lucas"]),
    );
    expect(results.slice(0, 3).map((r) => r.parcel.county)).toEqual([
      "Adams",
      "Franklin",
      "Lucas",
    ]);
    // One locator request for the street, never one for a house number.
    expect(locatorQueries(recording)).toEqual(["SEAMAN RD"]);
    for (const where of boxWheres(recording)) {
      expect(where).toBe(
        "LocalParcelID IS NOT NULL AND SitusAddressAll LIKE '%SEAMAN%'",
      );
    }
    expect(res.body).toEqual(recording.apiResponse.body);
  });

  it("returns the lots on Dodridge St, the Franklin address parcel among them", async () => {
    const { app, recording } = scenarioApp("street-dodridge-st");

    const res = await request(app).get(OGRIP_SCENARIOS["street-dodridge-st"]);

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results).toHaveLength(10);
    expect(results.map((r) => r.parcel.key)).toContain("ohio:39049:010-042534");
    for (const { parcel } of results) {
      expect(parcel.county).toBe("Franklin");
      expect(parcel.siteAddress).toMatch(/^\d+ W Dodridge St$/);
    }
    // One street of that name, so one box.
    expect(recording.exchanges).toHaveLength(2);
  });

  it("keeps a typed city out of the results it contradicts", async () => {
    const { app, recording } = scenarioApp("street-seaman-rd-galloway");

    const res = await request(app).get(
      OGRIP_SCENARIOS["street-seaman-rd-galloway"],
    );

    expect(res.status).toBe(200);
    const results = res.body as ParcelSearchResult[];
    expect(results.length).toBeGreaterThan(0);
    // The Lucas County lots publish Toledo or Oregon, so they are dropped.
    // Adams and Franklin publish no city for these lots, and Galloway is not
    // in the Census place table, so those cannot be ruled out and stay.
    expect(results.some((r) => r.parcel.county === "Lucas")).toBe(false);
    expect(results.some((r) => r.parcel.county === "Franklin")).toBe(true);
    for (const { parcel } of results) {
      expect(parcel.siteAddress).not.toMatch(/Toledo|Oregon/);
    }
    // With the city first, then without it: the locator holds no Galloway
    // for this street.
    expect(locatorQueries(recording)).toEqual([
      "SEAMAN RD, GALLOWAY",
      "SEAMAN RD",
    ]);
  });

  it("tells Seaman Rd, Seaman St, and Seaman Dr apart by the typed suffix", async () => {
    // The recorded boxes also hold lots on Seaman St (Oregon, Curtice) and
    // Seaman Dr (Dayton). None of them answers "Seaman Rd" (checked above:
    // every result reads "Seaman Rd"). Asked for "Seaman St" over the same
    // recorded boxes, only the Seaman St lots come back.
    const recorded = load("street-seaman-rd");
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const match = recorded.exchanges.find((exchange) => {
        const saved = new URL(exchange.url);
        return String(input).startsWith(OGRIP_LOCATOR)
          ? exchange.url.startsWith(OGRIP_LOCATOR)
          : saved.searchParams.get("geometry") ===
              url.searchParams.get("geometry");
      });
      if (!match) throw new Error(`unrecorded OGRIP request: ${String(input)}`);
      return new Response(JSON.stringify(match.body), { status: match.status });
    });

    const res = await request(appWith(fetchImpl)).get(searchUrl("Seaman St"));

    expect(res.status).toBe(200);
    const addresses = (res.body as ParcelSearchResult[])
      .map((r) => r.parcel.siteAddress)
      .sort();
    expect(addresses).toEqual([
      "2601 Seaman St, Oregon, OH 43616",
      "2605 Seaman St, Oregon, OH 43616",
      "8808 Seaman St, Curtice, OH 43412",
    ]);
  });

  it("reports a locator outage instead of answering no match", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = scenarioApp("street-seaman-rd-locator-down");

    const res = await request(app).get(
      OGRIP_SCENARIOS["street-seaman-rd-locator-down"],
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ retryable: true });
  });

  it("answers [] for a street name the locator does not hold", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ candidates: [] })),
    );

    const res = await request(appWith(fetchImpl)).get(searchUrl("asdfqwerzzz"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    // One locator request, and no parcel query.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(
      new RegExp(`^${OGRIP_LOCATOR}/findAddressCandidates\\?`),
    );
  });
});

describe("a city or township alone", () => {
  it.each(["Columbus", "columbus, oh", "Johnstown OH 43031", "Mt Vernon"])(
    "asks %s for a street or parcel ID, with no OGRIP call",
    async (query) => {
      const fetchImpl = vi.fn<typeof fetch>();

      const res = await request(appWith(fetchImpl)).get(searchUrl(query));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: "INVALID_REQUEST",
        retryable: false,
      });
      expect(res.body.error.message).toContain(query);
      expect(res.body.error.message).toMatch(/street name or a full address/);
      expect(res.body.error.message).toMatch(/parcel ID/);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("still searches a street that shares a city's name", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ candidates: [] })),
    );

    const res = await request(appWith(fetchImpl)).get(
      searchUrl("Columbus St"),
    );

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("coverage claims only what was measured", () => {
  it("every row claims a searchable boundary, flood only where NFHL has a study, zoning only in Franklin, and the count's time", async () => {
    const { app, recording } = scenarioApp("coverage");

    const rows = (await request(app).get("/api/coverage")).body as Coverage[];

    expect(rows).toHaveLength(88);
    expect(
      rows.filter((row) => row.evidenceKinds.length === 0).map((r) => r.county),
    ).toEqual(["Fayette", "Henry", "Vinton", "Williams", "Wyandot"]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "boundarySearchable",
        "county",
        "countyFips",
        "evidenceKinds",
        "lastVerifiedAt",
      ]);
      expect(row.boundarySearchable).toBe(true);
      expect(row.evidenceKinds).toEqual([
        ...(row.countyFips === "39049" ? ["zoning"] : []),
        ...(OHIO_COUNTIES_WITHOUT_NFHL.has(row.countyFips) ? [] : ["flood"]),
      ]);
      expect(row.lastVerifiedAt).toBe(recording.recordedAt);
    }
  });

  it("reports a zero count as not searchable, omits unmeasured counties, and keeps the measured time while cached", async () => {
    let at = new Date("2026-11-17T00:00:00.000Z");
    const stats = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            features: [
              { attributes: { County: "Franklin", parcels: 454000 } },
              { attributes: { County: "Licking", parcels: 0 } },
            ],
          }),
        ),
    );
    const app = createApp("test-commit", {
      ogrip: createOgripClient({ fetch: stats, now: () => at }),
    });

    const first = (await request(app).get("/api/coverage")).body as Coverage[];
    at = new Date("2026-11-17T00:30:00.000Z");
    const cached = (await request(app).get("/api/coverage")).body as Coverage[];
    at = new Date("2026-11-17T01:01:00.000Z");
    const remeasured = (await request(app).get("/api/coverage"))
      .body as Coverage[];

    expect(first.map((row) => [row.county, row.boundarySearchable])).toEqual([
      ["Franklin", true],
      ["Licking", false],
    ]);
    expect(cached[0]?.lastVerifiedAt).toBe("2026-11-17T00:00:00.000Z");
    expect(remeasured[0]?.lastVerifiedAt).toBe("2026-11-17T01:01:00.000Z");
    expect(stats).toHaveBeenCalledTimes(2);
  });
});

describe("street direction in address search (recorded live)", () => {
  const keys = (body: unknown) =>
    (body as ParcelSearchResult[]).map((r) => r.parcel.key).sort();
  const N750 = "ohio:39049:010-028040";
  const S750 = "ohio:39049:010-020912";

  it("does not answer 1739 N High St with 1739 S High St", async () => {
    const { app } = scenarioApp("high-1739-north");
    const res = await request(app).get(OGRIP_SCENARIOS["high-1739-north"]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("finds 1739 S High St when S is typed", async () => {
    const { app } = scenarioApp("high-1739-south");
    const res = await request(app).get(OGRIP_SCENARIOS["high-1739-south"]);
    expect(keys(res.body)).toEqual(["ohio:39049:010-026093"]);
    expect(res.body[0].parcel.siteAddress).toBe("1739 S High St");
  });

  it("treats a spelled-out North like N", async () => {
    const { app } = scenarioApp("high-1739-north-spelled");
    const res = await request(app).get(
      OGRIP_SCENARIOS["high-1739-north-spelled"],
    );
    expect(res.body).toEqual([]);

    const spelled = scenarioApp("high-750-north-spelled");
    const found = await request(spelled.app).get(
      OGRIP_SCENARIOS["high-750-north-spelled"],
    );
    expect(keys(found.body)).toEqual([N750]);
  });

  it("returns both N and S when no direction is typed", async () => {
    const { app } = scenarioApp("high-750-no-direction");
    const res = await request(app).get(
      OGRIP_SCENARIOS["high-750-no-direction"],
    );
    expect(keys(res.body)).toEqual([N750, S750].sort());
  });

  it("returns only N when N is typed and both exist", async () => {
    const { app } = scenarioApp("high-750-north");
    const res = await request(app).get(OGRIP_SCENARIOS["high-750-north"]);
    expect(keys(res.body)).toEqual([N750]);
  });

  it("filters box queries by house number and asks for no geometry", () => {
    for (const name of [
      "high-1739-north",
      "high-750-no-direction",
      "franklin-address",
    ] as const) {
      for (const { url } of load(name).exchanges) {
        const params = new URL(url).searchParams;
        if (!params.has("geometry")) continue;
        expect(params.get("where")).toMatch(/SitusAddressAll LIKE '\d+ %'/);
        expect(params.get("returnGeometry")).toBe("false");
        expect(params.get("returnCentroid")).toBe("true");
      }
    }
  });
});

describe("hedged OGRIP requests", () => {
  it("sends a second copy of a stalled request and uses whichever answers", async () => {
    const recorded = load("franklin-parcel-id").exchanges[0];
    let calls = 0;
    const aborted: boolean[] = [];
    const stallFirst = vi.fn<typeof fetch>(async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted.push(true);
            reject(init.signal?.reason);
          });
        });
      }
      return new Response(JSON.stringify(recorded?.body));
    });
    const app = createApp("test-commit", {
      ogrip: createOgripClient({
        fetch: stallFirst,
        timeoutMs: 2_000,
        hedgeAfterMs: 30,
      }),
    });

    const started = Date.now();
    const res = await request(app).get(searchUrl("010-042534"));

    expect(res.status).toBe(200);
    expect(res.body[0].parcel.key).toBe("ohio:39049:010-042534");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(stallFirst).toHaveBeenCalledTimes(2);
    expect(aborted).toEqual([true]);
  });

  it("does not hedge when the per-request limit is too short to allow it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const app = createApp("test-commit", {
      ogrip: createOgripClient({
        fetch: hang,
        timeoutMs: 50,
        hedgeAfterMs: 30,
      }),
    });

    const res = await request(app).get(searchUrl("010-042534"));

    expect(res.status).toBe(504);
    expect(hang).toHaveBeenCalledTimes(1);
  });
});
