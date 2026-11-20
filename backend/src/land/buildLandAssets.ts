// Builds one parcel's land block assets: real aerial imagery and real
// elevation for the parcel's padded bounding box (landRegion in
// @groundtruth/shared).
//
// One implementation for both uses:
//   - GET /api/parcels/:parcelKey/land builds them on demand for any parcel;
//   - frontend/web/scripts/bake-parcel.ts bakes them into the web app.
//
// Written with erasable TypeScript only and no relative imports, so Node can
// run it directly from the bake script (type stripping).
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import {
  LAND_META_VERSION,
  landRegion,
  mercatorLat,
  mercatorLng,
  type LandMeta,
  type MercatorRegion,
  type Parcel,
} from "@groundtruth/shared";

export const IMAGERY_SIZE = 1536;
export const HEIGHT_SIZE = 257;
const MAX_TEXTURE_BYTES = 1_400_000;
const TILE = 256;
const WORLD = 2 * Math.PI * 6378137;

export const NAIP = {
  source: "USGS NAIP Imagery (The National Map)",
  attribution: "Aerial imagery: USDA NAIP via USGS National Map",
  url: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
};
export const USGS_TILES = {
  source: "USGS Imagery Only (The National Map)",
  attribution: "Aerial imagery: USGS National Map",
  url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer",
  zoom: 16, // the tile cache stops here; z17 returns 404
};
export const TERRARIUM = {
  source: "USGS 3DEP-derived terrain (AWS Terrain Tiles)",
  attribution: "Map elevation: USGS 3DEP via AWS Terrain Tiles · not a survey",
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium",
  zoom: 15,
};

export type FetchBytes = (url: string, signal: AbortSignal) => Promise<Buffer>;

export interface BuildLandOptions {
  /** HTTP GET returning the body; throws on a non-2xx status. */
  fetchBytes?: FetchBytes;
  /** Limit for each upstream request. The bake script uses 60 s. */
  requestTimeoutMs?: number;
  /** Tries per upstream request. */
  attempts?: number;
  /** Fallback notes (NAIP unavailable, and so on). */
  warn?: (message: string) => void;
  now?: () => Date;
}

export interface LandAssetFiles {
  meta: LandMeta;
  /** JPEG, at most MAX_TEXTURE_BYTES. */
  imagery: Buffer;
  /** 8-bit grayscale PNG: 0 is minMeters, 255 is maxMeters. */
  height: Buffer;
}

interface Raster {
  width: number;
  height: number;
  /** RGBA, row 0 at the top. */
  data: Uint8Array;
}

const defaultFetchBytes: FetchBytes = async (url, signal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

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
    const luma =
      (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
    sum += luma;
    sumSquares += luma * luma;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSquares / count - mean * mean)) < 3;
}

