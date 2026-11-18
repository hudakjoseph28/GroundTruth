import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import { z } from "zod";
import { toEsriPolygon } from "./femaFlood.js";

/**
 * Franklin County's tax-parcel right-of-way polygons (Auditor parcel
 * fabric). Fields and the `TYPE` values were read from the live layer on
 * 2026-11-18. The golden report cites this layer and the road layer below.
 */
export const FRANKLIN_ROW_LAYER =
  "https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/6";

/** Franklin County Engineer's road centerlines (`MSAG_LSN` is the name). */
export const FCEO_ROAD_LAYER =
  "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEO_Road_Sections_Public/FeatureServer/0";

/**
 * `TYPE` values that mark road right-of-way held for the public. Left out
 * on purpose: `Historic - R/W` (abandoned), `Private Ingress-Egress`,
 * `Sidewalk`, `Bike Path`, `Path`, `Lease`, `Easement`, `Conservation`,
 * `Utility`, `Flood`, `Multi-Use`, `Shared Use`, `Ordinance`,
 * `General Common Element`, `Other`, `Other - R/W`, and `Unknown`.
 */
export const PUBLIC_ROAD_ROW_TYPES = [
  "Public Right Of Way",
  "Plat - R/W",
  "Deed - R/W",
  "Road Record",
  "Prescriptive Right Of Way",
  "Court - R/W",
  "Highway",
] as const;

/**
 * A right-of-way this close to the parcel counts as touching it. The two
 * maps come from the same county parcel fabric, but OGRIP republishes the
 * boundary at 7 decimal places; a metre absorbs that without reaching the
 * far side of a street.
 */
export const TOUCH_TOLERANCE_M = 1;

/** Searched in order until a road turns up; the last is one mile. */
export const ROAD_SEARCH_RADII_M = [200, 1_609] as const;

/** Road classes never named as the nearest road or as a frontage road. */
const SKIPPED_ROAD_CLASSES = ["Private", "Ramp"] as const;

/** Interstates and expressways in the county road layer. */
const FREEWAY_CLASS = "Federal Highway System";
const OUT_OF_AREA_CLASS = "Out of Area";

export interface MappedRoad {
  /** Display name: `W Dodridge St`, `Seaman Rd`, `I-270 N`. */
  name: string;
  roadClass?: string;
  /** Road authority from the layer: `Columbus`, `Pleasant Twp`. */
  jurisdiction?: string;
  /** Shortest distance from the parcel boundary to the centerline. */
  distanceM: number;
}

