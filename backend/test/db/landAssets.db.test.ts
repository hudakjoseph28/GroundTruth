/** The land asset cache in PostgreSQL (prismaLandAssetStore). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import type { LandAssetFiles } from "../../src/land/buildLandAssets.js";
import { prismaLandAssetStore } from "../../src/land/landAssets.js";

const run = randomUUID().slice(0, 8);
const key = `ohio:39049:dbtest-land-${run}`;
const store = prismaLandAssetStore(prisma);
const t0 = new Date("2026-11-18T19:00:00.000Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

const files = (imagery: string): LandAssetFiles => ({
  meta: {
    version: 1,
    parcelKey: key,
    sourceParcelId: `dbtest-land-${run}`,
    retrievedAt: t0.toISOString(),
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
      source: "USGS 3DEP-derived terrain (AWS Terrain Tiles)",
      attribution: "Map elevation: USGS 3DEP via AWS Terrain Tiles · not a survey",
      sourceUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
    },
  },
  imagery: Buffer.from(imagery),
  height: Buffer.from([0, 128, 255]),
});

afterAll(async () => {
  await prisma.landAssetRecord.deleteMany({ where: { parcelKey: key } });
  await prisma.$disconnect();
});

describe("prismaLandAssetStore", () => {
  it("round-trips the meta and both files until they expire", async () => {
    await store.write(key, files("jpeg-v1"), later(60_000));
    const read = await store.read(key, later(1_000));
    expect(read?.meta).toEqual(files("jpeg-v1").meta);
    expect(read?.imagery.toString()).toBe("jpeg-v1");
    expect([...(read?.height ?? [])]).toEqual([0, 128, 255]);
    expect(await store.read(key, later(60_000))).toBeNull();
  });

  it("replaces a previous build of the same parcel", async () => {
    await store.write(key, files("jpeg-v2"), later(60_000));
    expect((await store.read(key, later(1_000)))?.imagery.toString()).toBe(
      "jpeg-v2",
    );
    expect(
      await prisma.landAssetRecord.count({ where: { parcelKey: key } }),
    ).toBe(1);
  });

  it("ignores assets built with another LandMeta version", async () => {
    await prisma.landAssetRecord.update({
      where: { parcelKey: key },
      data: { version: 0 },
    });
    expect(await store.read(key, later(1_000))).toBeNull();
  });
});
