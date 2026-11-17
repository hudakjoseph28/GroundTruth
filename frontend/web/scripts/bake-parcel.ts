// Bakes the land block's assets for one parcel: real aerial imagery and real
// elevation for the parcel's padded bounding box, written where the web app
// serves them.
//
//   npx --yes pnpm@12.18.0 --filter @groundtruth/web bake:parcel ohio:39049:230-000918
//
// Writes public/parcels/<sourceParcelId>/imagery.jpg, height.png, meta.json.
// Re-run it whenever the parcel's geometry changes, then commit the three files.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { goldenParcel, secondCountyParcel, type Parcel } from "@groundtruth/shared";
import {
  LAND_META_VERSION,
  landAssetDir,
  mercatorLat,
  mercatorLng,
  mercatorX,
  mercatorY,
  outerRing,
  type LandMeta,
} from "../src/parcel/ParcelScene/landMeta.ts";

// Parcels the bake can find by key. Add to this as the catalog grows.
const CATALOG: readonly Parcel[] = [goldenParcel, secondCountyParcel];

/** Extra ground on every side of the parcel's bounding box, as a share of its longer side. */
const PADDING = 0.15;
const IMAGERY_SIZE = 1536;
const HEIGHT_SIZE = 257;
const MAX_TEXTURE_BYTES = 1_400_000;
const TILE = 256;
const WORLD = 2 * Math.PI * 6378137;

const NAIP = {
  source: "USGS NAIP Imagery (The National Map)",
  attribution: "Aerial imagery: USDA NAIP via USGS National Map",
  url: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
};
const USGS_TILES = {
  source: "USGS Imagery Only (The National Map)",
  attribution: "Aerial imagery: USGS National Map",
  url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer",
  zoom: 16, // the tile cache stops here; z17 returns 404
};
const TERRARIUM = {
  source: "AWS Terrain Tiles (Terrarium)",
  attribution: "Elevation: AWS Terrain Tiles",
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
  zoom: 15,
};

