import type {
  Coverage,
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  Parcel,
  ParcelSearchResult,
} from "@groundtruth/shared";
import { z } from "zod";
import {
  PARCEL_FIELDS,
  polygonCentroid,
  siteAddressMatches,
  toParcelSummary,
  type ParcelSummary,
} from "./normalize.js";
import { countyByFips, countyByName, OHIO_COUNTIES } from "./ohioCounties.js";
import { isKeyableParcelId } from "./parcelKey.js";

/** Ohio's statewide parcel layer (OGRIP), queried only from the API. */
export const OGRIP_PARCELS_LAYER =
  "https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0";

/** OGRIP's statewide single-line address locator (LBRS-based). */
export const OGRIP_LOCATOR =
  "https://maps.ohio.gov/arcgis/rest/services/OGRIP/Ogrip_locator/GeocodeServer";

export const DEFAULT_OGRIP_TIMEOUT_MS = 8_000;
const MAX_RESULTS = 10;
const MIN_LOCATOR_SCORE = 80;
/** Candidates scoring further below the best one are other streets. */
const MAX_LOCATOR_SCORE_GAP = 5;
const MAX_LOCATOR_CANDIDATES = 3;
/**
 * Half-widths of the box searched around a locator point. The points are
 * interpolated along street ranges and can land hundreds of meters from the
 * lot (84 W Dodridge St lands about 400 m away). Widen only while the area
 * is sparse: once the service hits its record limit, a wider box would be
 * incomplete and slower.
 */
const SEARCH_RADII_METERS = [150, 500, 1_500] as const;
const METERS_PER_DEGREE_LATITUDE = 111_320;
const COVERAGE_CACHE_MS = 60 * 60 * 1_000;

export type OgripFailure = "timeout" | "unavailable";

/** OGRIP did not answer in time, or answered with something unusable. */
export class OgripError extends Error {
  readonly kind: OgripFailure;

  constructor(kind: OgripFailure) {
    super(
      kind === "timeout"
        ? "OGRIP did not answer in time"
        : "OGRIP returned an unusable answer",
    );
    this.kind = kind;
    this.name =
      kind === "timeout" ? "OgripTimeoutError" : "OgripUnavailableError";
  }
}

export interface OgripClient {
  searchByParcelId(query: string): Promise<ParcelSearchResult[]>;
  searchByAddress(query: string): Promise<ParcelSearchResult[]>;
  /** Null when OGRIP publishes no keyable parcel for this county and ID. */
  getParcel(countyFips: string, sourceParcelId: string): Promise<Parcel | null>;
  getCoverage(): Promise<Coverage[]>;
}

export interface OgripClientOptions {
  fetch?: typeof fetch;
  /** Per-request limit. A whole search may use twice this. */
  timeoutMs?: number;
  now?: () => Date;
}

const attributesSchema = z.object({
  County: z.string().nullish(),
  LocalParcelID: z.string().nullish(),
  StateParcelID: z.string().nullish(),
  SitusAddressAll: z.string().nullish(),
  LandArea: z.number().nullish(),
});

const pointSchema = z.object({ x: z.number(), y: z.number() });

const featureQuerySchema = z.object({
  features: z.array(
    z.object({ attributes: attributesSchema, centroid: pointSchema.nullish() }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const ringSchema = z.array(z.array(z.number()).min(2)).min(4);
const geometrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(ringSchema).min(1),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
]);

const geojsonQuerySchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      properties: attributesSchema,
      geometry: geometrySchema.nullable(),
    }),
  ),
});

const locatorSchema = z.object({
  candidates: z.array(
    z.object({
      score: z.number(),
      location: pointSchema,
      attributes: z.object({
        Addr_type: z.string().nullish(),
        AddNum: z.string().nullish(),
        StName: z.string().nullish(),
      }),
    }),
  ),
});

const statisticsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        County: z.string().nullable(),
        parcels: z.number(),
      }),
    }),
  ),
});

const ADDRESS_MATCH_TYPES = new Set([
  "PointAddress",
  "StreetAddress",
  "StreetAddressExt",
  "Subaddress",
]);

interface LocatedAddress {
  houseNumber: string;
  streetName: string;
  longitude: number;
  latitude: number;
}

