// The land builder on generated tiles (no network): the fetch is injected,
// and imagery and elevation are synthesized so the expected output is known.
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import {
  goldenParcel,
  landRegion,
  mercatorLat,
  mercatorLng,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import {
  buildLandAssets,
  HEIGHT_SIZE,
  IMAGERY_SIZE,
  NAIP,
  TERRARIUM,
  USGS_TILES,
  type FetchBytes,
} from "../src/land/buildLandAssets.js";

/** A JPEG with visible, compressible texture (not "blank"): soft gradients. */
function noisyJpeg(size: number): Buffer {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(((x / size) * 200 + 20) % 256);
      data[i + 1] = Math.round(((y / size) * 180 + 40) % 256);
      data[i + 2] = Math.round(128 + 60 * Math.sin((x + y) / 40));
      data[i + 3] = 255;
    }
  }
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 80).data);
}

function flatJpeg(size: number): Buffer {
  const data = Buffer.alloc(size * size * 4, 128);
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 80).data);
}

/** A Terrarium tile whose elevation ramps west to east, continuous across tiles. */
function terrariumTile(tileX: number): Buffer {
  const png = new PNG({ width: 256, height: 256 });
  for (let row = 0; row < 256; row++) {
    for (let col = 0; col < 256; col++) {
      const meters = 200 + ((tileX % 10) * 256 + col) * 0.01;
      const v = meters + 32768;
      const i = (row * 256 + col) * 4;
      png.data[i] = Math.floor(v / 256);
      png.data[i + 1] = Math.floor(v % 256);
      png.data[i + 2] = Math.floor((v - Math.floor(v)) * 256);
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const naip = noisyJpeg(IMAGERY_SIZE);
const naipBlank = flatJpeg(IMAGERY_SIZE);
const usgsTile = noisyJpeg(256);

/** Elevation rises 1 cm per pixel eastward, so the region has a known range. */
function fetchFor(opts: { naipBlank?: boolean; terrariumDown?: boolean } = {}) {
  const urls: string[] = [];
  const fetchBytes: FetchBytes = async (url) => {
    urls.push(url);
    if (url.startsWith(NAIP.url)) return opts.naipBlank ? naipBlank : naip;
    if (url.startsWith(USGS_TILES.url)) return usgsTile;
    if (url.startsWith(TERRARIUM.url)) {
      if (opts.terrariumDown) throw new Error("503 for terrain");
      const x = Number(url.split("/").at(-2));
      return terrariumTile(x);
    }
    throw new Error(`unexpected ${url}`);
  };
  return { fetchBytes, urls };
}

const now = () => new Date("2026-11-18T19:00:00.000Z");

describe("buildLandAssets", () => {
  it("builds NAIP imagery and Terrarium elevation for the parcel's padded box", async () => {
    const { fetchBytes, urls } = fetchFor();
    const { meta, imagery, height } = await buildLandAssets(goldenParcel, {
      fetchBytes,
      now,
    });

    const region = landRegion(goldenParcel.geometry.geojson);
    expect(meta.bbox).toEqual({
      west: mercatorLng(region.west),
      south: mercatorLat(region.south),
      east: mercatorLng(region.east),
      north: mercatorLat(region.north),
    });
    expect(meta).toMatchObject({
      version: 1,
      parcelKey: goldenParcel.key,
      sourceParcelId: goldenParcel.sourceParcelId,
      retrievedAt: "2026-11-18T19:00:00.000Z",
      imagery: {
        file: "imagery.jpg",
        width: IMAGERY_SIZE,
        height: IMAGERY_SIZE,
        source: NAIP.source,
      },
      elevation: {
        file: "height.png",
        width: HEIGHT_SIZE,
        height: HEIGHT_SIZE,
        source: TERRARIUM.source,
        attribution: TERRARIUM.attribution,
      },
    });
    // The bake of this parcel (public/parcels/230-000918/meta.json) is 286 m.
    expect(meta.groundMeters.width).toBeCloseTo(286.073, 2);
    expect(urls.filter((u) => u.startsWith(NAIP.url))).toHaveLength(1);
    expect(urls.some((u) => u.startsWith(USGS_TILES.url))).toBe(false);

    expect(jpeg.decode(imagery).width).toBe(IMAGERY_SIZE);
    const png = PNG.sync.read(height);
    expect([png.width, png.height]).toEqual([HEIGHT_SIZE, HEIGHT_SIZE]);
    // The ramp's heights, within the 10-tile cycle: 200 m to about 225.6 m.
    expect(meta.elevation.minMeters).toBeGreaterThanOrEqual(199.9);
    expect(meta.elevation.maxMeters).toBeLessThanOrEqual(225.7);
    expect(meta.elevation.maxMeters).toBeGreaterThan(meta.elevation.minMeters);
  });

  it("falls back to USGS imagery tiles when NAIP has nothing here", async () => {
    const { fetchBytes, urls } = fetchFor({ naipBlank: true });
    const warnings: string[] = [];
    const { meta } = await buildLandAssets(goldenParcel, {
      fetchBytes,
      now,
      warn: (m) => warnings.push(m),
    });
    expect(meta.imagery).toMatchObject({
      source: USGS_TILES.source,
      width: 1024,
    });
    expect(urls.some((u) => u.startsWith(`${USGS_TILES.url}/tile/16/`))).toBe(
      true,
    );
    expect(warnings[0]).toMatch(/NAIP failed .*no usable imagery/);
  });

  it("throws when elevation cannot be had, after its retries", async () => {
    const { fetchBytes, urls } = fetchFor({ terrariumDown: true });
    await expect(
      buildLandAssets(goldenParcel, { fetchBytes, attempts: 2 }),
    ).rejects.toThrow("503 for terrain");
    const first = urls.find((u) => u.startsWith(TERRARIUM.url))!;
    expect(urls.filter((u) => u === first)).toHaveLength(2);
  });

  it("refuses a parcel with no drawable boundary", async () => {
    const { fetchBytes } = fetchFor();
    await expect(
      buildLandAssets(
        {
          ...goldenParcel,
          geometry: {
            ...goldenParcel.geometry,
            geojson: { type: "Polygon", coordinates: [[]] },
          },
        },
        { fetchBytes },
      ),
    ).rejects.toThrow("no drawable boundary");
  });
});
