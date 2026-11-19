import { readFileSync } from "node:fs";
import {
  goldenParcel,
  secondCountyParcel,
  type Parcel,
  type ParcelReport,
} from "@groundtruth/shared";
import { describe, expect, it, vi } from "vitest";
import { septicCheck } from "../src/reports/septicCheck.js";
import {
  createSsurgoSoilsClient,
  LIVING_ATLAS_SOILS_LAYER,
  LIVING_ATLAS_SOILS_QUERY,
  SDA_POST_REST,
  type SoilsOutcome,
} from "../src/reports/ssurgoSoils.js";

interface Exchange {
  url: string;
  method: string;
  body: string;
  status: number;
  responseBody: unknown;
}

interface SsurgoRecording {
  parcelKey: string;
  sourceParcelId: string;
  recordedAt: string;
  exchanges: Exchange[];
  outcome: Extract<SoilsOutcome, { outcome: "found" }>;
}

interface OutageFixture {
  recordedAt: string;
  response: { status: number; body: string };
}

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/ssurgo/${name}`, import.meta.url), "utf8"),
  ) as T;
}

const franklin = readFixture<SsurgoRecording>("franklin-230-000918.json");
const licking = readFixture<SsurgoRecording>("licking-00500729609000.json");
const outage = readFixture<OutageFixture>("sda-502-2026-11-18.json");

function toResponse(exchange: Pick<Exchange, "status" | "responseBody">) {
  return typeof exchange.responseBody === "string"
    ? new Response(exchange.responseBody, { status: exchange.status })
    : Response.json(exchange.responseBody, { status: exchange.status });
}

/** Replays a recording's exchanges in order, checking each request URL. */
function replay(recording: SsurgoRecording) {
  let next = 0;
  return vi.fn<typeof fetch>(async (input) => {
    const exchange = recording.exchanges[next++];
    if (!exchange || exchange.url !== String(input)) {
      throw new Error(`unexpected request ${String(input)}`);
    }
    return toResponse(exchange);
  });
}

function sdaOutage() {
  return new Response(outage.response.body, { status: outage.response.status });
}

function livingAtlasAnswer(recording: SsurgoRecording) {
  const exchange = recording.exchanges.find(
    (e) => e.url === LIVING_ATLAS_SOILS_QUERY,
  );
  if (!exchange) throw new Error("recording has no Living Atlas answer");
  return toResponse(exchange);
}

async function run(
  parcel: Parcel,
  fetchImpl: typeof fetch,
  options: { sdaBudgetMs?: number; signal?: AbortSignal } = {},
) {
  const client = createSsurgoSoilsClient({
    fetch: fetchImpl,
    now: () => new Date(franklin.recordedAt),
    sdaBudgetMs: options.sdaBudgetMs,
  });
  return client.septicSuitability(
    parcel.geometry.geojson,
    options.signal ?? new AbortController().signal,
  );
}

/** Area math differs across platforms in the last float digits. */
function recordedOutcome(recording: SsurgoRecording) {
  return {
    ...recording.outcome,
    mapUnits: recording.outcome.mapUnits.map((unit) => ({
      ...unit,
      share: expect.closeTo(unit.share, 9),
    })),
  };
}

const shares = (outcome: SoilsOutcome) =>
  outcome.outcome === "found"
    ? outcome.mapUnits.map((unit) => [
        unit.mukey,
        unit.symbol,
        unit.rating,
        Number(unit.share.toFixed(4)),
      ])
    : [];

describe("SSURGO septic ratings, recorded live on 2026-11-19", () => {
  it("replays the golden parcel: SDA 502, then real Living Atlas map units and shares", async () => {
    expect(franklin.sourceParcelId).toBe("230-000918");
    expect(franklin.exchanges.map((e) => [e.url, e.status])).toEqual([
      [SDA_POST_REST, 502],
      [LIVING_ATLAS_SOILS_QUERY, 200],
    ]);

    const fetchImpl = replay(franklin);
    const outcome = await run(goldenParcel, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual(recordedOutcome(franklin));
    expect(outcome).toMatchObject({ outcome: "found", source: "livingAtlas" });
    expect(shares(outcome)).toEqual([
      ["167909", "Ko", "Very limited", 0.4605],
      ["167891", "CrB", "Very limited", 0.3831],
      ["167885", "CeB2", "Very limited", 0.1564],
    ]);
  });

  it("replays the Licking parcel the same way", async () => {
    expect(licking.sourceParcelId).toBe("00500729609000");
    const outcome = await run(secondCountyParcel, replay(licking));

    expect(outcome).toEqual({
      ...recordedOutcome(licking),
      retrievedAt: franklin.recordedAt,
    });
    expect(shares(outcome)).toEqual([
      ["171015", "CkC2", "Very limited", 0.9959],
      ["171040", "HoD2", "Very limited", 0.0041],
    ]);
  });

  it("sends SDA one fixed intersection query and Living Atlas a bounding-box query", async () => {
    const fetchImpl = replay(franklin);
    await run(goldenParcel, fetchImpl);

    const [sdaUrl, sdaInit] = fetchImpl.mock.calls[0] ?? [];
    expect(sdaUrl).toBe(SDA_POST_REST);
    const sdaForm = new URLSearchParams(String(sdaInit?.body));
    expect(sdaForm.get("format")).toBe("JSON+COLUMNNAME");
    expect(sdaForm.get("query")).toContain(
      "SDA_Get_Mukey_from_intersection_with_WktWgs84",
    );
    expect(sdaForm.get("query")).toContain("a.engstafdcd");
    expect(sdaForm.get("query")).toContain("POLYGON((");

    const [atlasUrl, atlasInit] = fetchImpl.mock.calls[1] ?? [];
    expect(atlasUrl).toBe(LIVING_ATLAS_SOILS_QUERY);
    const atlasForm = new URLSearchParams(String(atlasInit?.body));
    expect(atlasForm.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(atlasForm.get("outFields")).toBe("MUKEY,MUSYM,muname,engstafdcd");
    expect(atlasForm.get("outSR")).toBe("4326");
    expect(atlasForm.toString()).toBe(franklin.exchanges[1]?.body);
  });

  it("turns the real ratings into needsReview citing the Living Atlas copy with retrievedAt", async () => {
    const outcome = await run(goldenParcel, replay(franklin));
    const check = septicCheck(goldenParcel, outcome, 6_000);

    expect(check).toMatchObject({
      kind: "septic",
      status: "needsReview",
      sources: [
        {
          authority:
            "USDA Natural Resources Conservation Service (SSURGO), hosted by Esri ArcGIS Living Atlas",
          url: LIVING_ATLAS_SOILS_LAYER,
          retrievedAt: franklin.recordedAt,
        },
      ],
      responsibleParty: {
        role: "Local health district (sewage treatment systems)",
        organization: "Franklin County or city health district",
      },
    });
    expect(check.finding).toContain(
      "46% of the parcel as map unit Ko (Kokomo silty clay loam, 0 to 2 percent slopes), rated “Very limited”",
    );
    expect(check.finding).toContain("Esri Living Atlas copy");
    expect(check.finding.toLowerCase()).not.toMatch(/septic\s+will\s+work/);
    expect(check.nextAction).toContain(
      "Ohio Department of Health homeowner page",
    );
    expect(check.nextAction).toContain("site and soil evaluation");
  });
});

describe("SDA first, Living Atlas fallback", () => {
  it("uses SDA alone when it answers, and cites SDA", async () => {
    // SDA's JSON+COLUMNNAME table shape, filled with the real Franklin values.
    const table = [
      ["mukey", "musym", "muname", "engstafdcd", "overlap_area"],
      ...franklin.outcome.mapUnits.map((unit) => [
        unit.mukey,
        unit.symbol,
        unit.name,
        unit.rating,
        unit.share,
      ]),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ Table: table }),
    );
    const outcome = await run(goldenParcel, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      outcome: "found",
      source: "soilDataAccess",
    });
    expect(shares(outcome)).toEqual(shares(franklin.outcome));
    expect(septicCheck(goldenParcel, outcome, 6_000).sources[0]?.url).toBe(
      SDA_POST_REST,
    );
  });

  it("falls back when SDA hangs past its budget", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === SDA_POST_REST) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      }
      return livingAtlasAnswer(licking);
    });
    const outcome = await run(secondCountyParcel, fetchImpl, {
      sdaBudgetMs: 20,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ outcome: "found", source: "livingAtlas" });
  });

  it("does not ask the fallback once the check's own time limit has passed", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          setTimeout(() => controller.abort(), 10);
        }),
    );
    const outcome = await run(goldenParcel, fetchImpl, {
      signal: controller.signal,
    });

    expect(outcome).toEqual({ outcome: "timeout", cause: "timedOut" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps SDA's own empty and unrated answers unknown without a fallback", async () => {
    const answers = [
      { Table: [["mukey", "musym", "muname", "engstafdcd", "overlap_area"]] },
      {
        Table: [
          ["mukey", "musym", "muname", "engstafdcd", "overlap_area"],
          ["171015", "CkC2", "Cincinnati silt loam", "Not rated", 1],
        ],
      },
    ];
    for (const answer of answers) {
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(answer));
      const outcome = await run(goldenParcel, fetchImpl);
      const check = septicCheck(goldenParcel, outcome, 6_000);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        outcome: "missing",
        source: "soilDataAccess",
      });
      expect(check.status).toBe("unknown");
      expect(check.nextAction).toContain("site and soil evaluation");
    }
  });

  it("keeps missing, unrated, malformed, truncated, and failed fallback answers unknown", async () => {
    const recorded = (await livingAtlasAnswer(franklin).json()) as {
      features: Array<{ properties: Record<string, unknown> }>;
    };
    const unrated = structuredClone(recorded);
    for (const feature of unrated.features) {
      feature.properties.engstafdcd = "Not rated";
    }
    const fallbacks = [
      () => Response.json({ type: "FeatureCollection", features: [] }),
      () => Response.json(unrated),
      () => Response.json({ ...recorded, exceededTransferLimit: true }),
      () => Response.json({ nope: true }),
      () => new Response("Service unavailable", { status: 503 }),
    ];
    const statuses: string[] = [];

    for (const fallback of fallbacks) {
      const fetchImpl = vi.fn<typeof fetch>(async (input) =>
        String(input) === SDA_POST_REST ? sdaOutage() : fallback(),
      );
      const outcome = await run(goldenParcel, fetchImpl);
      const report = {
        checks: [septicCheck(goldenParcel, outcome, 6_000)],
      } as Pick<ParcelReport, "checks">;

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      statuses.push(
        outcome.outcome === "missing" ? outcome.reason : outcome.outcome,
      );
      expect(report.checks[0]?.status).toBe("unknown");
      expect(report.checks[0]?.nextAction).toContain(
        "site and soil evaluation",
      );
    }
    expect(statuses).toEqual([
      "noMapUnits",
      "notRated",
      "timeout",
      "timeout",
      "timeout",
    ]);
  });
});
