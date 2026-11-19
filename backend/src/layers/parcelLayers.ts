import {
  landRegion,
  MAP_LAYER_IDS,
  mercatorLat,
  mercatorLng,
  type GeoJsonMultiPolygon,
  type GeoJsonPolygon,
  type MapLayer,
  type MapLayerId,
  type MapShape,
  type Parcel,
  type ParcelLayers,
  type Source,
} from "@groundtruth/shared";
import { PNG } from "pngjs";
import { z } from "zod";
import {
  hasNfhlStudy,
  NFHL_LAYERS,
  nfhlLayerUrl,
  type FloodZone,
} from "../reports/femaFlood.js";
import { zoneLabel } from "../reports/floodCheck.js";
import {
  FCEDP_ZONING_LAYER,
  FRANKLIN_COUNTY_FIPS,
  measure as measureZoning,
  NAMED_WHERE,
  normalizeCode,
  ZONING_CLASS_NAMES,
} from "../reports/franklinZoning.js";
import {
  FRANKLIN_ROW_LAYER,
  ROW_WHERE,
  TOUCH_TOLERANCE_M,
} from "../reports/franklinAccess.js";
import {
  FRANKLIN_STREAM_BUFFERS_LAYER,
  measureSetbacks,
  type Outline,
  type StreamSetbacksInView,
} from "../reports/franklinStreamBuffers.js";
import {
  NWI_IMAGE_YEAR_LAYER,
  NWI_SERVICE,
  NWI_WETLANDS_LAYER,
} from "../reports/nwiWetlands.js";
import {
  bounds,
  edgesInBand,
  inside,
  localProjection,
  overlaps,
  parcelRings,
  type Box,
} from "../reports/sampling.js";

/**
 * The map layers on a parcel's land block. Each comes from the source one
 * of the report's checks queries, asked about the whole land-block region
 * instead of only the lot, and each runs on its own limit: one slow source
 * marks its own layer `unavailable` and never hides the others.
 */

/** Each layer's own limit. The first Big Darby outline download is ~1.5 s. */
export const LAYER_TIMEOUT_MS = 10_000;

/** Side of the NWI drawing of the view, in pixels. */
export const WETLANDS_IMAGE_SIZE = 1024;

/** NWI draws nothing beyond 1:250,000; stay inside it (as nwiWetlands.ts). */
const NWI_MAX_SCALE = 200_000;
const METRES_PER_PIXEL_AT_SCALE_1 = 0.0254 / 96;

export type LayerBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export interface ParcelLayerOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** Shares the Franklin stream-setback outline cache with the report. */
  streamSetbacks: StreamSetbacksInView;
  timeoutMs?: number;
}

class LayerUnavailable extends Error {
  constructor(what: string) {
    super(`${what} returned an unusable answer`);
    this.name = "LayerUnavailableError";
  }
}

/** The land block's region in degrees, as the web's land assets use it. */
export function layerBox(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): LayerBox {
  const region = landRegion(geometry);
  return {
    west: mercatorLng(region.west),
    south: mercatorLat(region.south),
    east: mercatorLng(region.east),
    north: mercatorLat(region.north),
  };
}

