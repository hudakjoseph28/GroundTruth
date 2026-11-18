import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import { z } from "zod";
import { toEsriPolygon } from "./femaFlood.js";
import {
  bounds,
  edgesInBand,
  inside,
  localProjection,
  overlaps,
  parcelRings,
} from "./sampling.js";

/**
 * Franklin County Economic Development & Planning's zoning map: the
 * districts the county administers in the ten townships under county
 * zoning. Fields and the `Zoning_Class` domain were read from the live layer
 * (`?f=json`) on 2026-11-17.
 */
export const FCEDP_ZONING_LAYER =
  "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEDP_Zoning_Districts_2025_View/FeatureServer/0";

/** The county's zoning text. Read and hash-checked for the golden parcel. */
export const ZONING_RESOLUTION = {
  title: "Franklin County Zoning Resolution 2026",
  url: "https://www.franklincountyohio.gov/files/assets/public/v/1/edp/documents/zoning-resolution/zoning-resolution-2026.pdf",
  retrievedAt: "2026-11-17T00:54:52.000Z",
} as const;

export const FRANKLIN_COUNTY_FIPS = "39049";

/** `Zoning_Class` coded values and their names, from the layer's domain. */
export const ZONING_CLASS_NAMES: Readonly<Record<string, string>> = {
  Rural: "Rural District",
  Low_Dens_Res: "Low Density Residential District",
  Rest_Sub_Res: "Restricted Suburban Residential District",
  Lim_Sub_Res: "Limited Suburban Residential District",
  Urb_Res: "Urban Residential District",
  Multi_Apt: "Multifamily Apartment District",
  Res_Man_Home: "Residential Manufactured Home District",
  Plan_Res: "Planned Residential District",
  Plan_Man_Hous: "Planned Manufactured Housing Residential District",
  Plan_Unit_Dev: "Planned Unit Development District",
  Sub_Off_Ind: "Suburban Office and Industrial District",
  Neigh_Comm: "Neighborhood Commercial District",
  Comm_Commercial: "Community Commercial District",
  Comm_Serv: "Community Service District",
  Sel_Comm_Plan: "Select Commercial Planned District",
  Plan_Shop_Center: "Planned Shopping Center District",
  Plan_Hwy_Serv: "Planned Highway Service District",
  Rest_Ind: "Restricted Industrial District",
  Lim_Ind: "Limited Industrial District",
  Gen_Ind: "General Industrial District",
  // The layer's own spelling is "Surburban".
  Sub_Res: "Suburban Residential District",
  Plan_Ind_Park: "Planned Industrial Park District",
  Rest_Urb_Res: "Restricted Urban Residential District",
  Exc_Use: "Exceptional Use District",
};

/** The layer marks areas the county does not zone with this value. */
const NOT_IN_JURISDICTION = "NOT IN JURISDICTION";

/**
 * A district covering less than this share of the parcel is a sliver along
 * a shared edge (0.01% to 0.08% on lots checked 2026-11-17), not a second
 * district on the lot.
 */
export const MEANINGFUL_SHARE = 0.01;

export interface ZoningDistrict {
  /** `ZONING`, whitespace collapsed: `R`, `CC`, `PR-10`. */
  code: string;
  /** Name from the `Zoning_Class` domain, when the layer gives one. */
  className?: string;
  /** Share of the parcel's area inside this district, 0 to 1. */
  share: number;
}

/**
 * The four adapter outcomes (DataContract, "Provider normalization").
 * `found` lists every named district covering a meaningful share; the
 * check decides between evidenceFound (one) and needsReview (more).
 */
