import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import area from "@turf/area";
import polygonClipping, { type Geom } from "polygon-clipping";
import { z } from "zod";

/** USDA NRCS Soil Data Access REST query service (SSURGO/Soil Data Mart). */
export const SDA_POST_REST =
  "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";

/**
 * Fallback when SDA fails: Esri's public ArcGIS Living Atlas "USA Soils Map
 * Units" layer, built from USDA NRCS gSSURGO. Each polygon carries the same
 * SSURGO `MUKEY`, `MUSYM`, `muname`, and `muaggatt.engstafdcd` values.
 */
export const LIVING_ATLAS_SOILS_LAYER =
  "https://services5.arcgis.com/7weheFjxuNkGGiZi/arcgis/rest/services/USA_Soils_Map_Units/FeatureServer/0";
export const LIVING_ATLAS_SOILS_QUERY = `${LIVING_ATLAS_SOILS_LAYER}/query`;
export const LIVING_ATLAS_SOILS_ITEM =
  "https://www.arcgis.com/home/item.html?id=d4c54647dd4c4405a9f4f0bc9fd351e9";

/** Default share of the check's time limit that SDA gets before fallback. */
export const DEFAULT_SDA_BUDGET_MS = 3_000;

export type SoilsSource = "soilDataAccess" | "livingAtlas";

/**
 * SSURGO `muaggatt.engstafdcd`: the map unit's published dominant-condition
 * interpretation for septic-tank absorption fields.
 */
export const SEPTIC_RATINGS = [
  "Very limited",
  "Somewhat limited",
  "Not limited",
] as const;
export type SepticRating = (typeof SEPTIC_RATINGS)[number];

export interface SoilMapUnit {
  mukey: string;
  symbol: string;
  name: string;
  rating: SepticRating;
  /** Share of the parcel polygon covered by this map unit, 0 to 1. */
  share: number;
}

