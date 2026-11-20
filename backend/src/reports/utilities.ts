import type {
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  Parcel,
} from "@groundtruth/shared";
import { z } from "zod";
import { toEsriPolygon } from "./femaFlood.js";
import { distanceToPaths } from "./franklinAccess.js";
import { FRANKLIN_COUNTY_FIPS } from "./franklinZoning.js";

/**
 * Where public water and public sewer appear to reach a parcel. Every
 * source below answered live on 2026-11-19; fields, codes, and extents were
 * read from each layer's `?f=json` and `returnExtentOnly` that day. The
 * sources that were tried and did not work are listed in
 * docs/phases/02-parcel-research/Coverage.md.
 */

/**
 * US EPA Community Water System Service Area Boundaries (v3.0, 2026-03-17):
 * ~44,600 community water systems, 56% drawn from state or utility data and
 * the rest modeled (`Symbology_Field`: `System Sourced` or `Modeled`).
 * Non-community systems (a school's well) are in a separate service.
 */
export const EPA_WATER_SYSTEMS_LAYER =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0";

/**
 * US EPA sewersheds of publicly owned treatment works, from the 2022 Clean
 * Watersheds Needs Survey (`Method`: `Sourced` or `Modeled`).
 */
export const EPA_SEWERSHEDS_LAYER =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/National_Sewershed_Web_Map_Internal_WFL1/FeatureServer/0";

/** The same service's plant points; `Authority_Name` names the utility. */
export const EPA_SEWERSHED_ENDPOINTS_LAYER =
  "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/National_Sewershed_Web_Map_Internal_WFL1/FeatureServer/1";

/**
 * Franklin County Sanitary Engineering's 46 service areas (unincorporated
 * subdivisions, mobile home parks, and two villages it operates).
 * `SERVICE` is `SEWER` or `WATER SEWER`.
 */
export const FCSE_SERVICE_AREAS_LAYER =
  "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCSE_Service_Areas/FeatureServer/0";

/** The county department's public page (HTTP 200, 2026-11-19). */
export const FCSE_PAGE =
  "https://www.franklincountyohio.gov/Agency-Directory/Sanitary-Engineering";

export const FCSE_NAME = "Franklin County Sanitary Engineering";

export type UtilityKind = "water" | "sewer";

/**
 * A utility's own map of its public mains. Only layers that answered a
 * parcel query on 2026-11-19 are listed. The City of Columbus publishes no
 * water or sewer main layer (see Coverage.md), so Columbus lots get no main
 * distance.
 */
export interface MainLayer {
  kind: UtilityKind;
  /** Who publishes the map: `City of Dublin`. */
  publisher: string;
  /** The layer's own name. */
  title: string;
  url: string;
  /** Active public mains only: no laterals, services, abandoned, or private lines. */
  where: string;
  /** The field naming each main's owner. */
  ownerField: string;
  /** Owner code → name, for the owners the `where` clause keeps. */
  owners: Readonly<Record<string, string>>;
  /** Where the layer has features, WGS84 [west, south, east, north]. */
  bbox: readonly [number, number, number, number];
}

const DUBLIN = "City of Dublin";
const GROVE_CITY = "City of Grove City";
const CANAL_WINCHESTER = "City of Canal Winchester";
const COLUMBUS = "City of Columbus";

