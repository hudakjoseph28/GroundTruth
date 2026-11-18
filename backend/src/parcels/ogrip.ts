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
import {
  MAX_PLACE_COUNTIES,
  parseAddressQuery,
  placeCounties,
  siteAddressAgrees,
  sitePlace,
  type AddressQuery,
} from "./addressQuery.js";
import { parcelIdWhere, sqlString } from "./parcelIdSearch.js";
import { isKeyableParcelId } from "./parcelKey.js";
import { hasNfhlStudy } from "../reports/femaFlood.js";
import { FRANKLIN_COUNTY_FIPS } from "../reports/franklinZoning.js";

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
 * Streets of one name the locator returns statewide: `Seaman Rd` alone is
 * eight streets in four counties (measured 2026-11-18).
 */
const MAX_STREET_CANDIDATES = 10;
/**
 * The house number counties publish for a lot with no assigned address:
 * rear lots and vacant land (the golden parcel is `0 SEAMAN RD`). The
 * locator holds no point for it, so it is searched along the street.
 */
const NO_HOUSE_NUMBER = "0";
/**
 * Half-widths of the box searched around a locator point. The points are
 * interpolated along street ranges and can land hundreds of meters from the
 * lot (84 W Dodridge St lands about 400 m away). Boxes are filtered by house
 * number on the server, so each returns a handful of rows. 500 m answers
 * most addresses in one request; the 1,500 m box, slower in dense areas
 * (0.3 to 7.8 s downtown vs 0.2 to 1.6 s at 500 m, measured 2026-11-17),
 * runs only when 500 m finds nothing. Before the filter, a 150/500/1,500 m
 * ladder returned up to 2,000 rows (426 KB) per box.
 */
const SEARCH_RADII_METERS = [500, 1_500] as const;
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
  /**
   * If a request has not answered after this long, send one identical
   * request and use whichever answers first. Only used when it is less
   * than half of `timeoutMs`. Default 2,500 ms.
   */
  hedgeAfterMs?: number;
  now?: () => Date;
}

/**
 * OGRIP's statewide layer stalls now and then: the same query that usually
 * answers in under 1 s took 8 s once and 0.7 s right after (measured
 * 2026-11-17). A stall is per request, so a second copy usually wins.
 */
