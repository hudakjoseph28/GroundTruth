// Map layers drawn on a parcel's land block (GET /api/parcels/:key/layers).
// Each layer comes from the same source as one of the report's checks and
// covers the land block's region: the parcel's bounding box, squared and
// padded (landRegion in land.ts).
import type { ParcelKey, Source } from "./contract.js";

export const MAP_LAYER_IDS = [
  "flood",
  "streamSetback",
  "wetlands",
  "zoning",
  "roadRightOfWay",
] as const;

export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

export type MapLayerStatus =
  /** The source answered and maps something drawable in view. */
  | "found"
  /** The source answered and maps nothing drawable in view. */
  | "none"
  /** GroundTruth has no source for this layer here (e.g. zoning outside Franklin). */
  | "notCovered"
  /** The source failed or ran out of time. Nothing is concluded. */
  | "unavailable";

/** One outline from the source, clipped to the view. */
export interface MapShape {
  /**
   * Rings of [longitude, latitude] positions, outer rings and holes alike,
   * drawn with the even-odd rule (ArcGIS rings are not grouped into polygons).
   */
  rings: number[][][];
  /** `strong` for the layer's main feature (a Special Flood Hazard Area), `light` for a lesser one. */
  tone: "strong" | "light";
  /** A short name drawn on the map: a zoning district code. */
  label?: string;
}

/** A measured share of the lot. */
export interface MapLayerShare {
  name: string;
  /** 0 to 1, by the same point sampling as the report check. */
  share: number;
}

export interface MapLayer {
  id: MapLayerId;
  status: MapLayerStatus;
  shapes: MapShape[];
  /**
   * The source's own drawing of the view (NWI cannot return its polygons
   * here): a PNG data URL covering `ParcelLayers.bbox` exactly, in Web
   * Mercator, opaque where the source maps something.
   */
  image?: string;
  /** What the source maps anywhere in view, named for a buyer. */
  inView: string[];
  /** Shares of the lot, only where measured. Largest first. */
  onLot?: MapLayerShare[];
  /** Metres from the lot's boundary to the drawn right-of-way; 0 when it touches. */
  distanceM?: number;
  /** Absent when the status is `notCovered`. */
  source?: Source;
}

export interface ParcelLayers {
  parcelKey: ParcelKey;
  /** The land block's region in degrees. */
  bbox: { west: number; south: number; east: number; north: number };
  generatedAt: string;
  /** One per MAP_LAYER_IDS, in that order. */
  layers: MapLayer[];
}

/** Narrow fetched JSON to ParcelLayers (shape only; contents are drawn defensively). */
export function isParcelLayers(value: unknown): value is ParcelLayers {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<ParcelLayers>;
  const bbox = body.bbox;
  return (
    typeof body.parcelKey === "string" &&
    typeof bbox === "object" &&
    bbox !== null &&
    [bbox.west, bbox.south, bbox.east, bbox.north].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) &&
    Array.isArray(body.layers) &&
    body.layers.every(
      (layer) =>
        typeof layer === "object" &&
        layer !== null &&
        (MAP_LAYER_IDS as readonly string[]).includes(layer.id) &&
        typeof layer.status === "string" &&
        Array.isArray(layer.shapes) &&
        Array.isArray(layer.inView),
    )
  );
}