export function createOgripClient(
  options: OgripClientOptions = {},
): OgripClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OGRIP_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  let coverageCache: { at: number; rows: Coverage[] } | undefined;

  async function getJson<T>(
    url: string,
    schema: z.ZodType<T>,
    budget?: AbortSignal,
  ): Promise<T> {
    const perRequest = AbortSignal.timeout(timeoutMs);
    const signal = budget ? AbortSignal.any([perRequest, budget]) : perRequest;
    let body: unknown;
    try {
      const response = await fetchImpl(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new OgripError("unavailable");
      body = await response.json();
    } catch (error) {
      if (error instanceof OgripError) throw error;
      if (signal.aborted) throw new OgripError("timeout");
      throw new OgripError("unavailable");
    }
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new OgripError("unavailable");
    return parsed.data;
  }

  function searchBudget(): AbortSignal {
    return AbortSignal.timeout(timeoutMs * 2);
  }

  async function searchByParcelId(
    query: string,
  ): Promise<ParcelSearchResult[]> {
    const where = parcelIdWhere(query);
    if (!where) return [];
    const url = layerQueryUrl({
      where,
      outFields: PARCEL_FIELDS.join(","),
      returnGeometry: "false",
      returnCentroid: "true",
      outSR: "4326",
      resultRecordCount: String(MAX_RESULTS * 2),
      f: "json",
    });
    const result = await getJson(url, featureQuerySchema, searchBudget());
    return uniqueByKey(
      result.features.flatMap((feature) => {
        const summary = summaryFromFeature(feature);
        return summary
          ? [{ parcel: summary, matchedOn: "parcelId" as const }]
          : [];
      }),
    ).slice(0, MAX_RESULTS);
  }

  async function searchByAddress(query: string): Promise<ParcelSearchResult[]> {
    const budget = searchBudget();
    const located = await locate(query, budget);
    const perCandidate = await Promise.all(
      located.map((address) => parcelsAtAddress(address, budget)),
    );
    return uniqueByKey(perCandidate.flat()).slice(0, MAX_RESULTS);
  }

  async function locate(
    query: string,
    budget: AbortSignal,
  ): Promise<LocatedAddress[]> {
    const url = withParams(`${OGRIP_LOCATOR}/findAddressCandidates`, {
      SingleLine: query,
      maxLocations: "5",
      outSR: "4326",
      outFields: "Addr_type,AddNum,StName",
      f: "json",
    });
    const result = await getJson(url, locatorSchema, budget);
    const best = Math.max(...result.candidates.map((c) => c.score));
    const seen = new Set<string>();
    const located: LocatedAddress[] = [];
    for (const candidate of result.candidates) {
      const { Addr_type, AddNum, StName } = candidate.attributes;
      if (candidate.score < MIN_LOCATOR_SCORE) continue;
      if (candidate.score < best - MAX_LOCATOR_SCORE_GAP) continue;
      if (!Addr_type || !ADDRESS_MATCH_TYPES.has(Addr_type)) continue;
      if (!AddNum || !/^\d+$/.test(AddNum) || !StName?.trim()) continue;
      const id = `${AddNum}|${StName}|${candidate.location.x.toFixed(3)}|${candidate.location.y.toFixed(3)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      located.push({
        houseNumber: AddNum,
        streetName: StName,
        longitude: candidate.location.x,
        latitude: candidate.location.y,
      });
      if (located.length === MAX_LOCATOR_CANDIDATES) break;
    }
    return located;
  }

  async function parcelsAtAddress(
    address: LocatedAddress,
    budget: AbortSignal,
  ): Promise<ParcelSearchResult[]> {
    for (const radius of SEARCH_RADII_METERS) {
      const url = layerQueryUrl({
        where: "LocalParcelID IS NOT NULL",
        // An explicit WGS84 box: with outSR=4326 the service shrinks a
        // point-plus-distance search (821 parcels without outSR, 99 with).
        geometry: envelopeAround(address, radius),
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: PARCEL_FIELDS.join(","),
        returnGeometry: "false",
        returnCentroid: "true",
        outSR: "4326",
        f: "json",
      });
      const result = await getJson(url, featureQuerySchema, budget);
      const matches = result.features
        .filter((feature) =>
          siteAddressMatches(
            feature.attributes.SitusAddressAll,
            address.houseNumber,
            address.streetName,
          ),
        )
        .flatMap((feature) => {
          const summary = summaryFromFeature(feature);
          return summary ? [summary] : [];
        })
        .sort((a, b) => distance(a, address) - distance(b, address))
        .map((parcel) => ({ parcel, matchedOn: "siteAddress" as const }));
      if (matches.length > 0) return matches;
      // The service stopped at its record limit: this area is too dense for
      // a wider ring to be complete, so a miss here stays a miss.
      if (result.exceededTransferLimit) return [];
    }
    return [];
  }

  async function getParcel(
    countyFips: string,
    sourceParcelId: string,
  ): Promise<Parcel | null> {
    const county = countyByFips(countyFips);
    if (!county || !isKeyableParcelId(sourceParcelId)) return null;
    const url = layerQueryUrl({
      where: `County=${sqlString(county.name)} AND LocalParcelID=${sqlString(sourceParcelId)}`,
      outFields: PARCEL_FIELDS.join(","),
      returnGeometry: "true",
      outSR: "4326",
      geometryPrecision: "7",
      resultRecordCount: "50",
      f: "geojson",
    });
    const result = await getJson(url, geojsonQuerySchema);
    const retrievedAt = now().toISOString();

    const features = result.features.filter(
      (feature) =>
        feature.geometry && feature.properties.LocalParcelID === sourceParcelId,
    );
    const geometry = mergeGeometry(
      features.flatMap((feature) =>
        feature.geometry ? [feature.geometry] : [],
      ),
    );
    const first = features[0];
    if (!geometry || !first) return null;
    const centroid = polygonCentroid(geometry);
    if (!centroid) return null;
    const summary = toParcelSummary(first.properties, centroid);
    if (!summary || summary.countyFips !== countyFips) return null;
    return {
      ...summary,
      geometry: {
        geojson: geometry,
        authority: "Ohio OGRIP",
        sourceUrl: url,
        retrievedAt,
      },
    };
  }

  /**
   * One row per county where OGRIP publishes parcels with IDs, measured by a
   * live count. No GroundTruth evidence adapter runs on live parcels yet, so
   * `evidenceKinds` is empty everywhere.
   */
  async function getCoverage(): Promise<Coverage[]> {
    const nowMs = now().getTime();
    if (coverageCache && nowMs - coverageCache.at < COVERAGE_CACHE_MS) {
      return coverageCache.rows;
    }
    const url = layerQueryUrl({
      where: "LocalParcelID IS NOT NULL",
      outStatistics: JSON.stringify([
        {
          statisticType: "count",
          onStatisticField: "OBJECTID",
          outStatisticFieldName: "parcels",
        },
      ]),
      groupByFieldsForStatistics: "County",
      f: "json",
    });
    const result = await getJson(url, statisticsSchema);
    const measuredAt = new Date(nowMs).toISOString();
    const counts = new Map<string, number>();
    for (const { attributes } of result.features) {
      const county = attributes.County
        ? countyByName(attributes.County)
        : undefined;
      if (county) counts.set(county.fips, attributes.parcels);
    }
    const rows: Coverage[] = OHIO_COUNTIES.filter((county) =>
      counts.has(county.fips),
    ).map((county) => ({
      county: county.name,
      countyFips: county.fips,
      boundarySearchable: (counts.get(county.fips) ?? 0) > 0,
      evidenceKinds: [],
      lastVerifiedAt: measuredAt,
    }));
    coverageCache = { at: nowMs, rows };
    return rows;
  }

  return { searchByParcelId, searchByAddress, getParcel, getCoverage };
}

type QueryFeature = z.infer<typeof featureQuerySchema>["features"][number];

function summaryFromFeature(feature: QueryFeature): ParcelSummary | null {
  if (!feature.centroid) return null;
  return toParcelSummary(feature.attributes, {
    latitude: feature.centroid.y,
    longitude: feature.centroid.x,
  });
}

/**
 * Builds an equality filter for a parcel-ID query. Accepts the county's
 * published ID, the same ID without dashes or dots (Licking publishes
 * `00100000601000` for the auditor's `001-000006-01.000`), and the
 * statewide form `39049-010-042534`. Every value is checked against the
 * parcel-ID character rule before it is quoted, so a query can only ever
 * become `LocalParcelID IN (...)`.
 */
export function parcelIdWhere(query: string): string | null {
  const upper = query.toUpperCase();
  const ids = new Set(
    [query, upper, upper.replace(/[-.]/g, "")].filter(isKeyableParcelId),
  );
  const clauses: string[] = [];
  if (ids.size > 0) {
    clauses.push(`LocalParcelID IN (${[...ids].map(sqlString).join(",")})`);
  }
  const statewide = /^(39\d{3})-(.+)$/.exec(upper);
  const county = statewide?.[1] ? countyByFips(statewide[1]) : undefined;
  const localId = statewide?.[2];
  if (county && localId && isKeyableParcelId(localId)) {
    clauses.push(
      `(County=${sqlString(county.name)} AND LocalParcelID=${sqlString(localId)})`,
    );
  }
  return clauses.length > 0 ? clauses.join(" OR ") : null;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function layerQueryUrl(params: Record<string, string>): string {
  return withParams(`${OGRIP_PARCELS_LAYER}/query`, params);
}

function withParams(base: string, params: Record<string, string>): string {
  return `${base}?${new URLSearchParams(params).toString()}`;
}

function uniqueByKey(results: ParcelSearchResult[]): ParcelSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.parcel.key)) return false;
    seen.add(result.parcel.key);
    return true;
  });
}

function envelopeAround(
  point: { longitude: number; latitude: number },
  halfWidthMeters: number,
): string {
  const dLat = halfWidthMeters / METERS_PER_DEGREE_LATITUDE;
  const dLon =
    halfWidthMeters /
    (METERS_PER_DEGREE_LATITUDE * Math.cos((point.latitude * Math.PI) / 180));
  return [
    point.longitude - dLon,
    point.latitude - dLat,
    point.longitude + dLon,
    point.latitude + dLat,
  ]
    .map((value) => value.toFixed(6))
    .join(",");
}

function distance(parcel: ParcelSummary, address: LocatedAddress): number {
  const dx =
    (parcel.centroid.longitude - address.longitude) *
    Math.cos((address.latitude * Math.PI) / 180);
  const dy = parcel.centroid.latitude - address.latitude;
  return dx * dx + dy * dy;
}

/** One parcel can be published as several polygons; keep every part. */
function mergeGeometry(
  geometries: (GeoJsonPolygon | GeoJsonMultiPolygon)[],
): GeoJsonPolygon | GeoJsonMultiPolygon | null {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0] ?? null;
  return {
    type: "MultiPolygon",
    coordinates: geometries.flatMap((geometry) =>
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates,
    ),
  };
}
