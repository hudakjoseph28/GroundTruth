import { readFileSync } from "node:fs";
import type { ParcelArea } from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { MAX_AREA_PARCELS } from "../src/parcels/area.js";
import {
  createOgripClient,
  OGRIP_PARCELS_LAYER,
} from "../src/parcels/ogrip.js";
import {
  OGRIP_SCENARIOS,
  type OgripRecording,
  type OgripScenario,
} from "./fixtures/ogrip/scenarios.js";

const AT = new Date("2026-11-18T23:56:00.000Z");

function load(name: OgripScenario): OgripRecording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/ogrip/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as OgripRecording;
}

function appWith(fetchImpl: typeof fetch, timeoutMs = 1_000) {
  return createApp("test-commit", {
    ogrip: createOgripClient({ fetch: fetchImpl, now: () => AT, timeoutMs }),
  });
}

/** Serves one recording's OGRIP responses by exact URL. */
function replay(name: OgripScenario) {
  const byUrl = new Map(load(name).exchanges.map((e) => [e.url, e]));
  return vi.fn<typeof fetch>(async (input) => {
    const recorded = byUrl.get(String(input));
    if (!recorded) throw new Error(`unrecorded: ${String(input)}`);
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
    });
  });
}

/** Answers every OGRIP request with one GeoJSON body. */
function answering(body: unknown) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
}

function square(west: number, south: number, size = 0.0005) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [west + size, south],
        [west + size, south + size],
        [west, south + size],
        [west, south],
      ],
    ],
  };
}

function feature(
  id: string,
  geometry: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "Feature",
    properties: {
      County: "Franklin",
      LocalParcelID: id,
      StateParcelID: `39049-${id}`,
      SitusAddressAll: null,
      LandArea: null,
      Shape__Area: 21_780,
      ...extra,
    },
    geometry,
  };
}

const BOX = "-83.0060,39.9550,-82.9880,39.9650";