export function createParcelLayers(options: ParcelLayerOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? LAYER_TIMEOUT_MS;

  /**
   * One ArcGIS POST. A dropped connection is retried once (FEMA's server
   * resets the first connection now and then); HTTP errors are not.
   */
  async function post(
    url: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    const body = new URLSearchParams(params).toString();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          signal,
          headers: {
            accept: params.f === "image" ? "image/png" : "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        });
        if (!response.ok) throw new LayerUnavailable(url);
        return response;
      } catch (error) {
        if (
          signal.aborted ||
          attempt >= 1 ||
          error instanceof LayerUnavailable
        ) {
          throw error;
        }
      }
    }
  }

  async function query<T>(
    layer: string,
    box: LayerBox,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await post(
      `${layer}/query`,
      {
        geometry: JSON.stringify(envelope(box)),
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        ...params,
        f: "json",
      },
      signal,
    );
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new LayerUnavailable(layer);
    return parsed.data;
  }

  const withGeometry = {
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "7",
  };

  type Built = Omit<MapLayer, "id" | "status"> & {
    status?: MapLayer["status"];
  };

  async function flood(
    parcel: Parcel,
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<Built> {
    if (!hasNfhlStudy(parcel.countyFips)) return notCovered();
    const [drawable, all] = await Promise.all([
      query(
        nfhlLayerUrl(NFHL_LAYERS.floodHazardZones),
        box,
        {
          // Special Flood Hazard Areas and the 0.2% annual chance zone.
          // Zone X (minimal hazard) is named in view but not shaded.
          where: "SFHA_TF = 'T' OR ZONE_SUBTY LIKE '0.2 PCT%'",
          outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
          ...withGeometry,
        },
        floodSchema,
        signal,
      ),
      query(
        nfhlLayerUrl(NFHL_LAYERS.floodHazardZones),
        box,
        {
          where: "1=1",
          outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
          // NFHL refuses returnDistinctValues (HTTP 200 with a 400 error,
          // 2026-11-18), so names are deduplicated here.
          returnGeometry: "false",
        },
        floodSchema,
        signal,
      ),
    ]);
    if (drawable.exceededTransferLimit || all.exceededTransferLimit) {
      throw new LayerUnavailable("FEMA NFHL");
    }
    const retrievedAt = now().toISOString();
    const zoneOf = (attributes: FloodAttributes): FloodZone => ({
      zone: attributes.FLD_ZONE?.trim() ?? "",
      subtype: attributes.ZONE_SUBTY?.trim() || undefined,
      specialFloodHazardArea: attributes.SFHA_TF === "T",
    });
    const zones = drawable.features.flatMap((feature) => {
      const zone = zoneOf(feature.attributes);
      const rings = feature.geometry?.rings ?? [];
      if (!zone.zone || rings.length === 0) return [];
      return [{ zone, name: zoneLabel(zone), rings }];
    });
    const shapes = zones.flatMap(({ zone, name, rings }) =>
      shape(rings, box, zone.specialFloodHazardArea ? "strong" : "light", name),
    );
    const names = new Map<string, FloodZone>();
    for (const { attributes } of all.features) {
      const zone = zoneOf(attributes);
      if (!zone.zone) continue;
      names.set(zoneLabel(zone), zone);
    }
    const inView = [...names.entries()]
      .sort(
        ([a, za], [b, zb]) =>
          Number(zb.specialFloodHazardArea) -
            Number(za.specialFloodHazardArea) || a.localeCompare(b),
      )
      .map(([name]) => name);
    return {
      status: shapes.length > 0 ? "found" : "none",
      shapes,
      inView,
      onLot: shares(parcel.geometry.geojson, zones),
      source: {
        authority: "FEMA",
        title: "National Flood Hazard Layer: flood hazard zones",
        url: nfhlLayerUrl(NFHL_LAYERS.floodHazardZones),
        retrievedAt,
      },
    };
  }

  async function streamSetback(
    parcel: Parcel,
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<Built> {
    if (parcel.countyFips !== FRANKLIN_COUNTY_FIPS) return notCovered();
    const { retrievedAt, areas } = await options.streamSetbacks.setbacksInView(
      box,
      signal,
    );
    const shapes = areas.flatMap((area) =>
      shape(
        area.outline.rings.map((ring) => ring.coords),
        box,
        "strong",
        area.name,
      ),
    );
    const measured =
      areas.length > 0
        ? measureSetbacks(parcel.geometry.geojson, areas).setbacks
        : [];
    return {
      status: shapes.length > 0 ? "found" : "none",
      shapes,
      inView: [...new Set(areas.map((area) => area.name))].sort(),
      onLot: measured.filter((area) => area.share > 0),
      source: {
        authority: "Franklin County",
        title: "Franklin County Stream Buffers",
        url: FRANKLIN_STREAM_BUFFERS_LAYER,
        retrievedAt,
      },
    };
  }

  async function wetlands(
    _parcel: Parcel,
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<Built> {
    const [types, imagery] = await Promise.all([
      query(
        NWI_WETLANDS_LAYER,
        box,
        {
          outFields: "WETLAND_TYPE",
          returnDistinctValues: "true",
          returnGeometry: "false",
        },
        wetlandTypesSchema,
        signal,
      ),
      query(
        NWI_IMAGE_YEAR_LAYER,
        box,
        {
          outFields: "IMAGE_YR",
          returnDistinctValues: "true",
          returnGeometry: "false",
        },
        imageYearSchema,
        signal,
      ),
    ]);
    if (types.exceededTransferLimit) throw new LayerUnavailable("NWI");
    const retrievedAt = now().toISOString();
    const source: Source = {
      authority: "U.S. Fish and Wildlife Service",
      title: "National Wetlands Inventory",
      url: NWI_WETLANDS_LAYER,
      retrievedAt,
    };
    const inView = [
      ...new Set(
        types.features.flatMap(
          ({ attributes }) => attributes.WETLAND_TYPE?.trim() || [],
        ),
      ),
    ].sort();
    if (inView.length === 0) {
      // No mapping project here: NWI cannot say "none".
      if (imagery.features.length === 0) return notCovered();
      return { status: "none", shapes: [], inView, source };
    }
    return {
      status: "found",
      shapes: [],
      image: await drawWetlands(box, signal),
      inView,
      source,
    };
  }

  /**
   * NWI's own drawing of the view, one colour, no outline. NWI cannot return
   * the polygons (a river is one polygon for a whole network), but its export
   * is clipped by the server. Web Mercator, so the picture lines up with the
   * land block's imagery pixel for pixel.
   */
  async function drawWetlands(
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<string> {
    const region = mercatorBox(box);
    const metresPerPixel = (region.maxX - region.minX) / WETLANDS_IMAGE_SIZE;
    if (metresPerPixel / METRES_PER_PIXEL_AT_SCALE_1 > NWI_MAX_SCALE) {
      throw new LayerUnavailable("NWI (view too large)");
    }
    const response = await post(
      `${NWI_SERVICE}/export`,
      {
        bbox: [region.minX, region.minY, region.maxX, region.maxY].join(","),
        bboxSR: "3857",
        imageSR: "3857",
        size: `${WETLANDS_IMAGE_SIZE},${WETLANDS_IMAGE_SIZE}`,
        dpi: "96",
        format: "png32",
        transparent: "true",
        dynamicLayers: JSON.stringify([
          {
            id: 100,
            source: { type: "mapLayer", mapLayerId: 0 },
            drawingInfo: {
              renderer: {
                type: "simple",
                symbol: {
                  type: "esriSFS",
                  style: "esriSFSSolid",
                  color: [255, 255, 255, 255],
                  outline: { type: "esriSLS", style: "esriSLSNull" },
                },
              },
            },
          },
        ]),
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
      throw new LayerUnavailable("NWI export");
    }
    if (
      png.width !== WETLANDS_IMAGE_SIZE ||
      png.height !== WETLANDS_IMAGE_SIZE
    ) {
      throw new LayerUnavailable("NWI export");
    }
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }

  async function zoning(
    parcel: Parcel,
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<Built> {
    if (parcel.countyFips !== FRANKLIN_COUNTY_FIPS) return notCovered();
    const named = await query(
      FCEDP_ZONING_LAYER,
      box,
      { where: NAMED_WHERE, outFields: "ZONING,Zoning_Class", ...withGeometry },
      zoningSchema,
      signal,
    );
    if (named.exceededTransferLimit) {
      throw new LayerUnavailable("Franklin zoning");
    }
    const retrievedAt = now().toISOString();
    const districts = named.features.flatMap((feature) => {
      const code = normalizeCode(feature.attributes.ZONING);
      const rings = feature.geometry?.rings ?? [];
      if (!code || rings.length === 0) return [];
      const className = feature.attributes.Zoning_Class
        ? ZONING_CLASS_NAMES[feature.attributes.Zoning_Class]
        : undefined;
      return [{ code, className, rings }];
    });
    const shapes = districts.flatMap(({ code, rings }) =>
      shape(rings, box, "strong", code),
    );
    const inView = new Map<string, string>();
    for (const { code, className } of districts) {
      if (!inView.has(code) || className) {
        inView.set(code, className ? `${code} · ${className}` : code);
      }
    }
    // The same measurement as the zoning check: it only reads the lot.
    const measured = measureZoning(
      parcel.geometry.geojson,
      named.features,
      retrievedAt,
    );
    return {
      status: shapes.length > 0 ? "found" : "none",
      shapes,
      inView: [...inView.keys()].sort().map((code) => inView.get(code) ?? code),
      onLot:
        measured.outcome === "found"
          ? measured.districts.map((district) => ({
              name: district.code,
              share: district.share,
            }))
          : [],
      source: {
        authority: "Franklin County Economic Development & Planning",
        title: "Franklin County zoning districts",
        url: FCEDP_ZONING_LAYER,
        retrievedAt,
      },
    };
  }

  async function roadRightOfWay(
    parcel: Parcel,
    box: LayerBox,
    signal: AbortSignal,
  ): Promise<Built> {
    if (parcel.countyFips !== FRANKLIN_COUNTY_FIPS) return notCovered();
    const rows = await query(
      FRANKLIN_ROW_LAYER,
      box,
      { where: ROW_WHERE, outFields: "TYPE", ...withGeometry },
      rowSchema,
      signal,
    );
    if (rows.exceededTransferLimit) {
      throw new LayerUnavailable("Franklin right-of-way");
    }
    const retrievedAt = now().toISOString();
    const source: Source = {
      authority: "Franklin County Auditor",
      title: "Parcel features: right-of-way",
      url: FRANKLIN_ROW_LAYER,
      retrievedAt,
    };
    const measured = rows.features
      .flatMap((feature) => {
        const rings = feature.geometry?.rings ?? [];
        if (rings.length === 0) return [];
        return [
          {
            type: feature.attributes.TYPE?.trim() || "Right-of-way",
            rings,
            distanceM: polygonDistance(parcel.geometry.geojson, rings),
          },
        ];
      })
      .sort((a, b) => a.distanceM - b.distanceM);
    const nearest = measured[0];
    if (!nearest) return { status: "none", shapes: [], inView: [], source };
    // Every right-of-way touching the lot (a corner lot has two), or else
    // the single nearest one.
    const touching = measured.filter(
      (row) => row.distanceM <= TOUCH_TOLERANCE_M,
    );
    const drawn = touching.length > 0 ? touching : [nearest];
    const shapes = drawn.flatMap((row) => shape(row.rings, box, "strong"));
    return {
      status: shapes.length > 0 ? "found" : "none",
      shapes,
      inView: [...new Set(drawn.map((row) => row.type))].sort(),
      distanceM:
        touching.length > 0 ? 0 : Math.round(nearest.distanceM * 10) / 10,
      source,
    };
  }

  const builders: Record<
    MapLayerId,
    (parcel: Parcel, box: LayerBox, signal: AbortSignal) => Promise<Built>
  > = { flood, streamSetback, wetlands, zoning, roadRightOfWay };

  /** Every layer for the parcel's land block. Never throws for a provider. */
  async function layers(parcel: Parcel): Promise<ParcelLayers> {
    const box = layerBox(parcel.geometry.geojson);
    const built = await Promise.all(
      MAP_LAYER_IDS.map(async (id): Promise<MapLayer> => {
        try {
          const layer = await builders[id](
            parcel,
            box,
            AbortSignal.timeout(timeoutMs),
          );
          return { id, status: layer.status ?? "found", ...layer };
        } catch {
          return { id, status: "unavailable", shapes: [], inView: [] };
        }
      }),
    );
    return {
      parcelKey: parcel.key,
      bbox: box,
      generatedAt: now().toISOString(),
      layers: built,
    };
  }

  return { layers, now };
}

function notCovered(): { status: "notCovered"; shapes: []; inView: [] } {
  return { status: "notCovered", shapes: [], inView: [] };
}

const ringsSchema = z.array(z.array(z.array(z.number()).min(2)));

const floodSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        FLD_ZONE: z.string().nullish(),
        ZONE_SUBTY: z.string().nullish(),
        SFHA_TF: z.string().nullish(),
      }),
      geometry: z.object({ rings: ringsSchema }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});
type FloodAttributes = z.infer<
  typeof floodSchema
>["features"][number]["attributes"];

const zoningSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        ZONING: z.string().nullish(),
        Zoning_Class: z.string().nullish(),
      }),
      geometry: z.object({ rings: ringsSchema }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const rowSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({ TYPE: z.string().nullish() }),
      geometry: z.object({ rings: ringsSchema }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const wetlandTypesSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({ WETLAND_TYPE: z.string().nullish() }),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const imageYearSchema = z.object({
  features: z.array(
    z.object({ attributes: z.object({ IMAGE_YR: z.number().nullish() }) }),
  ),
});

function envelope(box: LayerBox) {
  return {
    xmin: box.west,
    ymin: box.south,
    xmax: box.east,
    ymax: box.north,
    spatialReference: { wkid: 4326 },
  };
}

function mercatorBox(box: LayerBox): Box {
  const x = (lon: number) => (lon * Math.PI * 6_378_137) / 180;
  const y = (lat: number) =>
    6_378_137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return {
    minX: x(box.west),
    minY: y(box.south),
    maxX: x(box.east),
    maxY: y(box.north),
  };
}

/**
 * Outlines are cut this far (a share of the view's width) outside the view,
 * so the cut, which is not a real edge, is never drawn as one.
 */
export const CLIP_MARGIN = 0.02;

/** A source outline as a MapShape clipped to the view, or nothing if none of it is in view. */
function shape(
  rings: number[][][],
  box: LayerBox,
  tone: MapShape["tone"],
  label?: string,
): MapShape[] {
  const dx = (box.east - box.west) * CLIP_MARGIN;
  const dy = (box.north - box.south) * CLIP_MARGIN;
  const margin = {
    west: box.west - dx,
    south: box.south - dy,
    east: box.east + dx,
    north: box.north + dy,
  };
  const clipped = rings
    .map((ring) => clipRing(ring, margin))
    .filter((ring) => ring.length >= 4);
  if (clipped.length === 0) return [];
  return [{ rings: clipped, tone, ...(label ? { label } : {}) }];
}

/**
 * Sutherland–Hodgman against the view's rectangle. A rectangle is convex,
 * so any ring, however concave, comes out as one ring (with zero-width
 * slivers along the edge where it left and came back, which fill nothing).
 * Positions are rounded to 7 decimals, OGRIP's own precision.
 */
export function clipRing(ring: number[][], box: LayerBox): number[][] {
  let points = ring.map(([x = 0, y = 0]) => [x, y] as [number, number]);
  const first = points[0];
  const last = points.at(-1);
  if (first && last && first[0] === last[0] && first[1] === last[1]) {
    points = points.slice(0, -1);
  }
  const edges: [(p: [number, number]) => boolean, number, 0 | 1][] = [
    [(p) => p[0] >= box.west, box.west, 0],
    [(p) => p[0] <= box.east, box.east, 0],
    [(p) => p[1] >= box.south, box.south, 1],
    [(p) => p[1] <= box.north, box.north, 1],
  ];
  for (const [keep, at, axis] of edges) {
    const input = points;
    points = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i] as [number, number];
      const previous = input[(i + input.length - 1) % input.length] as [
        number,
        number,
      ];
      const crossing = (): [number, number] => {
        const t = (at - previous[axis]) / (current[axis] - previous[axis]);
        return axis === 0
          ? [at, previous[1] + t * (current[1] - previous[1])]
          : [previous[0] + t * (current[0] - previous[0]), at];
      };
      if (keep(current)) {
        if (!keep(previous)) points.push(crossing());
        points.push(current);
      } else if (keep(previous)) {
        points.push(crossing());
      }
    }
    if (points.length === 0) return [];
  }
  const rounded = points.map(
    ([x, y]) => [round7(x), round7(y)] as [number, number],
  );
  const start = rounded[0];
  return start ? [...rounded, start] : [];
}

