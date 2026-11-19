// GET /api/parcels/:parcelKey/land and its service, with a stub builder,
// an in-memory store, and a stub OGRIP client.
import {
  goldenParcel,
  secondCountyParcel,
  type Parcel,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { LandAssetFiles } from "../src/land/buildLandAssets.js";
import {
  createLandAssetService,
  type LandAssetStore,
} from "../src/land/landAssets.js";
import { OgripError, type OgripClient } from "../src/parcels/ogrip.js";

const KEY = encodeURIComponent(goldenParcel.key);

function filesFor(
  parcel: Pick<Parcel, "key" | "sourceParcelId">,
): LandAssetFiles {
  return {
    meta: {
      version: 1,
      parcelKey: parcel.key,
      sourceParcelId: parcel.sourceParcelId,
      retrievedAt: "2026-11-18T19:00:00.000Z",
      bbox: { west: -83.3, south: 39.9, east: -83.29, north: 39.91 },
      groundMeters: { width: 286, depth: 286 },
      imagery: {
        file: "imagery.jpg",
        width: 1536,
        height: 1536,
        source: "USGS NAIP Imagery (The National Map)",
        attribution: "Aerial imagery: USDA NAIP via USGS National Map",
        sourceUrl: "https://imagery.nationalmap.gov/",
        metersPerPixel: 0.19,
      },
      elevation: {
        file: "height.png",
        width: 257,
        height: 257,
        minMeters: 283.2,
        maxMeters: 286.5,
        source: "AWS Terrain Tiles (Terrarium)",
        attribution: "Elevation: AWS Terrain Tiles",
        sourceUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
      },
    },
    imagery: Buffer.from("jpeg-bytes"),
    height: Buffer.from("png-bytes"),
  };
}

function memoryStore(): LandAssetStore & { rows: Map<string, LandAssetFiles> } {
  const rows = new Map<string, LandAssetFiles>();
  return {
    rows,
    async read(key) {
      return rows.get(key) ?? null;
    },
    async write(key, files) {
      rows.set(key, files);
    },
  };
}

function ogripWith(
  parcels: Parcel[],
): OgripClient & { getParcel: ReturnType<typeof vi.fn> } {
  return {
    searchByParcelId: vi.fn(),
    searchByAddress: vi.fn(),
    getCoverage: vi.fn(),
    getArea: vi.fn(),
    getParcel: vi.fn(
      async (fips: string, id: string) =>
        parcels.find((p) => p.countyFips === fips && p.sourceParcelId === id) ??
        null,
    ),
  } as unknown as OgripClient & { getParcel: ReturnType<typeof vi.fn> };
}

function setup(
  opts: {
    build?: (
      parcel: Pick<Parcel, "key" | "sourceParcelId" | "geometry">,
    ) => Promise<LandAssetFiles>;
    store?: LandAssetStore;
    ogrip?: OgripClient;
  } = {},
) {
  const ogrip = (opts.ogrip ??
    ogripWith([goldenParcel, secondCountyParcel])) as OgripClient & {
    getParcel: ReturnType<typeof vi.fn>;
  };
  const store = opts.store ?? memoryStore();
  const build = vi.fn(
    opts.build ??
      (async (parcel: Pick<Parcel, "key" | "sourceParcelId" | "geometry">) =>
        filesFor(parcel)),
  );
  const service = createLandAssetService({
    ogrip,
    store,
    build,
    log: () => {},
  });
  const app = createApp("test", { ogrip, land: service });
  return { app, build, store, ogrip, service };
}

describe("GET /api/parcels/:parcelKey/land", () => {
  it("builds the land block from the OGRIP parcel and serves its meta, imagery, and heights", async () => {
    const { app, build, ogrip } = setup();

    const meta = await request(app).get(`/api/parcels/${KEY}/land`);
    expect(meta.status).toBe(200);
    expect(meta.body).toEqual(filesFor(goldenParcel).meta);
    expect(meta.headers["cache-control"]).toBe("public, max-age=86400");
    expect(ogrip.getParcel).toHaveBeenCalledWith("39049", "230-000918");
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]![0].key).toBe(goldenParcel.key);

    const imagery = await request(app).get(
      `/api/parcels/${KEY}/land/imagery.jpg`,
    );
    expect(imagery.status).toBe(200);
    expect(imagery.headers["content-type"]).toBe("image/jpeg");
    expect(imagery.body.toString()).toBe("jpeg-bytes");
    const height = await request(app).get(
      `/api/parcels/${KEY}/land/height.png`,
    );
    expect(height.headers["content-type"]).toBe("image/png");
    expect(height.body.toString()).toBe("png-bytes");
    // Served from memory after the first build.
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("builds each parcel once when requests arrive together", async () => {
    let finish: (files: LandAssetFiles) => void = () => {};
    const { app, build } = setup({
      build: () => new Promise((resolve) => (finish = resolve)),
    });
    const both = Promise.all([
      request(app).get(`/api/parcels/${KEY}/land`),
      request(app).get(`/api/parcels/${KEY}/land/imagery.jpg`),
    ]);
    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    finish(filesFor(goldenParcel));
    const [meta, imagery] = await both;
    expect([meta.status, imagery.status]).toEqual([200, 200]);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("serves the stored copy without asking OGRIP or rebuilding", async () => {
    const store = memoryStore();
    store.rows.set(goldenParcel.key, filesFor(goldenParcel));
    const { app, build, ogrip } = setup({ store });
    const res = await request(app).get(`/api/parcels/${KEY}/land`);
    expect(res.status).toBe(200);
    expect(build).not.toHaveBeenCalled();
    expect(ogrip.getParcel).not.toHaveBeenCalled();
  });

  it("stores a build, and still answers when the store fails", async () => {
    const store = memoryStore();
    const { app } = setup({ store });
    await request(app).get(`/api/parcels/${KEY}/land`);
    expect(store.rows.get(goldenParcel.key)?.meta.parcelKey).toBe(
      goldenParcel.key,
    );

    const broken: LandAssetStore = {
      read: async () => {
        throw new Error("database down");
      },
      write: async () => {
        throw new Error("database down");
      },
    };
    const res = await request(setup({ store: broken }).app).get(
      `/api/parcels/${KEY}/land`,
    );
    expect(res.status).toBe(200);
  });

  it("finishes and caches a build the client stopped waiting for", async () => {
    let finish: (files: LandAssetFiles) => void = () => {};
    const store = memoryStore();
    const { app, build, service } = setup({
      store,
      build: () => new Promise((resolve) => (finish = resolve)),
    });
    // The web gives up after about 10 s; here the request is aborted early.
    const abandoned = request(app).get(`/api/parcels/${KEY}/land`).timeout(50);
    await expect(abandoned).rejects.toThrow();
    finish(filesFor(goldenParcel));
    await vi.waitFor(() => expect(store.rows.has(goldenParcel.key)).toBe(true));
    await service.get("39049", "230-000918", goldenParcel.key);
    expect(build).toHaveBeenCalledTimes(1);
    const res = await request(app).get(`/api/parcels/${KEY}/land`);
    expect(res.status).toBe(200);
  });

  it.each([
    ["a malformed key", "not-a-key/land", 400, "INVALID_REQUEST"],
    [
      "a non-Ohio county",
      `${encodeURIComponent("ohio:99999:1")}/land`,
      404,
      "NO_COVERAGE",
    ],
    [
      "a parcel OGRIP does not have",
      `${encodeURIComponent("ohio:39049:999-999999")}/land`,
      404,
      "NOT_FOUND",
    ],
    ["an unknown file", `${KEY}/land/meta.json`, 404, "NOT_FOUND"],
  ])("answers %s with %i", async (_label, path, status, code) => {
    const { app, build } = setup();
    const res = await request(app).get(`/api/parcels/${path}`);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(build).not.toHaveBeenCalled();
  });

  it("answers 404 for a parcel with no drawable boundary, without building", async () => {
    const empty: Parcel = {
      ...goldenParcel,
      geometry: {
        ...goldenParcel.geometry,
        geojson: { type: "Polygon", coordinates: [[]] },
      },
    };
    const { app, build } = setup({ ogrip: ogripWith([empty]) });
    const res = await request(app).get(`/api/parcels/${KEY}/land`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/no drawable boundary/);
    expect(build).not.toHaveBeenCalled();
  });

  it.each([
    [
      "imagery or elevation times out",
      () => Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      504,
      "PROVIDER_TIMEOUT",
    ],
    [
      "imagery or elevation fails",
      () => new Error("503 for terrain"),
      502,
      "INTERNAL_ERROR",
    ],
  ])(
    "answers a retryable error when %s, and builds again next time",
    async (_label, error, status, code) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { app, build } = setup({
        build: async () => {
          throw error();
        },
      });
      const res = await request(app).get(`/api/parcels/${KEY}/land`);
      expect(res.status).toBe(status);
      expect(res.body.error).toMatchObject({ code, retryable: true });
      await request(app).get(`/api/parcels/${KEY}/land`);
      expect(build).toHaveBeenCalledTimes(2);
    },
  );

  it("answers a retryable 504 when OGRIP times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ogrip = ogripWith([]);
    ogrip.getParcel.mockRejectedValue(new OgripError("timeout"));
    const res = await request(setup({ ogrip }).app).get(
      `/api/parcels/${KEY}/land`,
    );
    expect(res.status).toBe(504);
    expect(res.body.error.retryable).toBe(true);
  });
});