/** The adapter outcomes (DataContract, "Provider normalization"). */
export type AccessOutcome =
  | {
      /** A public road right-of-way touches the parcel. */
      outcome: "touches";
      retrievedAt: string;
      /**
       * Roads whose centerline runs through a touching right-of-way beside
       * the parcel, nearest first. Empty when the layer maps right-of-way
       * but no road through it near the lot.
       */
      roads: MappedRoad[];
      /** `TYPE` of each touching right-of-way, as the layer spells it. */
      rowTypes: string[];
      /** The nearest mapped road of any kind but private drives and ramps. */
      nearest: MappedRoad | null;
      searchedM: number;
    }
  | {
      /** No public road right-of-way touches the parcel. */
      outcome: "notTouching";
      retrievedAt: string;
      nearest: MappedRoad | null;
      /** Radius searched for `nearest`. */
      searchedM: number;
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface FranklinAccessClient {
  /** Never throws. Aborting `signal` yields `timeout`. */
  access(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<AccessOutcome>;
}

export interface FranklinAccessClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const pathsSchema = z.array(z.array(z.array(z.number()).min(2)));

const rowSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({ TYPE: z.string().nullish() }),
      geometry: z.object({ rings: pathsSchema }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const roadSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        MSAG_LSN: z.string().nullish(),
        RoadClass: z.string().nullish(),
        Jurisdiction: z.string().nullish(),
      }),
      geometry: z.object({ paths: pathsSchema }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

export type RowFeature = z.infer<typeof rowSchema>["features"][number];
export type RoadFeature = z.infer<typeof roadSchema>["features"][number];

const quoted = (values: readonly string[]) =>
  values.map((value) => `'${value}'`).join(",");

const ROW_WHERE = `TYPE IN (${quoted(PUBLIC_ROAD_ROW_TYPES)})`;
const ROAD_WHERE = `RoadClass IS NULL OR RoadClass NOT IN (${quoted(SKIPPED_ROAD_CLASSES)})`;

class AccessUnavailable extends Error {
  constructor() {
    super("Franklin County road layers returned an unusable answer");
    this.name = "AccessUnavailableError";
  }
}

export function createFranklinAccessClient(
  options: FranklinAccessClientOptions = {},
): FranklinAccessClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  /** One POST (the parcel polygon can be too long for a URL). */
  async function query<T extends { exceededTransferLimit?: boolean }>(
    layer: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await fetchImpl(`${layer}/query`, {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...params,
        geometryType: "esriGeometryPolygon",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        units: "esriSRUnit_Meter",
        returnGeometry: "true",
        outSR: "4326",
        geometryPrecision: "7",
        f: "json",
      }).toString(),
    });
    if (!response.ok) throw new AccessUnavailable();
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success || parsed.data.exceededTransferLimit) {
      throw new AccessUnavailable();
    }
    return parsed.data;
  }

  async function access(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<AccessOutcome> {
    try {
      const esri = toEsriPolygon(geometry);
      const roadsWithin = (radius: number) =>
        query(
          FCEO_ROAD_LAYER,
          {
            where: ROAD_WHERE,
            geometry: esri,
            distance: String(radius),
            outFields: "MSAG_LSN,RoadClass,Jurisdiction",
          },
          roadSchema,
          signal,
        );
      const [firstRadius, ...wider] = ROAD_SEARCH_RADII_M;
      const [row, near] = await Promise.all([
        query(
          FRANKLIN_ROW_LAYER,
          {
            where: ROW_WHERE,
            geometry: esri,
            distance: String(TOUCH_TOLERANCE_M),
            outFields: "TYPE",
          },
          rowSchema,
          signal,
        ),
        roadsWithin(firstRadius),
      ]);
      let roads = near.features;
      let searchedM: number = firstRadius;
      for (const radius of wider) {
        if (roads.length > 0) break;
        roads = (await roadsWithin(radius)).features;
        searchedM = radius;
      }
      return classify(geometry, row.features, roads, {
        retrievedAt: now().toISOString(),
        searchedM,
      });
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { access };
}

/**
 * A road counts as running through a touching right-of-way when the point
 * of its centerline closest to the parcel lies inside that right-of-way,
 * within FRONTAGE_MAX_M of the parcel. The nearest such road is the
 * frontage road. Another one is named too only within CORNER_SLACK_M of
 * it (a corner lot): in Columbus one right-of-way polygon can cover a whole
 * street grid, so the next street over is inside it as well.
 */
export const FRONTAGE_MAX_M = 100;
export const CORNER_SLACK_M = 25;

/**
 * Turns the two layers' features into an outcome. Distances are measured
 * locally in metres (an equirectangular projection around the parcel,
 * accurate to well under a metre across a few kilometres).
 */
export function classify(
  parcelGeometry: GeoJsonPolygon | GeoJsonMultiPolygon,
  rowFeatures: RowFeature[],
  roadFeatures: RoadFeature[],
  context: { retrievedAt: string; searchedM: number },
): AccessOutcome {
  const project = localProjection(parcelGeometry);
  const parcelRings = (
    parcelGeometry.type === "Polygon"
      ? parcelGeometry.coordinates
      : parcelGeometry.coordinates.flat()
  ).map(project);
  if (parcelRings.every((ring) => ring.length < 2)) {
    throw new AccessUnavailable();
  }
  const touching = rowFeatures.filter((feature) => feature.geometry);
  const rows = touching.map((feature) =>
    (feature.geometry?.rings ?? []).map(project),
  );
  const rowTypes = [
    ...new Set(
      touching.flatMap((feature) => feature.attributes.TYPE?.trim() || []),
    ),
  ].sort();

  const measured = roadFeatures.flatMap((feature) => {
    const paths = (feature.geometry?.paths ?? []).map(project);
    const closest = closestOnPaths(parcelRings, paths);
    if (!closest) return [];
    const { MSAG_LSN, RoadClass, Jurisdiction } = feature.attributes;
    const road: MappedRoad = {
      name: roadName(MSAG_LSN),
      ...(RoadClass?.trim() && { roadClass: RoadClass.trim() }),
      ...(Jurisdiction?.trim() && { jurisdiction: Jurisdiction.trim() }),
      distanceM: closest.distance,
    };
    return [{ road, point: closest.point }];
  });
  measured.sort((a, b) => a.road.distanceM - b.road.distanceM);
  const nearest = measured[0]?.road ?? null;

  if (rows.length === 0) {
    return {
      outcome: "notTouching",
      retrievedAt: context.retrievedAt,
      nearest,
      searchedM: context.searchedM,
    };
  }

  const throughRow = measured.filter(
    ({ road, point }) =>
      road.distanceM <= FRONTAGE_MAX_M &&
      rows.some((rings) => inside(point, rings)),
  );
  const frontM = throughRow[0]?.road.distanceM ?? 0;
  const roads: MappedRoad[] = [];
  for (const { road } of throughRow) {
    if (road.distanceM > frontM + CORNER_SLACK_M) break;
    if (!roads.some((kept) => kept.name === road.name)) roads.push(road);
  }
  return {
    outcome: "touches",
    retrievedAt: context.retrievedAt,
    roads,
    rowTypes,
    nearest,
    searchedM: context.searchedM,
  };
}

export const isFreeway = (road: MappedRoad) => road.roadClass === FREEWAY_CLASS;
export const isOutOfCounty = (road: MappedRoad) =>
  road.roadClass === OUT_OF_AREA_CLASS;

/** Kept upper case: compass directions and route prefixes (`SR 315`). */
const UPPER_WORDS = new Set([
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
  "I",
  "SR",
  "US",
  "CR",
  "TR",
]);

/** `W DODRIDGE ST` → `W Dodridge St`; `I-270   N` → `I-270 N`. */
export function roadName(value: string | null | undefined): string {
  const words = (value ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.join(" ").toUpperCase() === "NONE") {
    return "an unnamed road";
  }
  return words
    .map((word) => {
      const upper = word.toUpperCase();
      if (UPPER_WORDS.has(upper)) return upper;
      if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return upper.toLowerCase();
      if (/\d/.test(word)) return upper;
      return word
        .toLowerCase()
        .replace(
          /(^|[-'])([a-z])/g,
          (_m, lead: string, letter: string) =>
            `${lead}${letter.toUpperCase()}`,
        );
    })
    .join(" ");
}

type Point = [number, number];

function localProjection(geometry: GeoJsonPolygon | GeoJsonMultiPolygon) {
  const first =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]?.[0]
      : geometry.coordinates[0]?.[0]?.[0];
  const [lon0 = 0, lat0 = 0] = first ?? [];
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon =
    metresPerDegreeLat * Math.cos((lat0 * Math.PI) / 180);
  /** A ring or path in metres east and north of the parcel's first vertex. */
  return (coords: number[][]): Point[] =>
    coords.map(([lon = 0, lat = 0]) => [
      (lon - lon0) * metresPerDegreeLon,
      (lat - lat0) * metresPerDegreeLat,
    ]);
}

/**
 * The point on `paths` closest to the parcel, and its distance from the
 * parcel's boundary (0 when the centerline crosses or lies inside it).
 */
function closestOnPaths(
  parcelRings: Point[][],
  paths: Point[][],
): { point: Point; distance: number } | null {
  let best: { point: Point; distance: number } | null = null;
  for (const path of paths) {
    for (let i = 0; i < path.length; i += 1) {
      const a = path[i];
      const b = path[i + 1] ?? a;
      if (!a || !b) continue;
      if (inside(a, parcelRings)) return { point: a, distance: 0 };
      for (const ring of parcelRings) {
        for (let k = 0; k + 1 < ring.length; k += 1) {
          const c = ring[k];
          const d = ring[k + 1];
          if (!c || !d) continue;
          const crossing = intersection(a, b, c, d);
          if (crossing) return { point: crossing, distance: 0 };
          for (const candidate of [
            { point: a, distance: pointToSegment(a, c, d) },
            { point: b, distance: pointToSegment(b, c, d) },
            ...[c, d].map((p) => {
              const point = nearestOnSegment(p, a, b);
              return { point, distance: dist(p, point) };
            }),
          ]) {
            if (!best || candidate.distance < best.distance) best = candidate;
          }
        }
      }
    }
  }
  return best;
}

function nearestOnSegment(p: Point, a: Point, b: Point): Point {
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
  return [a[0] + t * dx, a[1] + t * dy];
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  return dist(p, nearestOnSegment(p, a, b));
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Where segments ab and cd cross, if they do. */
function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * rx, a[1] + t * ry];
}

/** Even-odd rule over every ring, so holes are cut out. */
function inside([x, y]: Point, rings: Point[][]): boolean {
  let odd = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[j] ?? [0, 0];
      const [x2, y2] = ring[i] ?? [0, 0];
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
        odd = !odd;
      }
    }
  }
  return odd;
}