export const MAIN_LAYERS: readonly MainLayer[] = [
  {
    kind: "sewer",
    publisher: DUBLIN,
    title: "Sanitary Mains",
    url: "https://services1.arcgis.com/NqY8dnPSEdMJhuRw/arcgis/rest/services/Sanitary_Sewer/FeatureServer/6",
    // MainType 1 is a gravity main; a house cannot tap a force main.
    where:
      "Status = 'Active' AND MainType = 1 AND Ownership IN ('Dublin','Columbus','ShawneeHills')",
    ownerField: "Ownership",
    owners: {
      Dublin: DUBLIN,
      Columbus: COLUMBUS,
      ShawneeHills: "Village of Shawnee Hills",
    },
    bbox: [-83.2023, 40.059, -83.0833, 40.1668],
  },
  {
    kind: "water",
    publisher: DUBLIN,
    title: "Water Pipes",
    url: "https://services1.arcgis.com/NqY8dnPSEdMJhuRw/arcgis/rest/services/Water_Utility/FeatureServer/9",
    where: "Status = 'Active' AND Ownership IN ('Dublin','Columbus','DelCo')",
    ownerField: "Ownership",
    owners: {
      Dublin: DUBLIN,
      Columbus: COLUMBUS,
      DelCo: "Del-Co Water Company",
    },
    bbox: [-83.2023, 40.063, -83.0888, 40.1632],
  },
  {
    kind: "sewer",
    publisher: GROVE_CITY,
    title: "San. Gravity Main",
    url: "https://arcgisweb.grovecityohio.gov:6443/arcgis/rest/services/Web_GIS_Services_New/SanitarySewer/MapServer/7",
    // OWNEDBY codes from the AssetOwner_1 domain; 2 (SWACO), 7 (Private),
    // and 8 (Other) are left out. Some rows here are storm lines.
    where:
      "Status IN ('Existing','Rehabilitated') AND (WATERTYPE = 'Sewage' OR WATERTYPE IS NULL) AND OWNEDBY IN (1,-3,3,4,5,6)",
    ownerField: "OWNEDBY",
    owners: {
      "1": GROVE_CITY,
      "-3": GROVE_CITY,
      "3": COLUMBUS,
      "4": "Jackson Township",
      "5": "Pleasant Township",
      "6": "Prairie Township",
    },
    bbox: [-83.1202, 39.8258, -83.0149, 39.9063],
  },
  {
    kind: "water",
    publisher: GROVE_CITY,
    title: "Main",
    url: "https://arcgisweb.grovecityohio.gov:6443/arcgis/rest/services/Production_Services/Water_Utilities_ArcPro/MapServer/9",
    where:
      "Status = 'Existing' AND ACTIVEFLAG = 1 AND WATERTYPE = 'Potable' AND OWNEDBY IN (1,-3,3)",
    ownerField: "OWNEDBY",
    owners: { "1": GROVE_CITY, "-3": GROVE_CITY, "3": COLUMBUS },
    bbox: [-83.1257, 39.8256, -83.0092, 39.9158],
  },
  {
    kind: "sewer",
    publisher: CANAL_WINCHESTER,
    title: "Sanitary_Mains",
    url: "https://services3.arcgis.com/y4utLgB1hH3ocvdq/arcgis/rest/services/Sanitary_View_Layer/FeatureServer/22",
    // `Main` is a gravity main (force mains are `Force Main`); `Pubic` is
    // the layer's own misspelling on some public mains.
    where: "TYPE = 'Main' AND OWNER IN ('Public','Pubic')",
    ownerField: "OWNER",
    owners: { Public: CANAL_WINCHESTER, Pubic: CANAL_WINCHESTER },
    bbox: [-82.8479, 39.8103, -82.7603, 39.8722],
  },
  {
    kind: "water",
    publisher: CANAL_WINCHESTER,
    title: "Water Mains",
    url: "https://services3.arcgis.com/y4utLgB1hH3ocvdq/arcgis/rest/services/Water_View_Layer/FeatureServer/17",
    where: "TYPE = 'Main' AND OWNER = 'Public'",
    ownerField: "OWNER",
    owners: { Public: CANAL_WINCHESTER },
    bbox: [-82.8439, 39.8205, -82.7686, 39.8698],
  },
];

/**
 * Searched in order until a main turns up. The first radius is twice the
 * "adjacent" distance in utilitiesCheck.ts, so a main found there is the
 * nearest one; the last is how far a main can be and still be named.
 */
export const MAIN_SEARCH_RADII_M = [60, 500] as const;
export const MAIN_SEARCH_M =
  MAIN_SEARCH_RADII_M[MAIN_SEARCH_RADII_M.length - 1];

/** Each source's own limit; the check's limit (pipeline.ts) is longer. */
export const DEFAULT_UTILITY_SOURCE_TIMEOUT_MS = 6_000;

export type SourceAnswer<T> =
  | { status: "answered"; retrievedAt: string; value: T }
  | { status: "failed"; cause: "timedOut" | "unavailable" };

export interface WaterSystem {
  pwsid: string;
  /** As EPA publishes it: `COLUMBUS PUBLIC WATER SYSTEM`. */
  name: string;
  /** EPA modeled the boundary; no state or utility drew it. */
  modeled: boolean;
}

export interface Sewershed {
  cwnsId: string;
  /** `Columbus Jackson Pike WWTP & Sewers`. */
  facility: string;
  /** From the plant's endpoint: `Columbus Division of Sewerage and Drainage`. */
  authority?: string;
  modeled: boolean;
}

export interface CountyServiceArea {
  /** `AREA_NAME` as published: `HARRISBURG (O&M ONLY)`. */
  name: string;
  water: boolean;
  sewer: boolean;
  /** False for an area the county marks `(NOT BUILT)`. */
  built: boolean;
}

export interface NearestMain {
  distanceM: number;
  /** Owner name from the layer's domain: `City of Grove City`. */
  owner: string;
}

export interface MainAnswer {
  layer: MainLayer;
  /** Null: the layer has no kept main within MAIN_SEARCH_M of the lot. */
  answer: SourceAnswer<NearestMain | null>;
}

