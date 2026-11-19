import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import { PNG } from "pngjs";
import { z } from "zod";
import { toEsriPolygon } from "./femaFlood.js";
import { bounds, edgesInBand, inside, parcelRings } from "./sampling.js";

/**
 * The U.S. Fish and Wildlife Service's National Wetlands Inventory (NWI),
 * queried only from the API. Layer IDs and fields were read from the live
 * service directories (`?f=json`) on 2026-11-18.
 */
export const NWI_SERVICE =
  "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer";

/** Wetland and deepwater polygons (`ATTRIBUTE`, `WETLAND_TYPE`). */
export const NWI_WETLANDS_LAYER = `${NWI_SERVICE}/0`;

/**
 * The imagery each NWI mapping project was drawn from (`IMAGE_YR`). A lot
 * with no project here has no NWI mapping, so "no wetland" cannot be said.
 */
export const NWI_IMAGE_YEAR_LAYER =
  "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Data_Source/MapServer/3";

/**
 * Where NWI has digital mapping (`STATUS`). Its service description says
 * Alaska is the only area with no data. NWI_OHIO_STATUS_QUERY asks which
 * status areas touch Ohio's bounding box; on 2026-11-18 the only answer was
 * `Digital`, which backs `environmental` in /api/coverage for all 88
 * counties. The recorded answer is test/fixtures/report/nwi-ohio-status.json;
 * re-record with `pnpm record:report nwi-ohio-status`.
 */
export const NWI_STATUS_LAYER =
  "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands_Status/MapServer/0";

/** Ohio's bounding box in WGS84, Lake Erie waters included. */
const OHIO_EXTENT = { xmin: -84.83, ymin: 38.4, xmax: -80.51, ymax: 42.33 };

export const NWI_OHIO_STATUS_QUERY = `${NWI_STATUS_LAYER}/query?${new URLSearchParams(
  {
    geometry: JSON.stringify({
      ...OHIO_EXTENT,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "STATUS",
    returnGeometry: "false",
    f: "json",
  },
).toString()}`;

/** NWI's public mapper, for a person to look a lot up by hand. */
export const NWI_MAPPER =
  "https://www.fws.gov/program/national-wetlands-inventory/wetlands-mapper";

/**
 * The layer's `WETLAND_TYPE` values, from its renderer on 2026-11-18. Each
 * gets its own colour when the lot is drawn; a type outside this list makes
 * the answer unusable rather than uncounted.
 */
export const NWI_WETLAND_TYPES = [
  "Estuarine and Marine Deepwater",
  "Estuarine and Marine Wetland",
  "Freshwater Emergent Wetland",
  "Freshwater Forested/Shrub Wetland",
  "Freshwater Pond",
  "Lake",
  "Other",
  "Riverine",
] as const;

/** One colour per type, far apart so blended edge pixels stay ambiguous. */
const PALETTE: readonly (readonly [number, number, number])[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
  [128, 0, 0],
  [0, 0, 128],
];

/**
 * A pixel belongs to a type when it is mostly opaque and within this RGB
 * distance of the type's colour. Anti-aliased edges between two types, or
 * between a type and the transparent background, fall outside and are not
 * counted; at the sizes below that is under a metre along each edge.
 */
const MAX_COLOUR_DISTANCE = 64;
const MIN_ALPHA = 128;

/** Pixels along the image's longer side. */
export const RENDER_LONG_SIDE = 512;
/** The service's largest image side (`maxImageWidth`, `maxImageHeight`). */
const MAX_IMAGE_SIDE = 2048;
/**
 * The wetland layer is not drawn beyond 1:250,000 (`minScale`). Images stay
 * well inside it: at 96 dpi a pixel is 0.0254 / 96 m of screen.
 */
const MAX_SCALE = 200_000;
const METRES_PER_PIXEL_AT_SCALE_1 = 0.0254 / 96;

export interface Wetland {
  /** NWI `WETLAND_TYPE`, e.g. `Freshwater Emergent Wetland`. */
  type: string;
  /** NWI (Cowardin) codes of this type on the lot, e.g. `PEM1A`. */
  codes: string[];
  /** Approximate share of the parcel's area, 0 to 1. */
  share: number;
}

/**
 * The adapter outcomes (DataContract, "Provider normalization"). `found`
 * with no wetlands means NWI has mapped this lot and drew none on it.
 */
export type WetlandsOutcome =
  | {
      outcome: "found";
      retrievedAt: string;
      /** Largest share first. Empty when NWI maps none on the lot. */
      wetlands: Wetland[];
      /** Share of the parcel inside any mapped wetland. */
      share: number;
      /** Years of the imagery NWI mapped this lot from, oldest first. */
      imageYears: number[];
    }
  | {
      /** No NWI mapping project covers the lot. */
      outcome: "missing";
      retrievedAt: string;
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface NwiWetlandsClient {
  /** Never throws. Aborting `signal` yields `timeout`. */
  wetlands(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<WetlandsOutcome>;
}

export interface NwiWetlandsClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const wetlandsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        ATTRIBUTE: z.string().nullish(),
        WETLAND_TYPE: z.string().nullish(),
      }),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const imageYearSchema = z.object({
  features: z.array(
    z.object({ attributes: z.object({ IMAGE_YR: z.number().nullish() }) }),
  ),
});