describe("GET /api/parcels/area", () => {
  it("draws every parcel in a Franklin box, with the address, county, and acreage OGRIP publishes", async () => {
    const fetchImpl = replay("area-franklin-golden");
    const res = await request(appWith(fetchImpl)).get(
      OGRIP_SCENARIOS["area-franklin-golden"],
    );
    expect(res.status).toBe(200);
    const body = res.body as ParcelArea;
    expect(body.truncated).toBe(false);
    expect(body.authority).toBe("Ohio OGRIP");
    expect(body.retrievedAt).toBe(AT.toISOString());
    expect(body.bbox).toEqual([-83.2506, 39.8826, -83.2466, 39.8852]);
    expect(body.parcels).toHaveLength(15);

    const golden = body.parcels.find((p) => p.key === "ohio:39049:230-000918");
    expect(golden).toMatchObject({
      sourceParcelId: "230-000918",
      county: "Franklin",
      countyFips: "39049",
      siteAddress: "0 Seaman Rd",
      mappedAcreage: 3.04,
    });
    // Franklin publishes no LandArea here: acreage is missing, not zero.
    expect(golden).not.toHaveProperty("acreage");
    expect(golden?.outline.type).toBe("Polygon");

    // The box crosses into Madison County: each lot keeps its own county.
    const counties = new Set(body.parcels.map((p) => p.county));
    expect(counties).toEqual(new Set(["Franklin", "Madison"]));

    // One OGRIP request: an envelope query that never asks for owner fields.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(`${OGRIP_PARCELS_LAYER}/query`);
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("resultRecordCount")).toBe(
      String(MAX_AREA_PARCELS + 1),
    );
    expect(url.searchParams.get("outFields")).not.toMatch(/Mail|Owner/i);
    expect(JSON.stringify(body)).not.toMatch(/Mail|Owner/i);
  });

  it("draws a Licking box and merges a parcel published as several polygons", async () => {
    const res = await request(appWith(replay("area-licking-second"))).get(
      OGRIP_SCENARIOS["area-licking-second"],
    );
    expect(res.status).toBe(200);
    const body = res.body as ParcelArea;
    // 20 polygons from OGRIP, 19 parcels: one lot comes in two parts.
    expect(body.parcels).toHaveLength(19);
    expect(new Set(body.parcels.map((p) => p.key)).size).toBe(19);
    const multi = body.parcels.find(
      (p) => p.key === "ohio:39089:00500730200000",
    );
    expect(multi?.outline.type).toBe("MultiPolygon");
    expect(multi?.acreage).toBe(24.81);
    // Parts outside the box are not in the answer: no mapped sum is claimed.
    expect(multi).not.toHaveProperty("mappedAcreage");
    const second = body.parcels.find(
      (p) => p.key === "ohio:39089:00500729609000",
    );
    expect(second).toMatchObject({
      county: "Licking",
      siteAddress: "93 Woody Knoll Dr, Thornville, OH 43076",
      acreage: 1.2,
    });
  });

  it("says when OGRIP holds more parcels than one answer carries", async () => {
    const features = Array.from({ length: MAX_AREA_PARCELS + 1 }, (_, i) =>
      feature(`010-${String(100_000 + i)}`, square(-83 + i * 0.0001, 39.96)),
    );
    const res = await request(
      appWith(
        answering({
          type: "FeatureCollection",
          properties: { exceededTransferLimit: true },
          features,
        }),
      ),
    ).get(`/api/parcels/area?bbox=${BOX}`);
    expect(res.status).toBe(200);
    const body = res.body as ParcelArea;
    expect(body.truncated).toBe(true);
    expect(body.parcels).toHaveLength(MAX_AREA_PARCELS);
  });

  it("leaves off unkeyable rows and malformed outlines without failing the view", async () => {
    const res = await request(
      appWith(
        answering({
          type: "FeatureCollection",
          features: [
            feature("010-000001", square(-83, 39.96)),
            // A shared all-zero placeholder ID is not a parcel.
            feature("0000000000000", square(-83.001, 39.96)),
            // A ring of two points is not an outline.
            feature("010-000002", {
              type: "Polygon",
              coordinates: [
                [
                  [-83, 39.96],
                  [-83.001, 39.96],
                ],
              ],
            }),
            feature("010-000003", null),
          ],
        }),
      ),
    ).get(`/api/parcels/area?bbox=${BOX}`);
    expect(res.status).toBe(200);
    const body = res.body as ParcelArea;
    expect(body.parcels.map((p) => p.sourceParcelId)).toEqual(["010-000001"]);
    expect(body.truncated).toBe(false);
  });

  it("answers an empty list for a box with no parcels", async () => {
    const res = await request(
      appWith(answering({ type: "FeatureCollection", features: [] })),
    ).get(`/api/parcels/area?bbox=${BOX}`);
    expect(res.status).toBe(200);
    expect((res.body as ParcelArea).parcels).toEqual([]);
  });

  it.each([
    ["missing", ""],
    ["three numbers", "?bbox=-83,39,-82.9"],
    ["not numbers", "?bbox=a,b,c,d"],
    ["west past east", "?bbox=-82.9,39.95,-83,39.96"],
    ["hex", "?bbox=0x1,39.95,-83,39.96"],
  ])("refuses a %s bbox without calling OGRIP", async (_name, query) => {
    const fetchImpl = answering({});
    const res = await request(appWith(fetchImpl)).get(
      `/api/parcels/area${query}`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks to zoom in for a box too large to draw", async () => {
    const fetchImpl = answering({});
    const res = await request(appWith(fetchImpl)).get(
      "/api/parcels/area?bbox=-83.3,39.8,-82.8,40.1",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Zoom in/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says a box outside Ohio has no coverage", async () => {
    const fetchImpl = answering({});
    const res = await request(appWith(fetchImpl)).get(
      "/api/parcels/area?bbox=-87.70,41.85,-87.60,41.90",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NO_COVERAGE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("turns a stalled OGRIP into a retryable timeout", async () => {
    const hang = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const res = await request(appWith(hang, 30)).get(
      `/api/parcels/area?bbox=${BOX}`,
    );
    expect(res.status).toBe(504);
    expect(res.body.error).toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it("turns an ArcGIS error body into a retryable failure, never an empty map", async () => {
    const res = await request(
      appWith(answering({ error: { code: 500, message: "boom" } })),
    ).get(`/api/parcels/area?bbox=${BOX}`);
    expect(res.status).toBe(502);
    expect(res.body.error.retryable).toBe(true);
  });

  it("does not take the route for a parcel key", async () => {
    // `area` sits beside `:parcelKey`; a real key still reaches the parcel route.
    const fetchImpl = answering({ type: "FeatureCollection", features: [] });
    const res = await request(appWith(fetchImpl)).get(
      `/api/parcels/${encodeURIComponent("ohio:39049:230-000918")}`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