/** Tile column and row (fractional) for a Mercator point at a zoom. */
function tileXY(
  x: number,
  y: number,
  zoom: number,
): { tx: number; ty: number } {
  const n = 2 ** zoom;
  return {
    tx: ((x + WORLD / 2) / WORLD) * n,
    ty: ((WORLD / 2 - y) / WORLD) * n,
  };
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
function sample(
  values: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
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

interface Stitched {
  raster: Raster;
  originX: number;
  originY: number;
}

/** Resample a stitched tile raster's region into a square float grid. */
function resample(
  stitched: Stitched,
  region: MercatorRegion,
  zoom: number,
  size: number,
  channel: (data: Uint8Array, offset: number) => number,
): Float32Array {
  const { raster, originX, originY } = stitched;
  const source = new Float32Array(raster.width * raster.height);
  for (let i = 0; i < source.length; i++)
    source[i] = channel(raster.data, i * 4);
  const out = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Pixel centers span the region edge to edge.
      const x =
        region.west + ((col + 0.5) / size) * (region.east - region.west);
      const y =
        region.north - ((row + 0.5) / size) * (region.north - region.south);
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

function encodeJpeg(raster: Raster): Buffer {
  for (let quality = 88; quality >= 50; quality -= 6) {
    const encoded = jpeg.encode(
      {
        data: Buffer.from(raster.data),
        width: raster.width,
        height: raster.height,
      },
      quality,
    ).data;
    if (encoded.length <= MAX_TEXTURE_BYTES) return encoded;
  }
  throw new Error("Imagery will not fit the texture budget.");
}

/**
 * Builds the land block assets for a parcel from its published boundary:
 * NAIP imagery (USGS tiles if NAIP has none), Terrarium elevation.
 */
export async function buildLandAssets(
  parcel: Pick<Parcel, "key" | "sourceParcelId" | "geometry">,
  options: BuildLandOptions = {},
): Promise<LandAssetFiles> {
  const fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  const requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
  const attempts = options.attempts ?? 3;
  const warn = options.warn ?? (() => {});
  const now = options.now ?? (() => new Date());

  async function get(url: string): Promise<Buffer> {
    let last: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fetchBytes(url, AbortSignal.timeout(requestTimeoutMs));
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  /** Fetch every tile touching the region and stitch them into one raster. */
  async function stitch(
    region: MercatorRegion,
    zoom: number,
    urlFor: (x: number, y: number) => string,
    decode: (bytes: Buffer) => Raster,
  ): Promise<Stitched> {
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
          get(urlFor(tx, ty)).then((bytes) => {
            const tile = decode(bytes);
            if (tile.width !== TILE || tile.height !== TILE) {
              throw new Error(
                `Unexpected tile size ${tile.width}x${tile.height}.`,
              );
            }
            for (let row = 0; row < TILE; row++) {
              const from = row * TILE * 4;
              const to =
                ((ty - y0) * TILE + row) * width * 4 + (tx - x0) * TILE * 4;
              data.set(tile.data.subarray(from, from + TILE * 4), to);
            }
          }),
        );
      }
    }
    await Promise.all(jobs);
    return { raster: { width, height, data }, originX: x0, originY: y0 };
  }

  async function naipImagery(region: MercatorRegion): Promise<Raster> {
    const query = new URLSearchParams({
      bbox: [region.west, region.south, region.east, region.north].join(","),
      bboxSR: "3857",
      imageSR: "3857",
      size: `${IMAGERY_SIZE},${IMAGERY_SIZE}`,
      format: "jpg",
      interpolation: "RSP_BilinearInterpolation",
      f: "image",
    });
    const raster = decodeJpeg(await get(`${NAIP.url}/exportImage?${query}`));
    if (
      raster.width !== IMAGERY_SIZE ||
      raster.height !== IMAGERY_SIZE ||
      looksBlank(raster)
    ) {
      throw new Error("NAIP returned no usable imagery for this region.");
    }
    return raster;
  }

  async function usgsTileImagery(region: MercatorRegion): Promise<Raster> {
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
      const plane = resample(
        stitched,
        region,
        zoom,
        size,
        (bytes, offset) => bytes[offset + c]!,
      );
      for (let i = 0; i < plane.length; i++) {
        data[i * 4 + c] = Math.min(255, Math.max(0, Math.round(plane[i]!)));
      }
    }
    return { width: size, height: size, data };
  }

  async function elevation(
    region: MercatorRegion,
  ): Promise<{ png: Buffer; min: number; max: number }> {
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
      (bytes, offset) =>
        bytes[offset]! * 256 +
        bytes[offset + 1]! +
        bytes[offset + 2]! / 256 -
        32768,
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
    return {
      png: PNG.sync.write(png, { colorType: 0, inputHasAlpha: true }),
      min,
      max,
    };
  }

  const region = landRegion(parcel.geometry.geojson);
  const centerLat = mercatorLat((region.south + region.north) / 2);
  // Mercator stretches distance by 1 / cos(latitude); undo it for ground meters.
  const ground =
    (region.east - region.west) * Math.cos((centerLat * Math.PI) / 180);

  // Imagery and elevation come from different services: fetch in parallel.
  const imageryJob = naipImagery(region)
    .then((raster) => ({ raster, source: NAIP }))
    .catch(async (error: unknown) => {
      warn(
        `NAIP failed (${error instanceof Error ? error.message : String(error)}); using USGS tiles.`,
      );
      return { raster: await usgsTileImagery(region), source: USGS_TILES };
    });
  const [imagery, heights] = await Promise.all([imageryJob, elevation(region)]);

  const meta: LandMeta = {
    version: LAND_META_VERSION,
    parcelKey: parcel.key,
    sourceParcelId: parcel.sourceParcelId,
    retrievedAt: now().toISOString(),
    bbox: {
      west: mercatorLng(region.west),
      south: mercatorLat(region.south),
      east: mercatorLng(region.east),
      north: mercatorLat(region.north),
    },
    groundMeters: { width: ground, depth: ground },
    imagery: {
      file: "imagery.jpg",
      width: imagery.raster.width,
      height: imagery.raster.height,
      source: imagery.source.source,
      attribution: imagery.source.attribution,
      sourceUrl: imagery.source.url,
      metersPerPixel: ground / imagery.raster.width,
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

  return { meta, imagery: encodeJpeg(imagery.raster), height: heights.png };
}