interface Region {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface Raster {
  width: number;
  height: number;
  /** RGBA, row 0 at the top. */
  data: Uint8Array;
}

async function fetchBytes(url: string, attempts = 3): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** The parcel's bounding box in Web Mercator meters, squared and padded. */
function regionFor(parcel: Parcel): Region {
  const ring = outerRing(parcel.geometry.geojson);
  if (!ring.length) throw new Error(`${parcel.key} has no drawable boundary.`);
  const xs = ring.map((pair) => mercatorX(pair[0] ?? 0));
  const ys = ring.map((pair) => mercatorY(pair[1] ?? 0));
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  const side = Math.max(east - west, north - south) * (1 + 2 * PADDING);
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  return { west: cx - side / 2, south: cy - side / 2, east: cx + side / 2, north: cy + side / 2 };
}

function decodeJpeg(bytes: Buffer): Raster {
  const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { width: image.width, height: image.height, data: image.data };
}

/** A blank or single-color response means the service had no imagery here. */
function looksBlank(raster: Raster): boolean {
  let sum = 0;
  let sumSquares = 0;
  const count = raster.width * raster.height;
  for (let i = 0; i < raster.data.length; i += 4) {
    const luma = (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
    sum += luma;
    sumSquares += luma * luma;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSquares / count - mean * mean)) < 3;
}

async function naipImagery(region: Region): Promise<Raster> {
  const query = new URLSearchParams({
    bbox: [region.west, region.south, region.east, region.north].join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${IMAGERY_SIZE},${IMAGERY_SIZE}`,
    format: "jpg",
    interpolation: "RSP_BilinearInterpolation",
    f: "image",
  });
  const raster = decodeJpeg(await fetchBytes(`${NAIP.url}/exportImage?${query}`));
  if (raster.width !== IMAGERY_SIZE || raster.height !== IMAGERY_SIZE || looksBlank(raster)) {
    throw new Error("NAIP returned no usable imagery for this region.");
  }
  return raster;
}

/** Tile column and row (fractional) for a Mercator point at a zoom. */
function tileXY(x: number, y: number, zoom: number): { tx: number; ty: number } {
  const n = 2 ** zoom;
  return { tx: ((x + WORLD / 2) / WORLD) * n, ty: ((WORLD / 2 - y) / WORLD) * n };
}

/** Fetch every tile touching the region and stitch them into one raster. */
async function stitch(
  region: Region,
  zoom: number,
  urlFor: (x: number, y: number) => string,
  decode: (bytes: Buffer) => Raster,
): Promise<{ raster: Raster; originX: number; originY: number }> {
  const a = tileXY(region.west, region.north, zoom);
  const b = tileXY(region.east, region.south, zoom);
  const x0 = Math.floor(a.tx) - 1;
  const y0 = Math.floor(a.ty) - 1;
  const x1 = Math.floor(b.tx) + 1;
  const y1 = Math.floor(b.ty) + 1;
  const width = (x1 - x0 + 1) * TILE;
  const height = (y1 - y0 + 1) * TILE;
  const data = new Uint8Array(width * height * 4);
  const jobs: Promise<void>[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push(
        fetchBytes(urlFor(tx, ty)).then((bytes) => {
          const tile = decode(bytes);
          if (tile.width !== TILE || tile.height !== TILE) {
            throw new Error(`Unexpected tile size ${tile.width}x${tile.height}.`);
          }
          for (let row = 0; row < TILE; row++) {
            const from = row * TILE * 4;
            const to = ((ty - y0) * TILE + row) * width * 4 + (tx - x0) * TILE * 4;
            data.set(tile.data.subarray(from, from + TILE * 4), to);
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  return { raster: { width, height, data }, originX: x0, originY: y0 };
}

const cubic = (t: number): [number, number, number, number] => {
  // Catmull-Rom weights for the four neighbors around a sample.
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
};

/** Bicubic sample of one float channel at a fractional pixel position. */
function sample(values: Float32Array, width: number, height: number, x: number, y: number): number {
  const ix = Math.floor(x - 0.5);
  const iy = Math.floor(y - 0.5);
  const wx = cubic(x - 0.5 - ix);
  const wy = cubic(y - 0.5 - iy);
  let total = 0;
  for (let j = 0; j < 4; j++) {
    const py = Math.min(height - 1, Math.max(0, iy - 1 + j));
    for (let i = 0; i < 4; i++) {
      const px = Math.min(width - 1, Math.max(0, ix - 1 + i));
      total += values[py * width + px]! * wx[i]! * wy[j]!;
    }
  }
  return total;
}

/** Resample a stitched tile raster's region into a square float grid, per channel. */
function resample(
  stitched: { raster: Raster; originX: number; originY: number },
  region: Region,
  zoom: number,
  size: number,
  channel: (data: Uint8Array, offset: number) => number,
): Float32Array {
  const { raster, originX, originY } = stitched;
  const source = new Float32Array(raster.width * raster.height);
  for (let i = 0; i < source.length; i++) source[i] = channel(raster.data, i * 4);
  const out = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Pixel centers span the region edge to edge.
      const x = region.west + ((col + 0.5) / size) * (region.east - region.west);
      const y = region.north - ((row + 0.5) / size) * (region.north - region.south);
      const { tx, ty } = tileXY(x, y, zoom);
      out[row * size + col] = sample(
        source,
        raster.width,
        raster.height,
        (tx - originX) * TILE,
        (ty - originY) * TILE,
      );
    }
  }
  return out;
}

async function usgsTileImagery(region: Region): Promise<Raster> {
  const zoom = USGS_TILES.zoom;
  const stitched = await stitch(
    region,
    zoom,
    (x, y) => `${USGS_TILES.url}/tile/${zoom}/${y}/${x}`,
    decodeJpeg,
  );
  const size = 1024; // the source is about 2 m per pixel; upscale cleanly, not far
  const data = new Uint8Array(size * size * 4).fill(255);
  for (let c = 0; c < 3; c++) {
    const plane = resample(stitched, region, zoom, size, (bytes, offset) => bytes[offset + c]!);
    for (let i = 0; i < plane.length; i++) {
      data[i * 4 + c] = Math.min(255, Math.max(0, Math.round(plane[i]!)));
    }
  }
  return { width: size, height: size, data };
}

async function elevation(region: Region): Promise<{ png: Buffer; min: number; max: number }> {
  const zoom = TERRARIUM.zoom;
  const stitched = await stitch(
    region,
    zoom,
    (x, y) => `${TERRARIUM.url}/${zoom}/${x}/${y}.png`,
    (bytes) => {
      const png = PNG.sync.read(bytes);
      return { width: png.width, height: png.height, data: png.data };
    },
  );
  const meters = resample(
    stitched,
    region,
    zoom,
    HEIGHT_SIZE,
    (bytes, offset) => bytes[offset]! * 256 + bytes[offset + 1]! + bytes[offset + 2]! / 256 - 32768,
  );
  let min = Infinity;
  let max = -Infinity;
  for (const value of meters) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const span = Math.max(max - min, 0.01);
  const png = new PNG({ width: HEIGHT_SIZE, height: HEIGHT_SIZE });
  for (let i = 0; i < meters.length; i++) {
    const level = Math.round(((meters[i]! - min) / span) * 255);
    png.data[i * 4] = level;
    png.data[i * 4 + 1] = level;
    png.data[i * 4 + 2] = level;
    png.data[i * 4 + 3] = 255;
  }
  return { png: PNG.sync.write(png, { colorType: 0, inputHasAlpha: true }), min, max };
}

function encodeJpeg(raster: Raster): Buffer {
  for (let quality = 88; quality >= 50; quality -= 6) {
    const encoded = jpeg.encode(
      { data: Buffer.from(raster.data), width: raster.width, height: raster.height },
      quality,
    ).data;
    if (encoded.length <= MAX_TEXTURE_BYTES) return encoded;
  }
  throw new Error("Imagery will not fit the texture budget.");
}

async function main() {
  const wanted = process.argv[2];
  if (!wanted) {
    throw new Error("Usage: bake:parcel <parcelKey>, for example ohio:39049:230-000918");
  }
  const parcel = CATALOG.find((entry) => entry.key === wanted || entry.sourceParcelId === wanted);
  if (!parcel) {
    throw new Error(`No parcel "${wanted}" in the catalog. Add it to CATALOG in this script.`);
  }

  const region = regionFor(parcel);
  const centerLat = mercatorLat((region.south + region.north) / 2);
  // Mercator stretches distance by 1 / cos(latitude); undo it for ground meters.
  const ground = (region.east - region.west) * Math.cos((centerLat * Math.PI) / 180);
  console.log(`${parcel.key}: baking ${ground.toFixed(0)} m square`);

  let imagery: Raster;
  let imagerySource = NAIP;
  try {
    imagery = await naipImagery(region);
  } catch (error) {
    console.warn(`NAIP failed (${error instanceof Error ? error.message : error}); using USGS tiles.`);
    imagery = await usgsTileImagery(region);
    imagerySource = USGS_TILES;
  }
  const heights = await elevation(region);

  const meta: LandMeta = {
    version: LAND_META_VERSION,
    parcelKey: parcel.key,
    sourceParcelId: parcel.sourceParcelId,
    retrievedAt: new Date().toISOString(),
    bbox: {
      west: mercatorLng(region.west),
      south: mercatorLat(region.south),
      east: mercatorLng(region.east),
      north: mercatorLat(region.north),
    },
    groundMeters: { width: ground, depth: ground },
    imagery: {
      file: "imagery.jpg",
      width: imagery.width,
      height: imagery.height,
      source: imagerySource.source,
      attribution: imagerySource.attribution,
      sourceUrl: imagerySource.url,
      metersPerPixel: ground / imagery.width,
    },
    elevation: {
      file: "height.png",
      width: HEIGHT_SIZE,
      height: HEIGHT_SIZE,
      minMeters: heights.min,
      maxMeters: heights.max,
      source: TERRARIUM.source,
      attribution: TERRARIUM.attribution,
      sourceUrl: TERRARIUM.url,
    },
  };

  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "parcels",
    landAssetDir(parcel.sourceParcelId),
  );
  await mkdir(out, { recursive: true });
  const jpg = encodeJpeg(imagery);
  await writeFile(join(out, meta.imagery.file), jpg);
  await writeFile(join(out, meta.elevation.file), heights.png);
  await writeFile(join(out, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `${imagerySource.source}: ${imagery.width}px, ${(jpg.length / 1024).toFixed(0)} KB, ` +
      `${meta.imagery.metersPerPixel.toFixed(2)} m/px`,
  );
  console.log(
    `Elevation ${heights.min.toFixed(1)} to ${heights.max.toFixed(1)} m, ` +
      `${(heights.png.length / 1024).toFixed(0)} KB`,
  );
  console.log(`Wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