export interface UtilitiesOutcome {
  waterSystems: SourceAnswer<WaterSystem[]>;
  sewersheds: SourceAnswer<Sewershed[]>;
  /** Franklin County Sanitary Engineering; null outside Franklin County. */
  countyAreas: SourceAnswer<CountyServiceArea[]> | null;
  /** Only the main layers whose extent reaches within MAIN_SEARCH_M of the lot. */
  mains: MainAnswer[];
}

export interface UtilitiesClient {
  /** Never throws. Each source has its own limit; aborting `signal` stops them all. */
  utilities(parcel: Parcel, signal: AbortSignal): Promise<UtilitiesOutcome>;
}

export interface UtilitiesClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  sourceTimeoutMs?: number;
}

const waterSystemsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        PWSID: z.string().nullish(),
        PWS_Name: z.string().nullish(),
        Symbology_Field: z.string().nullish(),
      }),
    }),
  ),
});

const sewershedsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        CWNS_ID: z.string().nullish(),
        FACILITY_NAME: z.string().nullish(),
        Method: z.string().nullish(),
      }),
    }),
  ),
});

const endpointsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        CWNS_ID: z.string().nullish(),
        Authority_Name: z.string().nullish(),
      }),
    }),
  ),
});

const countyAreasSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        AREA_NAME: z.string().nullish(),
        SERVICE: z.string().nullish(),
      }),
    }),
  ),
});

const mainsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.record(z.string(), z.unknown()),
      geometry: z
        .object({ paths: z.array(z.array(z.array(z.number()).min(2))) })
        .nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

class SourceUnavailable extends Error {
  constructor() {
    super("A utility map returned an unusable answer");
    this.name = "UtilitySourceUnavailableError";
  }
}