export type SoilsOutcome =
  | {
      outcome: "found";
      source: SoilsSource;
      retrievedAt: string;
      mapUnits: SoilMapUnit[];
    }
  | {
      outcome: "missing";
      source: SoilsSource;
      retrievedAt: string;
      reason: "noMapUnits" | "notRated";
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface SsurgoSoilsClient {
  /**
   * Never throws. Asks SDA first, then the Living Atlas copy if SDA fails or
   * exceeds its budget. Aborting `signal` yields a timed-out outcome.
   */
  septicSuitability(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome>;
}

export interface SsurgoSoilsClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  /** How long SDA may take before the Living Atlas fallback is asked. */
  sdaBudgetMs?: number;
}

const responseSchema = z.object({
  Table: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
});

const ratingValue = z.union([z.string(), z.null()]).optional();
const polygonCoordinates = z.array(z.array(z.array(z.number())));
const livingAtlasSchema = z.object({
  type: z.literal("FeatureCollection"),
  exceededTransferLimit: z.boolean().optional(),
  properties: z
    .object({ exceededTransferLimit: z.boolean().optional() })
    .optional(),
  features: z.array(
    z.object({
      properties: z.object({
        MUKEY: z.union([z.string(), z.number(), z.null()]),
        MUSYM: z.union([z.string(), z.null()]),
        muname: z.union([z.string(), z.null()]),
        engstafdcd: ratingValue,
      }),
      geometry: z.union([
        z.object({ type: z.literal("Polygon"), coordinates: polygonCoordinates }),
        z.object({
          type: z.literal("MultiPolygon"),
          coordinates: z.array(polygonCoordinates),
        }),
      ]),
    }),
  ),
});

class SdaUnavailable extends Error {
  constructor() {
    super("SSURGO provider returned an unusable answer");
    this.name = "SdaUnavailableError";
  }
}

interface RatedRow {
  mukey: string | null;
  symbol: string | null;
  name: string | null;
  rating: SepticRating | null;
  area: number;
}

export function createSsurgoSoilsClient(
  options: SsurgoSoilsClientOptions = {},
): SsurgoSoilsClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sdaBudgetMs = options.sdaBudgetMs ?? DEFAULT_SDA_BUDGET_MS;

  async function fromSoilDataAccess(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome> {
    const query = septicSuitabilityQuery(toWkt(geometry));
    const response = await fetchImpl(SDA_POST_REST, {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        query,
        format: "JSON+COLUMNNAME",
      }).toString(),
    });
    if (!response.ok) throw new SdaUnavailable();
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SdaUnavailable();
    return rowsToOutcome(
      sdaRows(parsed.data.Table),
      "soilDataAccess",
      now().toISOString(),
    );
  }

  async function fromLivingAtlas(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome> {
    const response = await fetchImpl(LIVING_ATLAS_SOILS_QUERY, {
      method: "POST",
      signal,
      headers: {
        accept: "application/geo+json, application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: livingAtlasQuery(geometry).toString(),
    });
    if (!response.ok) throw new SdaUnavailable();
    const parsed = livingAtlasSchema.safeParse(await response.json());
    if (!parsed.success) throw new SdaUnavailable();
    const collection = parsed.data;
    if (
      collection.exceededTransferLimit ||
      collection.properties?.exceededTransferLimit
    ) {
      throw new SdaUnavailable();
    }
    return rowsToOutcome(
      livingAtlasRows(geometry, collection.features),
      "livingAtlas",
      now().toISOString(),
    );
  }

  async function septicSuitability(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome> {
    try {
      return await fromSoilDataAccess(
        geometry,
        AbortSignal.any([signal, AbortSignal.timeout(sdaBudgetMs)]),
      );
    } catch {
      // SDA failed or used its budget; ask the Living Atlas copy instead.
    }
    if (signal.aborted) return { outcome: "timeout", cause: "timedOut" };
    try {
      return await fromLivingAtlas(geometry, signal);
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { septicSuitability };
}

/**
 * Bounding-box query against the Living Atlas layer. The box returns a
 * superset; exact parcel overlap is measured locally in `livingAtlasRows`.
 */
export function livingAtlasQuery(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): URLSearchParams {
  const positions = (
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  ).flat(2);
  if (positions.length === 0) throw new SdaUnavailable();
  for (const [longitude, latitude] of positions) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new SdaUnavailable();
    }
  }
  const longitudes = positions.map(([longitude]) => longitude as number);
  const latitudes = positions.map(([, latitude]) => latitude as number);
  return new URLSearchParams({
    f: "geojson",
    geometry: [
      Math.min(...longitudes),
      Math.min(...latitudes),
      Math.max(...longitudes),
      Math.max(...latitudes),
    ].join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "MUKEY,MUSYM,muname,engstafdcd",
    returnGeometry: "true",
  });
}

function livingAtlasRows(
  parcel: GeoJsonPolygon | GeoJsonMultiPolygon,
  features: z.infer<typeof livingAtlasSchema>["features"],
): RatedRow[] {
  const byMukey = new Map<string, RatedRow>();
  const invalid: RatedRow[] = [];
  for (const feature of features) {
    const overlap = polygonClipping.intersection(
      parcel.coordinates as Geom,
      feature.geometry.coordinates as Geom,
    );
    const overlapArea = area({ type: "MultiPolygon", coordinates: overlap });
    if (!(overlapArea > 0)) continue;
    const { MUKEY, MUSYM, muname, engstafdcd } = feature.properties;
    const row: RatedRow = {
      mukey: textCell(MUKEY),
      symbol: textCell(MUSYM),
      name: textCell(muname),
      rating: ratingCell(engstafdcd),
      area: overlapArea,
    };
    if (!row.mukey) {
      invalid.push(row);
      continue;
    }
    const existing = byMukey.get(row.mukey);
    if (existing) existing.area += overlapArea;
    else byMukey.set(row.mukey, row);
  }
  return [...byMukey.values(), ...invalid].sort(
    (a, b) => b.area - a.area || String(a.mukey).localeCompare(String(b.mukey)),
  );
}

/**
 * One fixed-shape query: find every SSURGO map-unit polygon beneath the
 * parcel, measure its intersection, and join the published map-unit rating.
 * The parcel WKT is made only from numeric OGRIP coordinates, never user SQL.
 */
export function septicSuitabilityQuery(wkt: string): string {
  const literal = wkt.replaceAll("'", "''");
  const aoi = `geometry::STGeomFromText('${literal}', 4326).MakeValid()`;
  return [
    "WITH overlaps AS (",
    "  SELECT p.mukey,",
    `    SUM(p.mupolygongeo.STIntersection(${aoi}).STArea()) AS overlap_area`,
    "  FROM mupolygon AS p",
    "  WHERE p.mukey IN (",
    `    SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${literal}')`,
    "  )",
    `    AND p.mupolygongeo.STIntersects(${aoi}) = 1`,
    "  GROUP BY p.mukey",
    ")",
    "SELECT CAST(o.mukey AS varchar(30)) AS mukey,",
    "  m.musym, m.muname, a.engstafdcd, o.overlap_area",
    "FROM overlaps AS o",
    "INNER JOIN mapunit AS m ON m.mukey = o.mukey",
    "LEFT JOIN muaggatt AS a ON a.mukey = o.mukey",
    "WHERE o.overlap_area > 0",
    "ORDER BY o.overlap_area DESC, o.mukey",
  ].join("\n");
}

function sdaRows(table: (string | number | null)[][]): RatedRow[] {
  const [header, ...rows] = table;
  if (!header) throw new SdaUnavailable();
  const names = header.map((value) => String(value).toLowerCase());
  const index = (name: string) => names.indexOf(name);
  const columns = {
    mukey: index("mukey"),
    symbol: index("musym"),
    name: index("muname"),
    rating: index("engstafdcd"),
    area: index("overlap_area"),
  };
  if (Object.values(columns).some((value) => value < 0)) {
    throw new SdaUnavailable();
  }
  return rows.map((row) => ({
    mukey: textCell(row[columns.mukey]),
    symbol: textCell(row[columns.symbol]),
    name: textCell(row[columns.name]),
    rating: ratingCell(row[columns.rating]),
    area: numberCell(row[columns.area]),
  }));
}

function rowsToOutcome(
  rows: RatedRow[],
  source: SoilsSource,
  retrievedAt: string,
): SoilsOutcome {
  if (rows.length === 0) {
    return { outcome: "missing", source, retrievedAt, reason: "noMapUnits" };
  }
  const parsed = rows.flatMap(({ mukey, symbol, name, rating, area }) =>
    mukey && symbol && name && rating && area > 0
      ? [{ mukey, symbol, name, rating, area }]
      : [],
  );
  if (parsed.length !== rows.length) {
    return { outcome: "missing", source, retrievedAt, reason: "notRated" };
  }
  const total = parsed.reduce((sum, row) => sum + row.area, 0);
  if (!(total > 0)) throw new SdaUnavailable();
  return {
    outcome: "found",
    source,
    retrievedAt,
    mapUnits: parsed.map(({ area, ...row }) => ({
      ...row,
      share: area / total,
    })),
  };
}

function textCell(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberCell(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function ratingCell(
  value: string | number | null | undefined,
): SepticRating | null {
  const text = textCell(value);
  return SEPTIC_RATINGS.find((rating) => rating === text) ?? null;
}

export function toWkt(geometry: GeoJsonPolygon | GeoJsonMultiPolygon): string {
  const polygon = (rings: number[][][]) =>
    `(${rings.map((ring) => `(${ring.map(position).join(",")})`).join(",")})`;
  return geometry.type === "Polygon"
    ? `POLYGON${polygon(geometry.coordinates)}`
    : `MULTIPOLYGON(${geometry.coordinates.map(polygon).join(",")})`;
}

function position(coordinates: number[]): string {
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new SdaUnavailable();
  }
  return `${longitude} ${latitude}`;
}