const round7 = (value: number) => Math.round(value * 1e7) / 1e7;

/** Shares of the lot inside each named area, by the setback sampling. */
function shares(
  parcel: GeoJsonPolygon | GeoJsonMultiPolygon,
  areas: { name: string; rings: number[][][] }[],
): { name: string; share: number }[] {
  if (areas.length === 0) return [];
  const outlines = new Map<string, Outline>();
  for (const area of areas) {
    const outline = outlines.get(area.name) ?? { rings: [] };
    for (const coords of area.rings) {
      outline.rings.push({ coords, box: bounds(coords) });
    }
    outlines.set(area.name, outline);
  }
  return measureSetbacks(
    parcel,
    [...outlines].map(([name, outline]) => ({ name, outline })),
  ).setbacks.filter((area) => area.share > 0);
}

/**
 * Shortest distance in metres between the parcel and a polygon given as
 * ArcGIS rings: 0 when they overlap or cross, otherwise edge to edge.
 */
export function polygonDistance(
  parcel: GeoJsonPolygon | GeoJsonMultiPolygon,
  rings: number[][][],
): number {
  const project = localProjection(parcel);
  const lot = parcelRings(parcel).map(project.ring);
  const other = rings.map(project.ring);
  const all: Box = {
    minX: -Infinity,
    minY: -Infinity,
    maxX: Infinity,
    maxY: Infinity,
  };
  const lotEdges = edgesInBand(lot, all);
  const otherEdges = edgesInBand(other, all);
  if (
    other.some((ring) => ring.some(([x, y]) => inside(x, y, lotEdges))) ||
    lot.some((ring) => ring.some(([x, y]) => inside(x, y, otherEdges)))
  ) {
    return 0;
  }
  const lotBox = bounds(lot.flat());
  let best = Infinity;
  for (let i = 0; i < otherEdges.length; i += 4) {
    const a: Point = [otherEdges[i] ?? 0, otherEdges[i + 1] ?? 0];
    const b: Point = [otherEdges[i + 2] ?? 0, otherEdges[i + 3] ?? 0];
    // Skip far edges of a long right-of-way quickly.
    const edgeBox = bounds([a, b]);
    if (
      best < Infinity &&
      !overlaps(edgeBox, {
        minX: lotBox.minX - best,
        minY: lotBox.minY - best,
        maxX: lotBox.maxX + best,
        maxY: lotBox.maxY + best,
      })
    ) {
      continue;
    }
    for (let k = 0; k < lotEdges.length; k += 4) {
      const c: Point = [lotEdges[k] ?? 0, lotEdges[k + 1] ?? 0];
      const d: Point = [lotEdges[k + 2] ?? 0, lotEdges[k + 3] ?? 0];
      best = Math.min(best, segmentDistance(a, b, c, d));
      if (best === 0) return 0;
    }
  }
  return best;
}

type Point = [number, number];

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq),
        );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