export function createUtilitiesClient(
  options: UtilitiesClientOptions = {},
): UtilitiesClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sourceTimeoutMs =
    options.sourceTimeoutMs ?? DEFAULT_UTILITY_SOURCE_TIMEOUT_MS;

  /** One POST (a parcel polygon can be too long for a URL). */
  async function query<T>(
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
      body: new URLSearchParams({ ...params, f: "json" }).toString(),
    });
    if (!response.ok) throw new SourceUnavailable();
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    // A truncated answer could leave out the nearest main or an area.
    const body = schema.safeParse(await response.json());
    if (
      !body.success ||
      (body.data as { exceededTransferLimit?: boolean }).exceededTransferLimit
    ) {
      throw new SourceUnavailable();
    }
    return body.data;
  }

  const intersecting = (esri: string, extra: Record<string, string>) => ({
    where: "1=1",
    geometry: esri,
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "false",
    ...extra,
  });

  /** Runs one source on its own limit; a failure or timeout is its answer. */
  async function source<T>(
    parent: AbortSignal,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<SourceAnswer<T>> {
    const controller = new AbortController();
    const stop = () => controller.abort();
    parent.addEventListener("abort", stop, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<SourceAnswer<T>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ status: "failed", cause: "timedOut" });
      }, sourceTimeoutMs);
    });
    const answered = run(controller.signal).then(
      (value): SourceAnswer<T> => ({
        status: "answered",
        retrievedAt: now().toISOString(),
        value,
      }),
      (): SourceAnswer<T> => ({
        status: "failed",
        cause: controller.signal.aborted ? "timedOut" : "unavailable",
      }),
    );
    try {
      return await Promise.race([answered, timedOut]);
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", stop);
    }
  }

  async function waterSystems(esri: string, signal: AbortSignal) {
    const result = await query(
      EPA_WATER_SYSTEMS_LAYER,
      intersecting(esri, { outFields: "PWSID,PWS_Name,Symbology_Field" }),
      waterSystemsSchema,
      signal,
    );
    const systems = new Map<string, WaterSystem>();
    for (const { attributes } of result.features) {
      const name = attributes.PWS_Name?.trim();
      const pwsid = attributes.PWSID?.trim();
      if (!name || !pwsid || systems.has(pwsid)) continue;
      systems.set(pwsid, {
        pwsid,
        name,
        modeled: attributes.Symbology_Field?.trim() === "Modeled",
      });
    }
    return [...systems.values()];
  }

  async function sewersheds(esri: string, signal: AbortSignal) {
    const result = await query(
      EPA_SEWERSHEDS_LAYER,
      intersecting(esri, { outFields: "CWNS_ID,FACILITY_NAME,Method" }),
      sewershedsSchema,
      signal,
    );
    const sheds = new Map<string, Sewershed>();
    for (const { attributes } of result.features) {
      const cwnsId = attributes.CWNS_ID?.trim();
      const facility = attributes.FACILITY_NAME?.trim();
      if (!cwnsId || !facility || sheds.has(cwnsId)) continue;
      sheds.set(cwnsId, {
        cwnsId,
        facility,
        modeled: attributes.Method?.trim() === "Modeled",
      });
    }
    if (sheds.size === 0) return [];
    // The utility's name is on the plant's endpoint. Without it the
    // sewershed still counts and the check names the plant instead, so the
    // lookup gets a third of the source's limit and never costs the answer.
    const lookup = new AbortController();
    const stop = () => lookup.abort();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, sourceTimeoutMs / 3);
    const authorities = await query(
      EPA_SEWERSHED_ENDPOINTS_LAYER,
      {
        where: `END_FACILITY = 'Y' AND CWNS_ID IN (${[...sheds.keys()]
          .map((id) => `'${id.replace(/'/g, "''")}'`)
          .join(",")})`,
        outFields: "CWNS_ID,Authority_Name",
        returnGeometry: "false",
      },
      endpointsSchema,
      lookup.signal,
    )
      .catch(() => null)
      .finally(() => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      });
    for (const { attributes } of authorities?.features ?? []) {
      const shed = sheds.get(attributes.CWNS_ID?.trim() ?? "");
      const authority = attributes.Authority_Name?.trim();
      if (shed && authority && !shed.authority) shed.authority = authority;
    }
    return [...sheds.values()];
  }

  async function countyAreas(esri: string, signal: AbortSignal) {
    const result = await query(
      FCSE_SERVICE_AREAS_LAYER,
      intersecting(esri, { outFields: "AREA_NAME,SERVICE" }),
      countyAreasSchema,
      signal,
    );
    return result.features.flatMap(({ attributes }): CountyServiceArea[] => {
      const name = attributes.AREA_NAME?.trim();
      if (!name) return [];
      const service = (attributes.SERVICE ?? "").toUpperCase();
      return [
        {
          name,
          water: /\bWATER\b/.test(service),
          sewer: /\bSEWER\b/.test(service),
          built: !/NOT BUILT/i.test(name),
        },
      ];
    });
  }

  async function nearestMain(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    esri: string,
    layer: MainLayer,
    signal: AbortSignal,
  ): Promise<NearestMain | null> {
    for (const radius of MAIN_SEARCH_RADII_M) {
      const result = await query(
        layer.url,
        {
          where: layer.where,
          geometry: esri,
          geometryType: "esriGeometryPolygon",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          distance: String(radius),
          units: "esriSRUnit_Meter",
          outFields: layer.ownerField,
          returnGeometry: "true",
          outSR: "4326",
          geometryPrecision: "7",
        },
        mainsSchema,
        signal,
      );
      let best: NearestMain | null = null;
      for (const feature of result.features) {
        const owner =
          layer.owners[String(feature.attributes[layer.ownerField])];
        const paths = feature.geometry?.paths;
        if (!owner || !paths) continue;
        const distanceM = distanceToPaths(geometry, paths);
        if (distanceM === null || distanceM > radius) continue;
        if (!best || distanceM < best.distanceM) best = { distanceM, owner };
      }
      if (best) return best;
    }
    return null;
  }

  async function utilities(
    parcel: Parcel,
    signal: AbortSignal,
  ): Promise<UtilitiesOutcome> {
    const geometry = parcel.geometry.geojson;
    const esri = toEsriPolygon(geometry);
    const covering = MAIN_LAYERS.filter((layer) =>
      reaches(layer.bbox, geometry, MAIN_SEARCH_M),
    );
    const [water, sheds, county, mains] = await Promise.all([
      source(signal, (limited) => waterSystems(esri, limited)),
      source(signal, (limited) => sewersheds(esri, limited)),
      parcel.countyFips === FRANKLIN_COUNTY_FIPS
        ? source(signal, (limited) => countyAreas(esri, limited))
        : null,
      Promise.all(
        covering.map(async (layer) => ({
          layer,
          answer: await source(signal, (limited) =>
            nearestMain(geometry, esri, layer, limited),
          ),
        })),
      ),
    ]);
    return {
      waterSystems: water,
      sewersheds: sheds,
      countyAreas: county,
      mains,
    };
  }

  return { utilities };
}

/** True when the parcel, grown by `metres`, overlaps the box. */
function reaches(
  [west, south, east, north]: readonly [number, number, number, number],
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
  metres: number,
): boolean {
  const points = (
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates.flat()
  ).flat();
  if (points.length === 0) return false;
  const lats = points.map(([, lat = 0]) => lat);
  const lons = points.map(([lon = 0]) => lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLat = metres / 111_320;
  const padLon =
    metres / (111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return (
    Math.min(...lons) - padLon <= east &&
    Math.max(...lons) + padLon >= west &&
    minLat - padLat <= north &&
    maxLat + padLat >= south
  );
}