class NwiUnavailable extends Error {
  constructor() {
    super("NWI returned an unusable answer");
    this.name = "NwiUnavailableError";
  }
}

export function createNwiWetlandsClient(
  options: NwiWetlandsClientOptions = {},
): NwiWetlandsClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  /** One POST (the parcel polygon can be too long for a URL). */
  async function post(
    url: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ) {
    const response = await fetchImpl(url, {
      method: "POST",
      signal,
      headers: {
        accept: params.f === "image" ? "image/png" : "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!response.ok) throw new NwiUnavailable();
    return response;
  }

  async function query<T>(
    layer: string,
    geometry: string,
    outFields: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await post(
      `${layer}/query`,
      {
        geometry,
        geometryType: "esriGeometryPolygon",
        inSR: "4326",
        // NWI's server does not answer the interior-overlap relation that the
        // county layers use (it timed out at 60 s on 2026-11-18). Polygons
        // that only touch the lot's edge come back here, and the drawing
        // below measures them at or near 0%.
        spatialRel: "esriSpatialRelIntersects",
        outFields,
        returnDistinctValues: "true",
        returnGeometry: "false",
        f: "json",
      },
      signal,
    );
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new NwiUnavailable();
    return parsed.data;
  }

  /**
   * Wetland shares, measured on NWI's own drawing of the lot. NWI cannot
   * return the polygons themselves here: a river is one polygon for a whole
   * network (Big Walnut Creek's is 225,680 acres), and asking for its
   * geometry fails with HTTP 500 after 15 s. Drawing is clipped by the
   * server, so the answer is one small PNG. Each type present is drawn in
   * its own colour with no outline, and a pixel counts toward a type when
   * its centre lies inside the parcel.
   */
  async function draw(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    types: string[],
    signal: AbortSignal,
  ): Promise<{ shares: Map<string, number>; share: number }> {
    const view = renderView(geometry);
    const dynamicLayers = types.map((type, index) => ({
      id: 100 + index,
      source: { type: "mapLayer", mapLayerId: 0 },
      // The export only accepts the field by its qualified name.
      definitionExpression: `Wetlands.WETLAND_TYPE = '${type.replaceAll("'", "''")}'`,
      drawingInfo: {
        renderer: {
          type: "simple",
          symbol: {
            type: "esriSFS",
            style: "esriSFSSolid",
            color: [...colourOf(type), 255],
            outline: { type: "esriSLS", style: "esriSLSNull" },
          },
        },
      },
    }));
    const response = await post(
      `${NWI_SERVICE}/export`,
      {
        bbox: view.bbox.join(","),
        bboxSR: "3857",
        imageSR: "3857",
        size: `${view.width},${view.height}`,
        dpi: "96",
        format: "png32",
        transparent: "true",
        dynamicLayers: JSON.stringify(dynamicLayers),
        f: "image",
      },
      signal,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    let png: PNG;
    try {
      png = PNG.sync.read(bytes);
    } catch {
      // An error comes back as JSON or HTML instead of an image.
      throw new NwiUnavailable();
    }
    if (png.width !== view.width || png.height !== view.height) {
      throw new NwiUnavailable();
    }
    return measureDrawing(view, png, types);
  }

  async function wetlands(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<WetlandsOutcome> {
    try {
      const esri = toEsriPolygon(geometry);
      const [mapped, imagery] = await Promise.all([
        query(
          NWI_WETLANDS_LAYER,
          esri,
          "ATTRIBUTE,WETLAND_TYPE",
          wetlandsSchema,
          signal,
        ),
        query(NWI_IMAGE_YEAR_LAYER, esri, "IMAGE_YR", imageYearSchema, signal),
      ]);
      if (mapped.exceededTransferLimit) throw new NwiUnavailable();
      const retrievedAt = now().toISOString();
      const imageYears = [
        ...new Set(
          imagery.features.flatMap(({ attributes }) =>
            typeof attributes.IMAGE_YR === "number" && attributes.IMAGE_YR > 0
              ? [attributes.IMAGE_YR]
              : [],
          ),
        ),
      ].sort((a, b) => a - b);

      const codes = new Map<string, Set<string>>();
      for (const { attributes } of mapped.features) {
        const type = attributes.WETLAND_TYPE?.trim();
        if (!type) continue;
        if (!(NWI_WETLAND_TYPES as readonly string[]).includes(type)) {
          throw new NwiUnavailable();
        }
        const set = codes.get(type) ?? new Set<string>();
        const code = attributes.ATTRIBUTE?.trim();
        if (code) set.add(code);
        codes.set(type, set);
      }
      if (codes.size === 0) {
        if (imagery.features.length === 0) {
          return { outcome: "missing", retrievedAt };
        }
        return {
          outcome: "found",
          retrievedAt,
          wetlands: [],
          share: 0,
          imageYears,
        };
      }

      const types = [...codes.keys()];
      const drawn = await draw(geometry, types, signal);
      return {
        outcome: "found",
        retrievedAt,
        wetlands: types
          .map((type) => ({
            type,
            codes: [...(codes.get(type) ?? [])].sort(),
            share: drawn.shares.get(type) ?? 0,
          }))
          .sort((a, b) => b.share - a.share || a.type.localeCompare(b.type)),
        share: drawn.share,
        imageYears,
      };
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { wetlands };
}

function colourOf(type: string): readonly [number, number, number] {
  const index = (NWI_WETLAND_TYPES as readonly string[]).indexOf(type);
  const colour = PALETTE[index];
  if (!colour) throw new NwiUnavailable();
  return colour;
}

export interface RenderView {
  /** Web Mercator box [xmin, ymin, xmax, ymax], matching width:height. */
  bbox: [number, number, number, number];
  width: number;
  height: number;
  /** The parcel's edges in Web Mercator metres. */
  edges: Float64Array;
}

const EARTH_RADIUS_M = 6_378_137;

/** WGS84 longitude/latitude to Web Mercator (EPSG:3857) metres. */
export function toWebMercator([lon = 0, lat = 0]: number[]): [number, number] {
  const x = (lon * Math.PI * EARTH_RADIUS_M) / 180;
  const y =
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

/**
 * The image to ask for: the parcel's Web Mercator bounding box, widened on
 * one side so it has exactly the image's proportions (the server would
 * otherwise widen it itself, shifting every pixel).
 */
export function renderView(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): RenderView {
  const rings = parcelRings(geometry).map((ring) => ring.map(toWebMercator));
  const box = bounds(rings.flat());
  const dx = Math.max(box.maxX - box.minX, 1);
  const dy = Math.max(box.maxY - box.minY, 1);
  const long = Math.max(dx, dy);
  const side = Math.min(
    MAX_IMAGE_SIDE,
    Math.max(
      RENDER_LONG_SIDE,
      Math.ceil(long / (MAX_SCALE * METRES_PER_PIXEL_AT_SCALE_1)),
    ),
  );
  if (long / side / METRES_PER_PIXEL_AT_SCALE_1 > MAX_SCALE) {
    throw new NwiUnavailable();
  }
  const width = dx >= dy ? side : Math.max(1, Math.round((side * dx) / dy));
  const height = dx >= dy ? Math.max(1, Math.round((side * dy) / dx)) : side;
  const metresPerPixel = long / side;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const halfW = (width * metresPerPixel) / 2;
  const halfH = (height * metresPerPixel) / 2;
  return {
    bbox: [cx - halfW, cy - halfH, cx + halfW, cy + halfH],
    width,
    height,
    edges: edgesInBand(rings, {
      minX: cx - halfW,
      minY: cy - halfH,
      maxX: cx + halfW,
      maxY: cy + halfH,
    }),
  };
}

/** Shares of the parcel's pixels in each type's colour, and in any. */
export function measureDrawing(
  view: RenderView,
  png: { width: number; height: number; data: Uint8Array },
  types: string[],
): { shares: Map<string, number>; share: number } {
  const colours = types.map((type) => ({ type, rgb: colourOf(type) }));
  const [xmin, , , ymax] = view.bbox;
  const pixel = (view.bbox[2] - xmin) / view.width;
  const counts = new Map<string, number>();
  let total = 0;
  let wet = 0;
  for (let row = 0; row < png.height; row += 1) {
    const y = ymax - (row + 0.5) * pixel;
    for (let col = 0; col < png.width; col += 1) {
      const x = xmin + (col + 0.5) * pixel;
      if (!inside(x, y, view.edges)) continue;
      total += 1;
      const at = (row * png.width + col) * 4;
      if ((png.data[at + 3] ?? 0) < MIN_ALPHA) continue;
      const r = png.data[at] ?? 0;
      const g = png.data[at + 1] ?? 0;
      const b = png.data[at + 2] ?? 0;
      let best: string | undefined;
      let bestDistance = MAX_COLOUR_DISTANCE;
      for (const { type, rgb } of colours) {
        const distance = Math.hypot(r - rgb[0], g - rgb[1], b - rgb[2]);
        if (distance <= bestDistance) {
          best = type;
          bestDistance = distance;
        }
      }
      if (!best) continue;
      counts.set(best, (counts.get(best) ?? 0) + 1);
      wet += 1;
    }
  }
  if (total === 0) throw new NwiUnavailable();
  return {
    shares: new Map([...counts].map(([type, n]) => [type, n / total])),
    share: wet / total,
  };
}