export type ZoningOutcome =
  | {
      outcome: "found";
      retrievedAt: string;
      /** Largest share first. */
      districts: ZoningDistrict[];
      /** Share of the parcel no named district covers. */
      uncovered: number;
      /** Share also marked NOT IN JURISDICTION under a named district. */
      contradicted: number;
    }
  | {
      /** No named district covers a meaningful share of the parcel. */
      outcome: "missing";
      retrievedAt: string;
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface FranklinZoningClient {
  /** Never throws. Aborting `signal` yields `timeout`. */
  zoning(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<ZoningOutcome>;
}

export interface FranklinZoningClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const ringsSchema = z.array(z.array(z.array(z.number()).min(2)));
const querySchema = z.object({
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

const countSchema = z.object({ count: z.number() });

/** The layer's areas the county does not zone, and everything else. */
const EXCLUDED_WHERE = "ZONING LIKE 'NOT IN JURISDICTION%'";
const NAMED_WHERE = "ZONING IS NULL OR ZONING NOT LIKE 'NOT IN JURISDICTION%'";

class ZoningUnavailable extends Error {
  constructor() {
    super("Franklin County zoning layer returned an unusable answer");
    this.name = "ZoningUnavailableError";
  }
}

export function createFranklinZoningClient(
  options: FranklinZoningClientOptions = {},
): FranklinZoningClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  /** One POST (the parcel polygon can be too long for a URL). */
  async function query<T>(
    geometry: string,
    where: string,
    extra: Record<string, string>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await fetchImpl(`${FCEDP_ZONING_LAYER}/query`, {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        where,
        geometry,
        geometryType: "esriGeometryPolygon",
        inSR: "4326",
        // Interiors must overlap: a district that only touches the lot's
        // edge is left out by the server.
        spatialRel: "esriSpatialRelRelation",
        relationParam: "T********",
        ...extra,
        f: "json",
      }).toString(),
    });
    if (!response.ok) throw new ZoningUnavailable();
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new ZoningUnavailable();
    return parsed.data;
  }

  const withGeometry = {
    outFields: "ZONING,Zoning_Class",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "7",
  };

  /**
   * Named districts come back with their geometry so the overlap can be
   * measured. NOT IN JURISDICTION areas are only counted at first: around
   * Columbus that polygon is the city's whole outline, about 1.4 MB, and it
   * changes nothing unless a named district also covers the lot. Only then
   * is its geometry fetched, to measure where the map contradicts itself.
   */
  async function zoning(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<ZoningOutcome> {
    try {
      const esri = toEsriPolygon(geometry);
      const [named, excluded] = await Promise.all([
        query(esri, NAMED_WHERE, withGeometry, querySchema, signal),
        query(
          esri,
          EXCLUDED_WHERE,
          { returnCountOnly: "true" },
          countSchema,
          signal,
        ),
      ]);
      if (named.exceededTransferLimit) throw new ZoningUnavailable();
      const retrievedAt = now().toISOString();
      const first = measure(geometry, named.features, retrievedAt);
      if (first.outcome !== "found" || excluded.count === 0) return first;
      const overlap = await query(
        esri,
        EXCLUDED_WHERE,
        withGeometry,
        querySchema,
        signal,
      );
      if (overlap.exceededTransferLimit) throw new ZoningUnavailable();
      return measure(
        geometry,
        [...named.features, ...overlap.features],
        retrievedAt,
      );
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { zoning };
}

type Feature = z.infer<typeof querySchema>["features"][number];

/** Grid points per side across the parcel's bounding box. */
export const SAMPLE_GRID = 300;

/**
 * How much of the parcel each named district covers, measured locally by
 * sampling: a SAMPLE_GRID × SAMPLE_GRID grid of points over the parcel's
 * bounding box, each tested against the parcel and every district with an
 * even-odd point-in-polygon rule (which also handles holes). A share is the
 * fraction of the parcel's points inside a district.
 *
 * Exact polygon clipping was tried first and failed on real data: districts
 * that share an edge exactly (NC and R around parcel 230-000397, where R
 * carries a hole ring tracing NC) make clipping libraries give up. Point
 * tests cannot fail that way. On 7 Franklin lots checked 2026-11-17, the
 * sampled shares were within 0.02 percentage points of exact areas (shapely),
 * and the golden parcel measured R at exactly 100%. Only edges near the lot
 * are tested, so a lot takes milliseconds even beside a huge district.
 */
export function measure(
  parcelGeometry: GeoJsonPolygon | GeoJsonMultiPolygon,
  features: Feature[],
  retrievedAt: string,
): ZoningOutcome {
  const project = localProjection(parcelGeometry);
  const rings = parcelRings(parcelGeometry).map(project.ring);
  const box = bounds(rings.flat());
  const parcelEdges = edgesInBand(rings, box);

  const areas = features.flatMap((feature) => {
    if (!feature.geometry) return [];
    const rings = feature.geometry.rings
      .map(project.ring)
      .filter((ring) => overlaps(bounds(ring), box));
    if (rings.length === 0) return [];
    return [
      {
        code: normalizeCode(feature.attributes.ZONING),
        class: feature.attributes.Zoning_Class,
        edges: edgesInBand(rings, box),
      },
    ];
  });

  const counts = new Map<string, number>();
  let total = 0;
  let covered = 0;
  let contradicted = 0;
  const stepX = (box.maxX - box.minX) / SAMPLE_GRID;
  const stepY = (box.maxY - box.minY) / SAMPLE_GRID;
  for (let i = 0; i < SAMPLE_GRID; i += 1) {
    const x = box.minX + (i + 0.5) * stepX;
    for (let j = 0; j < SAMPLE_GRID; j += 1) {
      const y = box.minY + (j + 0.5) * stepY;
      if (!inside(x, y, parcelEdges)) continue;
      total += 1;
      let named = false;
      let excluded = false;
      const here = new Set<string>();
      for (const area of areas) {
        if (!inside(x, y, area.edges)) continue;
        if (area.code === NOT_IN_JURISDICTION) excluded = true;
        else if (area.code) here.add(area.code);
      }
      for (const code of here) counts.set(code, (counts.get(code) ?? 0) + 1);
      named = here.size > 0;
      if (named) covered += 1;
      if (named && excluded) contradicted += 1;
    }
  }
  if (total === 0) throw new ZoningUnavailable();

  const classOf = new Map<string, string>();
  for (const area of areas) {
    const name = area.class ? ZONING_CLASS_NAMES[area.class] : undefined;
    if (area.code && name && !classOf.has(area.code))
      classOf.set(area.code, name);
  }
  const districts = [...counts.entries()]
    .map(([code, n]) => {
      const className = classOf.get(code);
      return { code, ...(className ? { className } : {}), share: n / total };
    })
    .filter((district) => district.share >= MEANINGFUL_SHARE)
    .sort((a, b) => b.share - a.share || a.code.localeCompare(b.code));
  if (districts.length === 0) return { outcome: "missing", retrievedAt };
  return {
    outcome: "found",
    retrievedAt,
    districts,
    uncovered: 1 - covered / total,
    contradicted: contradicted / total,
  };
}

/** `PR-10\nPR-10` → `PR-10`; blanks → empty. */
function normalizeCode(value: string | null | undefined): string {
  const words = (value ?? "").split(/\s+/).filter(Boolean);
  if (words.join(" ").toUpperCase() === NOT_IN_JURISDICTION) {
    return NOT_IN_JURISDICTION;
  }
  return [...new Set(words)].join(" ");
}