export const DEFAULT_OGRIP_HEDGE_MS = 2_500;

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
  const hedgeAfterMs = options.hedgeAfterMs ?? DEFAULT_OGRIP_HEDGE_MS;
  const hedging = hedgeAfterMs * 2 < timeoutMs;
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
      body = hedging
        ? await hedgedGet(url, signal)
        : await readJson(url, signal);
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

  async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetchImpl(url, {
      signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new OgripError("unavailable");
    return response.json();
  }

  /** One request, plus a second identical one if the first stalls. */
  async function hedgedGet(url: string, signal: AbortSignal): Promise<unknown> {
    const first = new AbortController();
    const second = new AbortController();
    const attempt = (own: AbortController) =>
      readJson(url, AbortSignal.any([signal, own.signal]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backup = new Promise<unknown>((resolve, reject) => {
      timer = setTimeout(() => {
        attempt(second).then(resolve, reject);
      }, hedgeAfterMs);
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
    try {
      return await Promise.any([attempt(first), backup]);
    } catch (error) {
      throw error instanceof AggregateError ? error.errors[0] : error;
    } finally {
      clearTimeout(timer);
      first.abort();
      second.abort();
    }
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

  /**
   * Address search, in order, stopping at the first step with a match:
   *
   * 1. The OGRIP locator on the query as typed, then a box around each
   *    located point, matched on the parcel's published site address.
   * 2. The same with only house number + street (`10034 Appleton Rd`): the
   *    locator rejects some city names it does not hold for that street.
   * 3. Without the locator: `SitusAddressAll` matched directly in the
   *    counties the typed city lies in. It runs only when the locator failed
   *    or knew no such street, and a city narrows it to at most three
   *    counties: the field is not indexed, and one county takes 0.5–40 s.
   *    When the locator did find the street, a miss is a real miss
   *    (`123 Main St, Johnstown` has a street but no such parcel).
   *
   * A house number of 0 takes its own path (`searchUnnumbered`).
   *
   * Every step keeps only parcels consistent with a typed city. If the
   * locator failed and step 3 could not run, the failure is reported, not
   * hidden behind `[]`.
   */
  async function searchByAddress(query: string): Promise<ParcelSearchResult[]> {
    const budget = searchBudget();
    const parsed = parseAddressQuery(query);
    if (parsed?.outOfState) return [];
    const counties = parsed?.place ? placeCounties(parsed.place) : [];
    const keep = (results: ParcelSearchResult[]) =>
      uniqueByKey(
        results.filter((result) => placeConsistent(result, parsed, counties)),
      ).slice(0, MAX_RESULTS);

    // As typed; then with spelled-out directions and suffixes abbreviated
    // (the locator reads "South" in "37 South High Street" as a street
    // name); then number + street only.
    const attempts = [query];
    if (parsed?.abbreviated) attempts.push(parsed.abbreviated);
    if (
      parsed &&
      !attempts.some((a) => a.trim().toUpperCase() === parsed.streetOnly)
    ) {
      attempts.push(parsed.streetOnly);
    }
    const wanted = {
      ...(parsed?.direction ? { direction: parsed.direction } : {}),
      ...(parsed?.suffix ? { suffix: parsed.suffix } : {}),
    };
    if (parsed?.houseNumber === NO_HOUSE_NUMBER) {
      return keep(await searchUnnumbered(parsed, wanted, counties, budget));
    }
    let locatorFailure: OgripError | undefined;
    let locatorFoundStreet = false;
    let locatedTypedStreet = false;
    for (const text of attempts) {
      // Retries are for a locator that misread the query: it rejected the
      // typed city and located nothing, or read a spelled-out "South" as
      // the street. Once it has located the typed street, a retry finds
      // the same candidates, so a miss is final.
      if (locatedTypedStreet) break;
      if (text === parsed?.streetOnly && locatorFoundStreet) break;
      let located: LocatedAddress[];
      try {
        located = await locate(text, budget);
      } catch (error) {
        if (!(error instanceof OgripError)) throw error;
        locatorFailure = error;
        break;
      }
      if (located.length > 0) locatorFoundStreet = true;
      if (
        parsed &&
        located.some((address) => address.streetName === parsed.streetName)
      ) {
        locatedTypedStreet = true;
      }
      const perCandidate = await Promise.all(
        located.map((address) => parcelsAtAddress(address, wanted, budget)),
      );
      const results = keep(perCandidate.flat());
      if (results.length > 0) return results;
    }

    if (
      !locatorFoundStreet &&
      parsed?.place &&
      counties.length > 0 &&
      counties.length <= MAX_PLACE_COUNTIES
    ) {
      return keep(await parcelsBySiteAddress(parsed, counties, budget));
    }
    if (locatorFailure) throw locatorFailure;
    return [];
  }

  /**
   * `0 Seaman Rd`: the locator interpolates house numbers along a street, so
   * for 0 it answers a point at a street's low end, and for `0 Seaman Rd`
   * only on the Whitehall and Toledo streets of that name, not the golden
   * parcel's in Pleasant Township. Instead,
   * locate the street itself, with the typed city and then without, and
   * match `0 <street>` in a box around each located street. Once the
   * locator has found the street, a miss is final. If the locator is down,
   * a typed city narrows a direct site-address match, as in the main search.
   */
  async function searchUnnumbered(
    parsed: AddressQuery,
    wanted: Pick<AddressQuery, "direction" | "suffix">,
    counties: readonly string[],
    budget: AbortSignal,
  ): Promise<ParcelSearchResult[]> {
    const street = parsed.streetOnly.slice(parsed.houseNumber.length).trim();
    const attempts = parsed.place
      ? [`${street}, ${parsed.place}`, street]
      : [street];
    let locatorFailure: OgripError | undefined;
    for (const text of attempts) {
      let streets: LocatedAddress[];
      try {
        streets = await locateStreet(text, parsed, budget);
      } catch (error) {
        if (!(error instanceof OgripError)) throw error;
        locatorFailure = error;
        break;
      }
      if (streets.length === 0) continue;
      // One street's box can take 8 s while the others answer in 0.3 s
      // (measured 2026-11-18), so a slow street elsewhere in Ohio does not
      // discard lots already found. A box that failed may have held a
      // match, so with nothing found its failure is reported, not `[]`.
      const perStreet = await Promise.allSettled(
        streets.map((point) => parcelsAtAddress(point, wanted, budget)),
      );
      const found = perStreet.flatMap((settled) =>
        settled.status === "fulfilled" ? settled.value : [],
      );
      const failed = perStreet.find(
        (settled): settled is PromiseRejectedResult =>
          settled.status === "rejected",
      );
      if (found.length > 0 || !failed) return found;
      throw failed.reason;
    }
    if (
      locatorFailure &&
      parsed.place &&
      counties.length > 0 &&
      counties.length <= MAX_PLACE_COUNTIES
    ) {
      return parcelsBySiteAddress(parsed, counties, budget);
    }
    if (locatorFailure) throw locatorFailure;
    return [];
  }

  async function parcelsBySiteAddress(
    address: AddressQuery,
    countyFips: readonly string[],
    budget: AbortSignal,
  ): Promise<ParcelSearchResult[]> {
    const names = countyFips.flatMap((fips) => {
      const county = countyByFips(fips);
      return county ? [sqlString(county.name)] : [];
    });
    if (names.length === 0) return [];
    const url = layerQueryUrl({
      where: `County IN (${names.join(",")}) AND SitusAddressAll LIKE ${sqlString(`${address.houseNumber} %${address.streetName}%`)}`,
      outFields: PARCEL_FIELDS.join(","),
      returnGeometry: "false",
      returnCentroid: "true",
      outSR: "4326",
      resultRecordCount: "50",
      f: "json",
    });
    const result = await getJson(url, featureQuerySchema, budget);
    return result.features
      .filter(
        (feature) =>
          siteAddressMatches(
            feature.attributes.SitusAddressAll,
            address.houseNumber,
            address.streetName,
          ) &&
          siteAddressAgrees(
            feature.attributes.SitusAddressAll ?? "",
            address.streetName,
            address,
          ),
      )
      .flatMap((feature) => {
        const summary = summaryFromFeature(feature);
        return summary
          ? [{ parcel: summary, matchedOn: "siteAddress" as const }]
          : [];
      });
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

  /**
   * Points the locator holds for a street name with no house number, one
   * per street of that name. Only exact matches on the typed name count:
   * the locator also offers similar names.
   */
  async function locateStreet(
    query: string,
    parsed: AddressQuery,
    budget: AbortSignal,
  ): Promise<LocatedAddress[]> {
    const url = withParams(`${OGRIP_LOCATOR}/findAddressCandidates`, {
      SingleLine: query,
      maxLocations: String(MAX_STREET_CANDIDATES),
      outSR: "4326",
      outFields: "Addr_type,StName",
      f: "json",
    });
    const result = await getJson(url, locatorSchema, budget);
    const seen = new Set<string>();
    const located: LocatedAddress[] = [];
    for (const candidate of result.candidates) {
      const { Addr_type, StName } = candidate.attributes;
      if (candidate.score < MIN_LOCATOR_SCORE) continue;
      if (Addr_type !== "StreetName" || StName !== parsed.streetName) continue;
      const id = `${candidate.location.x.toFixed(3)}|${candidate.location.y.toFixed(3)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      located.push({
        houseNumber: parsed.houseNumber,
        streetName: StName,
        longitude: candidate.location.x,
        latitude: candidate.location.y,
      });
    }
    return located;
  }

  async function parcelsAtAddress(
    address: LocatedAddress,
    wanted: Pick<AddressQuery, "direction" | "suffix">,
    budget: AbortSignal,
  ): Promise<ParcelSearchResult[]> {
    for (const radius of SEARCH_RADII_METERS) {
      const url = layerQueryUrl({
        where: `LocalParcelID IS NOT NULL AND ${houseNumberWhere(address.houseNumber)}`,
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
        .filter(
          (feature) =>
            siteAddressMatches(
              feature.attributes.SitusAddressAll,
              address.houseNumber,
              address.streetName,
            ) &&
            siteAddressAgrees(
              feature.attributes.SitusAddressAll ?? "",
              address.streetName,
              wanted,
            ),
        )
        .flatMap((feature) => {
          const summary = summaryFromFeature(feature);
          return summary ? [summary] : [];
        })
        .sort((a, b) => distance(a, address) - distance(b, address))
        .map((parcel) => ({ parcel, matchedOn: "siteAddress" as const }));
      if (matches.length > 0) return matches;
      // The service stopped at its record limit: this box is incomplete,
      // so a miss here stays a miss rather than widening.
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
   * One row per county in a live count of OGRIP parcels with published IDs.
   * `boundarySearchable` means only that the count was above zero when it
   * was taken (`lastVerifiedAt`, kept while cached); it says nothing about
   * report depth. `evidenceKinds` lists the checks a live report can back
   * with a source in that county: `flood` wherever FEMA has an NFHL study
   * (83 counties; see OHIO_COUNTIES_WITHOUT_NFHL for the five without,
   * measured 2026-11-16), and `zoning` in Franklin County, where the
   * county's zoning map is read live. Every other check has no adapter yet. Counties
   * missing from the count get no row.
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
      evidenceKinds: [
        // Franklin County's zoning map (src/reports/franklinZoning.ts).
        ...(county.fips === FRANKLIN_COUNTY_FIPS ? (["zoning"] as const) : []),
        ...(hasNfhlStudy(county.fips) ? (["flood"] as const) : []),
      ],
      lastVerifiedAt: measuredAt,
    }));
    coverageCache = { at: nowMs, rows };
    return rows;
  }

  return { searchByParcelId, searchByAddress, getParcel, getCoverage };
}

type QueryFeature = z.infer<typeof featureQuerySchema>["features"][number];

/**
 * A result fits a typed city when its published address names that city,
 * or publishes no city and lies in a county the city is in. A published
 * address naming a different city is dropped: `123 MAIN ST PATASKALA` is not
 * an answer to `123 Main St, Johnstown`.
 */
function placeConsistent(
  result: ParcelSearchResult,
  parsed: AddressQuery | null,
  counties: readonly string[],
): boolean {
  if (!parsed?.place) return true;
  const where = sitePlace(
    result.parcel.siteAddress ?? "",
    parsed.streetName,
    parsed.place,
  );
  if (where === "named") return true;
  if (where === "other") return false;
  return counties.length === 0 || counties.includes(result.parcel.countyFips);
}

function summaryFromFeature(feature: QueryFeature): ParcelSummary | null {
  if (!feature.centroid) return null;
  return toParcelSummary(feature.attributes, {
    latitude: feature.centroid.y,
    longitude: feature.centroid.x,
  });
}

/**
 * Server-side filter on the published house number, so a box returns a
 * handful of rows instead of up to 2,000. The second pattern keeps site
 * addresses with leading spaces (Delaware and Licking publish some), so the
 * matcher sees every row it saw before. `houseNumber` is digits only.
 */
function houseNumberWhere(houseNumber: string): string {
  return `(SitusAddressAll LIKE ${sqlString(`${houseNumber} %`)} OR SitusAddressAll LIKE ${sqlString(` %${houseNumber} %`)})`;
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
