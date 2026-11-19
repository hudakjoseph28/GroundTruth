import { readFileSync } from "node:fs";
import {
  isParcelLayers,
  MAP_LAYER_IDS,
  type GeoJsonPolygon,
  type MapLayer,
  type MapLayerId,
  type ParcelLayers,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  CLIP_MARGIN,
  clipRing,
  createParcelLayers,
  layerBox,
  polygonDistance,
} from "../src/layers/parcelLayers.js";
import { createOgripClient } from "../src/parcels/ogrip.js";
import { NFHL_SERVICE } from "../src/reports/femaFlood.js";
import { FCEDP_ZONING_LAYER } from "../src/reports/franklinZoning.js";
import { FRANKLIN_ROW_LAYER } from "../src/reports/franklinAccess.js";
import { FRANKLIN_STREAM_BUFFERS_LAYER } from "../src/reports/franklinStreamBuffers.js";
import { createFranklinStreamBuffersClient } from "../src/reports/franklinStreamBuffers.js";
import { NWI_SERVICE } from "../src/reports/nwiWetlands.js";
import { LAYERS_TTL_MS } from "../src/routes/layers.js";
import {
  LAYER_SCENARIOS,
  layersPath,
  recordedResponse,
  type LayerScenario,
  type ReportRecording,
} from "./fixtures/report/scenarios.js";

