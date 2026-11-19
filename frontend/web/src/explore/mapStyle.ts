import type { GeoJsonMultiPolygon, GeoJsonPolygon, ParcelOutline } from "@groundtruth/shared";
import type { LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import { EXPLORE_MAP } from "../content/explore";

/** Outlines are asked for, and drawn, from this zoom in. */
export const MIN_PARCEL_ZOOM = 15;

/**
 * Aerial imagery from this zoom in. Further out it carries no place names, so
 * the street map stands in for orientation: you can find Columbus at state
 * scale, then see the ground as you zoom toward a lot.
 */
const AERIAL_FROM_ZOOM = 10;

/** Ohio, west-south to east-north: the first view. */
export const OHIO_BOUNDS: LngLatBoundsLike = [
  [-84.82, 38.4],
  [-80.52, 41.98],
];

/** Panning stops a little past Ohio. */
export const MAX_BOUNDS: LngLatBoundsLike = [
  [-87.6, 36.9],
  [-77.7, 43.6],
];

export type Basemap = "imagery" | "streets";

/**
 * Free basemaps, no key: USGS orthoimagery (cached to level 16, drawn larger
 * past it) and OpenStreetMap's standard tiles. Both send CORS headers, which
 * WebGL needs (checked 2026-11-18).
 */
const BASEMAP_SOURCES = {
  imagery: {
    type: "raster",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution:
      '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noreferrer">USGS The National Map</a>: Orthoimagery',
  },
  streets: {
    type: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  },
} as const;

/** The raster layers each basemap shows. */
export const BASEMAP_LAYERS: Record<Basemap, readonly string[]> = {
  imagery: ["imagery", "orientation"],
  streets: ["streets"],
};

/** Light hairlines read on aerial imagery; dark ones on the pale street map. */
export const OUTLINE_PAINT: Record<
  Basemap,
  { line: string; hover: string; fill: string }
> = {
  imagery: {
    line: "rgba(245, 245, 247, 0.72)",
    hover: "rgba(255, 255, 255, 0.16)",
    fill: "rgba(255, 255, 255, 0.02)",
  },
  streets: {
    line: "rgba(10, 10, 10, 0.62)",
    hover: "rgba(10, 10, 10, 0.12)",
    fill: "rgba(10, 10, 10, 0.02)",
  },
};

/** Gold: the parcel in view. */
const GOLD = "#c4a15a";

/** The GeoJSON the map's two parcel sources hold. */
export interface OutlineCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { key?: string };
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  }[];
}

const EMPTY: OutlineCollection = {
  type: "FeatureCollection",
  features: [],
};

export function exploreStyle(basemap: Basemap): StyleSpecification {
  const paint = OUTLINE_PAINT[basemap];
  return {
    version: 8,
    sources: {
      imagery: { ...BASEMAP_SOURCES.imagery, tiles: [...BASEMAP_SOURCES.imagery.tiles] },
      streets: { ...BASEMAP_SOURCES.streets, tiles: [...BASEMAP_SOURCES.streets.tiles] },
      parcels: {
        type: "geojson",
        data: EMPTY,
        promoteId: "key",
        attribution: EXPLORE_MAP.attribution,
      },
      selected: { type: "geojson", data: EMPTY },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b0b0c" } },
      {
        id: "imagery",
        type: "raster",
        source: "imagery",
        minzoom: AERIAL_FROM_ZOOM,
        layout: { visibility: basemap === "imagery" ? "visible" : "none" },
      },
      {
        id: "orientation",
        type: "raster",
        source: "streets",
        maxzoom: AERIAL_FROM_ZOOM,
        layout: { visibility: basemap === "imagery" ? "visible" : "none" },
      },
      {
        id: "streets",
        type: "raster",
        source: "streets",
        layout: { visibility: basemap === "streets" ? "visible" : "none" },
      },
      {
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        minzoom: MIN_PARCEL_ZOOM,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            paint.hover,
            paint.fill,
          ],
        },
      },
      {
        id: "parcels-line",
        type: "line",
        source: "parcels",
        minzoom: MIN_PARCEL_ZOOM,
        paint: {
          "line-color": paint.line,
          "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.6, 18, 1.4],
        },
      },
      {
        id: "selected-fill",
        type: "fill",
        source: "selected",
        paint: { "fill-color": GOLD, "fill-opacity": 0.2 },
      },
      {
        id: "selected-line",
        type: "line",
        source: "selected",
        paint: { "line-color": GOLD, "line-width": 2.5 },
      },
    ],
  };
}

export function parcelFeatures(
  parcels: readonly ParcelOutline[],
): OutlineCollection {
  return {
    type: "FeatureCollection",
    features: parcels.map((parcel) => ({
      type: "Feature",
      properties: { key: parcel.key },
      geometry: parcel.outline,
    })),
  };
}

export function selectedFeatures(
  outline: ParcelOutline["outline"] | undefined,
): OutlineCollection {
  return outline
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: outline }] }
    : EMPTY;
}
