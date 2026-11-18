import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import { z } from "zod";

/** USDA NRCS Soil Data Access REST query service (SSURGO/Soil Data Mart). */
export const SDA_POST_REST =
  "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";

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
      retrievedAt: string;
      mapUnits: SoilMapUnit[];
    }
  | {
      outcome: "missing";
      retrievedAt: string;
      reason: "noMapUnits" | "notRated";
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface SsurgoSoilsClient {
  /** Never throws. Aborting `signal` yields a timed-out outcome. */
  septicSuitability(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome>;
}

export interface SsurgoSoilsClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const responseSchema = z.object({
  Table: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
});

class SdaUnavailable extends Error {
  constructor() {
    super("USDA NRCS Soil Data Access returned an unusable answer");
    this.name = "SdaUnavailableError";
  }
}

export function createSsurgoSoilsClient(
  options: SsurgoSoilsClientOptions = {},
): SsurgoSoilsClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  async function septicSuitability(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<SoilsOutcome> {
    try {
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
      return rowsToOutcome(parsed.data.Table, now().toISOString());
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

function rowsToOutcome(
  table: (string | number | null)[][],
  retrievedAt: string,
): SoilsOutcome {
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
  if (rows.length === 0) {
    return { outcome: "missing", retrievedAt, reason: "noMapUnits" };
  }

  const parsed = rows.flatMap((row) => {
    const mukey = textCell(row[columns.mukey]);
    const symbol = textCell(row[columns.symbol]);
    const name = textCell(row[columns.name]);
    const rating = ratingCell(row[columns.rating]);
    const area = numberCell(row[columns.area]);
    return mukey && symbol && name && rating && area > 0
      ? [{ mukey, symbol, name, rating, area }]
      : [];
  });
  if (parsed.length !== rows.length) {
    return { outcome: "missing", retrievedAt, reason: "notRated" };
  }
  const total = parsed.reduce((sum, row) => sum + row.area, 0);
  if (!(total > 0)) throw new SdaUnavailable();
  return {
    outcome: "found",
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