function load(name: LayerScenario): ReportRecording {
  return JSON.parse(
    readFileSync(
      new URL(`./fixtures/report/layers-${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as ReportRecording;
}

const requestId = (method: string, url: string, body?: string) =>
  `${method} ${url}\n${body ?? ""}`;

/** Serves recorded responses by exact request; anything else fails. */
function replay(recording: ReportRecording) {
  const byRequest = new Map(
    recording.exchanges.map((e) => [
      requestId(e.method, e.url, e.requestBody),
      e,
    ]),
  );
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = requestId(
      init?.method ?? "GET",
      String(input),
      typeof init?.body === "string" ? init.body : undefined,
    );
    const recorded = byRequest.get(key);
    if (!recorded) throw new Error(`unrecorded request: ${key.slice(0, 200)}`);
    return recordedResponse(recorded);
  });
}

function appFor(
  name: LayerScenario,
  options: {
    /** Wraps the replayed fetch, to fail one source. */
    wrap?: (replayed: typeof fetch) => typeof fetch;
    timeoutMs?: number;
    clock?: () => Date;
  } = {},
) {
  const recording = load(name);
  const replayed = replay(recording);
  const fetchImpl = options.wrap ? options.wrap(replayed) : replayed;
  const at = new Date(recording.recordedAt);
  const now = options.clock ?? (() => at);
  const app = createApp("test-commit", {
    ogrip: createOgripClient({ fetch: replayed, now, timeoutMs: 1_000 }),
    layers: createParcelLayers({
      fetch: fetchImpl,
      now,
      timeoutMs: options.timeoutMs ?? 2_000,
      streamSetbacks: createFranklinStreamBuffersClient({
        fetch: fetchImpl,
        now,
      }),
    }),
  });
  return { app, recording, fetch: replayed };
}

async function layersOf(
  name: LayerScenario,
  options?: Parameters<typeof appFor>[1],
) {
  const { app } = appFor(name, options);
  const res = await request(app).get(layersPath(LAYER_SCENARIOS[name]));
  expect(res.status).toBe(200);
  expect(isParcelLayers(res.body)).toBe(true);
  const body = res.body as ParcelLayers;
  const byId = (id: MapLayerId) =>
    body.layers.find((layer) => layer.id === id) as MapLayer;
  return { res, body, byId };
}

const shareOf = (layer: MapLayer, name: string) =>
  layer.onLot?.find((area) => area.name === name)?.share;

describe("GET /api/parcels/:parcelKey/layers", () => {
  it("draws the golden parcel's Big Darby setback on about 4.7% of the lot, as the report measures it", async () => {
    const { body, byId } = await layersOf("franklin-golden");
    expect(body.parcelKey).toBe("ohio:39049:230-000918");
    expect(body.layers.map((layer) => layer.id)).toEqual([...MAP_LAYER_IDS]);

    const setback = byId("streamSetback");
    expect(setback.status).toBe("found");
    expect(setback.shapes.length).toBeGreaterThan(0);
    const share =
      shareOf(setback, "Big Darby Creek Watershed Riparian Setbacks") ?? 0;
    // The report's environmental check says "about 4.7%" (QA-Proof: 4.661%).
    expect(share).toBeGreaterThan(0.0465);
    expect(share).toBeLessThan(0.0475);
    expect(setback.source?.url).toBe(FRANKLIN_STREAM_BUFFERS_LAYER);
  });

  it("names Zone X on the golden parcel but shades nothing: minimal hazard is not a flood zone to draw", async () => {
    const { byId } = await layersOf("franklin-golden");
    const flood = byId("flood");
    expect(flood.status).toBe("none");
    expect(flood.shapes).toEqual([]);
    expect(flood.inView).toEqual(["Zone X (area of minimal flood hazard)"]);
    expect(flood.source?.url.startsWith(NFHL_SERVICE)).toBe(true);
  });

  it("puts the golden parcel wholly in the Rural district and draws the nearest right-of-way, which does not touch it", async () => {
    const { byId } = await layersOf("franklin-golden");
    const zoning = byId("zoning");
    expect(zoning.status).toBe("found");
    expect(zoning.inView).toEqual(["R · Rural District"]);
    expect(zoning.onLot).toEqual([{ name: "R", share: 1 }]);
    expect(zoning.shapes.every((shape) => shape.label === "R")).toBe(true);

    // A rear lot: the access check found no touching right-of-way either.
    const row = byId("roadRightOfWay");
    expect(row.status).toBe("found");
    expect(row.shapes).toHaveLength(1);
    expect(row.distanceM).toBeGreaterThan(1);
    expect(row.source?.url).toBe(FRANKLIN_ROW_LAYER);
  });

  it("draws wetlands, the setback, and the AE floodway on 0 Harrisburg Georgesville Rd", async () => {
    const { byId } = await layersOf("franklin-wetland-setback");

    const wetlands = byId("wetlands");
    expect(wetlands.status).toBe("found");
    expect(wetlands.image?.startsWith("data:image/png;base64,")).toBe(true);
    expect(wetlands.inView).toEqual([
      "Freshwater Emergent Wetland",
      "Freshwater Pond",
      "Riverine",
    ]);

    const setback = byId("streamSetback");
    expect(setback.status).toBe("found");
    const share =
      shareOf(setback, "Big Darby Creek Watershed Riparian Setbacks") ?? 0;
    // The report: "about 41% of it inside the Big Darby ... Setbacks".
    expect(Math.round(share * 100)).toBe(41);

    const flood = byId("flood");
    expect(flood.status).toBe("found");
    expect(flood.inView).toEqual([
      "Zone AE",
      "Zone AE (regulatory floodway)",
      "Zone X (0.2% annual chance flood hazard)",
      "Zone X (area of minimal flood hazard)",
    ]);
    const tones = new Set(flood.shapes.map((shape) => shape.tone));
    expect(tones).toEqual(new Set(["strong", "light"]));
    expect(shareOf(flood, "Zone AE (regulatory floodway)")).toBeGreaterThan(0);

    // The access check: the lot touches Harrisburg - Georgesville Rd's right-of-way.
    const row = byId("roadRightOfWay");
    expect(row.status).toBe("found");
    expect(row.distanceM).toBe(0);
  });

  it("clips every outline just outside the land block's region", async () => {
    const { body } = await layersOf("franklin-wetland-setback");
    const dx = (body.bbox.east - body.bbox.west) * CLIP_MARGIN;
    const dy = (body.bbox.north - body.bbox.south) * CLIP_MARGIN;
    const west = body.bbox.west - dx;
    const east = body.bbox.east + dx;
    const south = body.bbox.south - dy;
    const north = body.bbox.north + dy;
    for (const layer of body.layers) {
      for (const shape of layer.shapes) {
        for (const ring of shape.rings) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring.at(-1));
          for (const [x = 0, y = 0] of ring) {
            expect(x).toBeGreaterThanOrEqual(west - 1e-7);
            expect(x).toBeLessThanOrEqual(east + 1e-7);
            expect(y).toBeGreaterThanOrEqual(south - 1e-7);
            expect(y).toBeLessThanOrEqual(north + 1e-7);
          }
        }
      }
    }
  });

  it("says Franklin-only layers are not covered in Licking County, and still draws flood and wetlands", async () => {
    const { byId } = await layersOf("licking-wetland");
    for (const id of ["streamSetback", "zoning", "roadRightOfWay"] as const) {
      expect(byId(id)).toEqual({
        id,
        status: "notCovered",
        shapes: [],
        inView: [],
      });
    }
    expect(byId("wetlands").status).toBe("found");
    expect(byId("wetlands").inView).toContain(
      "Freshwater Forested/Shrub Wetland",
    );
    expect(["found", "none"]).toContain(byId("flood").status);
  });

  it("marks one failing source unavailable and keeps the rest", async () => {
    const { res, byId } = await layersOf("franklin-wetland-setback", {
      wrap: (replayed) => async (input, init) => {
        if (String(input).startsWith(NWI_SERVICE)) {
          return new Response("Server Unavailable", { status: 503 });
        }
        return replayed(input, init);
      },
    });
    expect(byId("wetlands")).toEqual({
      id: "wetlands",
      status: "unavailable",
      shapes: [],
      inView: [],
    });
    expect(byId("streamSetback").status).toBe("found");
    expect(byId("flood").status).toBe("found");
    // A partial answer is not cached anywhere.
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("marks a source that runs out of time unavailable", async () => {
    const { byId } = await layersOf("franklin-wetland-setback", {
      timeoutMs: 50,
      wrap: (replayed) => async (input, init) => {
        if (String(input).startsWith(FCEDP_ZONING_LAYER)) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          });
        }
        return replayed(input, init);
      },
    });
    expect(byId("zoning").status).toBe("unavailable");
    expect(byId("roadRightOfWay").status).toBe("found");
  });

  it("reads an ArcGIS error inside HTTP 200 as unavailable, never as none", async () => {
    const { byId } = await layersOf("franklin-wetland-setback", {
      wrap: (replayed) => async (input, init) => {
        if (String(input).startsWith(NFHL_SERVICE)) {
          return Response.json({
            error: { code: 400, message: "Failed to execute query." },
          });
        }
        return replayed(input, init);
      },
    });
    expect(byId("flood").status).toBe("unavailable");
  });

  it("serves a complete answer again from memory until it expires", async () => {
    const recording = load("franklin-golden");
    let at = new Date(recording.recordedAt).getTime();
    const { app, fetch } = appFor("franklin-golden", {
      clock: () => new Date(at),
    });
    const path = layersPath(LAYER_SCENARIOS["franklin-golden"]);
    const first = await request(app).get(path);
    expect(first.headers["cache-control"]).toBe("public, max-age=3600");
    const calls = fetch.mock.calls.length;
    const second = await request(app).get(path);
    expect(second.body).toEqual(first.body);
    expect(fetch.mock.calls.length).toBe(calls);
    at += LAYERS_TTL_MS + 1;
    await request(app).get(path);
    expect(fetch.mock.calls.length).toBeGreaterThan(calls);
  });

  it("refuses a malformed key and a non-Ohio county", async () => {
    const { app } = appFor("franklin-golden");
    const bad = await request(app).get("/api/parcels/not-a-key/layers");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_REQUEST");
    const outside = await request(app).get(
      `/api/parcels/${encodeURIComponent("ohio:06037:123")}/layers`,
    );
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe("NO_COVERAGE");
  });
});

describe("clipRing", () => {
  const box = { west: 0, south: 0, east: 10, north: 10 };

  it("keeps a ring that is wholly inside", () => {
    const ring = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 1],
    ];
    expect(clipRing(ring, box)).toEqual(ring);
  });

  it("cuts a ring that crosses the edge at the edge", () => {
    const clipped = clipRing(
      [
        [5, 5],
        [15, 5],
        [15, 8],
        [5, 8],
        [5, 5],
      ],
      box,
    );
    expect(clipped).toEqual([
      [5, 5],
      [10, 5],
      [10, 8],
      [5, 8],
      [5, 5],
    ]);
  });

  it("drops a ring outside the box", () => {
    expect(
      clipRing(
        [
          [20, 20],
          [21, 20],
          [21, 21],
          [20, 20],
        ],
        box,
      ),
    ).toEqual([]);
  });
});

describe("polygonDistance", () => {
  // About 111 m on a side at the equator.
  const lot: GeoJsonPolygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
        [0, 0],
      ],
    ],
  };

  it("is 0 for a polygon that shares an edge or overlaps", () => {
    expect(
      polygonDistance(lot, [
        [
          [0.001, 0],
          [0.002, 0],
          [0.002, 0.001],
          [0.001, 0.001],
          [0.001, 0],
        ],
      ]),
    ).toBeLessThan(0.01);
    expect(
      polygonDistance(lot, [
        [
          [0.0005, 0.0005],
          [0.002, 0.0005],
          [0.002, 0.002],
          [0.0005, 0.0005],
        ],
      ]),
    ).toBe(0);
  });

  it("measures the gap edge to edge in metres", () => {
    const gap = polygonDistance(lot, [
      [
        [0.002, 0],
        [0.003, 0],
        [0.003, 0.001],
        [0.002, 0.001],
        [0.002, 0],
      ],
    ]);
    expect(gap).toBeGreaterThan(110);
    expect(gap).toBeLessThan(112);
  });
});

describe("layerBox", () => {
  it("is the land block's region, the same box the golden parcel was baked with", () => {
    const meta = JSON.parse(
      readFileSync(
        new URL(
          "../../frontend/web/public/parcels/230-000918/meta.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { bbox: ParcelLayers["bbox"] };
    const recording = load("franklin-golden");
    const body = recording.apiResponse.body as ParcelLayers;
    const box = body.bbox;
    for (const side of ["west", "south", "east", "north"] as const) {
      expect(box[side]).toBeCloseTo(meta.bbox[side], 9);
    }
    expect(typeof layerBox).toBe("function");
  });
});
