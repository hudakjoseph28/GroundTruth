// The land block's asset contract: what scripts/bake-parcel.ts (baked files
// in the web app) and GET /api/parcels/:parcelKey/land (built on demand)
// produce, and what the web's land block reads. Pure functions, no runtime
// dependencies.
import type { Parcel } from "./contract.js";
export const LAND_META_VERSION = 1;

export interface LandMeta {
  version: typeof LAND_META_VERSION;
  parcelKey: string;
  sourceParcelId: string;
  /** When the tiles were fetched, UTC ISO 8601. */
  retrievedAt: string;
  /** The baked region: the parcel's bounding box, squared and padded. Degrees. */
  bbox: { west: number; south: number; east: number; north: number };
  /** Size of that region on the ground, in meters. */
  groundMeters: { width: number; depth: number };
  imagery: {
    file: string;
    width: number;
    height: number;
    source: string;
    attribution: string;
    sourceUrl: string;
    metersPerPixel: number;
  };
  elevation: {
    file: string;
    width: number;
    height: number;
    /** Heights in the PNG run from 0 (minMeters) to 255 (maxMeters). */
    minMeters: number;
    maxMeters: number;
    source: string;
    attribution: string;
    sourceUrl: string;
  };
}

/** Folder under /parcels that holds one parcel's baked assets. */
export function landAssetDir(sourceParcelId: string): string {
  return sourceParcelId.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function outerRing(geojson: Parcel["geometry"]["geojson"]): number[][] {
  const ring =
    geojson.type === "Polygon"
      ? geojson.coordinates[0]
      : geojson.coordinates[0]?.[0];
  return ring && ring.length >= 3 ? ring : [];
}

const EARTH_RADIUS = 6378137;
const RAD = Math.PI / 180;

/** Web Mercator meters, the projection both tile sets are cut in. */
export function mercatorX(lng: number): number {
  return lng * RAD * EARTH_RADIUS;
}

export function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) * EARTH_RADIUS;
}

export function mercatorLng(x: number): number {
  return x / EARTH_RADIUS / RAD;
}

export function mercatorLat(y: number): number {
  return (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / RAD;
}

/**
 * Where a point sits in the baked region: u runs west to east, v north to
 * south, both 0..1, matching the pixel rows of the imagery and height map.
 */
export function regionUV(
  bbox: LandMeta["bbox"],
  lng: number,
  lat: number,
): { u: number; v: number } {
  const west = mercatorX(bbox.west);
  const east = mercatorX(bbox.east);
  const south = mercatorY(bbox.south);
  const north = mercatorY(bbox.north);
  return {
    u: (mercatorX(lng) - west) / (east - west),
    v: (north - mercatorY(lat)) / (north - south),
  };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Narrow fetched JSON to LandMeta. A missing parcel returns the app shell, not JSON. */
export function isLandMeta(value: unknown): value is LandMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Partial<LandMeta>;
  return (
    meta.version === LAND_META_VERSION &&
    typeof meta.imagery?.file === "string" &&
    typeof meta.imagery.attribution === "string" &&
    typeof meta.elevation?.file === "string" &&
    typeof meta.elevation.attribution === "string" &&
    isNumber(meta.elevation.minMeters) &&
    isNumber(meta.elevation.maxMeters) &&
    isNumber(meta.bbox?.west) &&
    isNumber(meta.bbox.east) &&
    isNumber(meta.bbox.south) &&
    isNumber(meta.bbox.north) &&
    isNumber(meta.groundMeters?.width) &&
    isNumber(meta.groundMeters.depth)
  );
}

/** A region in Web Mercator meters. */
export interface MercatorRegion {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Extra ground on every side of the parcel's bounding box, as a share of its longer side. */
export const LAND_REGION_PADDING = 0.15;

/**
 * The region a land block covers: the parcel's bounding box in Web Mercator
 * meters, squared and padded. Throws when the boundary has no outer ring.
 */
export function landRegion(
  geojson: Parcel["geometry"]["geojson"],
): MercatorRegion {
  const ring = outerRing(geojson);
  if (!ring.length) throw new Error("The parcel has no drawable boundary.");
  const xs = ring.map((pair) => mercatorX(pair[0] ?? 0));
  const ys = ring.map((pair) => mercatorY(pair[1] ?? 0));
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  const side =
    Math.max(east - west, north - south) * (1 + 2 * LAND_REGION_PADDING);
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  return {
    west: cx - side / 2,
    south: cy - side / 2,
    east: cx + side / 2,
    north: cy + side / 2,
  };
}
