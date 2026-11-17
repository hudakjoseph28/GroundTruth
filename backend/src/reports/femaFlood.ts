import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";
import { z } from "zod";

/**
 * FEMA's National Flood Hazard Layer (NFHL), queried only from the API.
 * Layer IDs were read from the live service directory on 2026-11-16
 * (`<service>?f=json`); they are named, not guessed.
 */
export const NFHL_SERVICE =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";

export const NFHL_LAYERS = {
  /** Where FEMA has a digital flood study (`STUDY_ID`). */
  availability: 0,
  /** Letters of Map Revision that changed the printed map (`EFF_DATE`). */
  lomrs: 1,
  /** Flood Insurance Rate Map panels (`FIRM_PAN`, `EFF_DATE`). */
  firmPanels: 3,
  /** Flood hazard zone polygons (`FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF`). */
  floodHazardZones: 28,
} as const;

export const nfhlLayerUrl = (layer: number) => `${NFHL_SERVICE}/${layer}`;

/** FEMA's public map portal, for a person to look a lot up by hand. */
export const FEMA_MAP_SERVICE_CENTER = "https://msc.fema.gov/portal/home";

/** FEMA's value for parts of a study area it did not map. */
const AREA_NOT_INCLUDED = "AREA NOT INCLUDED";

export interface FloodZone {
  /** FEMA `FLD_ZONE`, e.g. `AE`, `X`. */
  zone: string;
  /** FEMA `ZONE_SUBTY`, e.g. `FLOODWAY`, when published. */
  subtype?: string;
  /** FEMA `SFHA_TF`: inside a Special Flood Hazard Area. */
  specialFloodHazardArea: boolean;
}

export interface DatedRecord {
  /** FIRM panel number or LOMR case number. */
  id: string;
  /** UTC midnight of FEMA's `EFF_DATE`, when published. */
  effectiveDate?: string;
}

/**
 * The four outcomes every evidence adapter returns (DataContract,
 * "Provider normalization"). Only `found` may become `evidenceFound`.
 */
export type FloodOutcome =
  | {
      outcome: "found";
      retrievedAt: string;
      /** Distinct zones whose interior overlaps the parcel's interior. */
      zones: FloodZone[];
      /** Part of the parcel is in FEMA's "area not included". */
      partlyNotIncluded: boolean;
      panels: DatedRecord[];
      lomrs: DatedRecord[];
    }
  | {
      /** No NFHL study and no mapped zone covers the parcel. */
      outcome: "missing";
      retrievedAt: string;
    }
  | {
      /** FEMA's own layers disagree, so no zone is stated. */
      outcome: "conflict";
      retrievedAt: string;
      reason: "studyWithoutZones" | "sfhaFlagMismatch";
    }
  | {
      /** No usable answer: out of time, or the service failed. */
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface FemaFloodClient {
  /** Never throws. Aborting `signal` yields `timeout`. */
  floodZones(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<FloodOutcome>;
}

export interface FemaFloodClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const zonesSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        FLD_ZONE: z.string().nullish(),
        ZONE_SUBTY: z.string().nullish(),
        SFHA_TF: z.string().nullish(),
      }),
    }),
  ),
});

const panelsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        FIRM_PAN: z.string().nullish(),
        EFF_DATE: z.number().nullish(),
      }),
    }),
  ),
});

const lomrsSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        CASE_NO: z.string().nullish(),
        EFF_DATE: z.number().nullish(),
        STATUS: z.string().nullish(),
      }),
    }),
  ),
});

const availabilitySchema = z.object({
  features: z.array(
    z.object({ attributes: z.object({ STUDY_ID: z.string().nullish() }) }),
  ),
});

class FemaUnavailable extends Error {
  constructor() {
    super("FEMA NFHL returned an unusable answer");
    this.name = "FemaUnavailableError";
  }
}

/**
 * Zones whose SFHA flag contradicts FEMA's own zone definitions: A and V
 * zones are Special Flood Hazard Areas, X and D are not.
 */
function sfhaFlagMismatch(zone: FloodZone): boolean {
  if (/^[AV]/.test(zone.zone)) return !zone.specialFloodHazardArea;
  if (zone.zone === "X" || zone.zone === "D")
    return zone.specialFloodHazardArea;
  return false;
}

export function createFemaFloodClient(
  options: FemaFloodClientOptions = {},
): FemaFloodClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  /**
   * One POST query (parcel geometry can be too long for a URL). A dropped
   * connection is retried once: FEMA's server occasionally resets the first
   * connection. Timeouts and HTTP errors are not retried.
   */
  async function query<T>(
    layer: number,
    geometry: string,
    outFields: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const body = new URLSearchParams({
      geometry,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      // Interiors must overlap: a zone that only touches the parcel's edge
      // is not in the parcel.
      spatialRel: "esriSpatialRelRelation",
      relationParam: "T********",
      outFields,
      returnGeometry: "false",
      f: "json",
    }).toString();
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(`${nfhlLayerUrl(layer)}/query`, {
          method: "POST",
          signal,
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        });
      } catch (error) {
        if (signal.aborted || attempt >= 1) throw error;
        continue;
      }
      if (!response.ok) throw new FemaUnavailable();
      // ArcGIS reports query errors as HTTP 200 with an `error` object.
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) throw new FemaUnavailable();
      return parsed.data;
    }
  }

  async function floodZones(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<FloodOutcome> {
    const esri = toEsriPolygon(geometry);
    try {
      const [zones, panels, lomrs, availability] = await Promise.all([
        query(
          NFHL_LAYERS.floodHazardZones,
          esri,
          "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
          zonesSchema,
          signal,
        ),
        query(
          NFHL_LAYERS.firmPanels,
          esri,
          "FIRM_PAN,EFF_DATE",
          panelsSchema,
          signal,
        ),
        query(
          NFHL_LAYERS.lomrs,
          esri,
          "CASE_NO,EFF_DATE,STATUS",
          lomrsSchema,
          signal,
        ),
        query(
          NFHL_LAYERS.availability,
          esri,
          "STUDY_ID",
          availabilitySchema,
          signal,
        ),
      ]);
      const retrievedAt = now().toISOString();

      const all = distinctZones(
        zones.features.map(({ attributes }) => ({
          zone: attributes.FLD_ZONE?.trim() ?? "",
          subtype: attributes.ZONE_SUBTY?.trim() || undefined,
          specialFloodHazardArea: attributes.SFHA_TF === "T",
        })),
      );
      const mapped = all.filter(
        (zone) => zone.zone !== "" && zone.zone !== AREA_NOT_INCLUDED,
      );
      const studied = availability.features.some(
        ({ attributes }) => !!attributes.STUDY_ID,
      );

      if (mapped.length === 0) {
        if (studied && all.length === 0) {
          return {
            outcome: "conflict",
            retrievedAt,
            reason: "studyWithoutZones",
          };
        }
        return { outcome: "missing", retrievedAt };
      }
      if (mapped.some(sfhaFlagMismatch)) {
        return { outcome: "conflict", retrievedAt, reason: "sfhaFlagMismatch" };
      }
      return {
        outcome: "found",
        retrievedAt,
        zones: mapped,
        partlyNotIncluded: all.length > mapped.length,
        panels: dated(
          panels.features.map((f) => ({
            id: f.attributes.FIRM_PAN,
            effectiveDate: f.attributes.EFF_DATE,
          })),
        ),
        lomrs: dated(
          lomrs.features
            // Only revisions FEMA lists as in effect change the map.
            .filter((f) => f.attributes.STATUS === "Effective")
            .map((f) => ({
              id: f.attributes.CASE_NO,
              effectiveDate: f.attributes.EFF_DATE,
            })),
        ),
      };
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { floodZones };
}

function distinctZones(zones: FloodZone[]): FloodZone[] {
  const seen = new Map<string, FloodZone>();
  for (const zone of zones) {
    const key = `${zone.zone}|${zone.subtype ?? ""}|${zone.specialFloodHazardArea}`;
    if (!seen.has(key)) seen.set(key, zone);
  }
  // SFHA zones first, then by name, so findings read the same every time.
  return [...seen.values()].sort(
    (a, b) =>
      Number(b.specialFloodHazardArea) - Number(a.specialFloodHazardArea) ||
      a.zone.localeCompare(b.zone) ||
      (a.subtype ?? "").localeCompare(b.subtype ?? ""),
  );
}

function dated(
  rows: {
    id: string | null | undefined;
    effectiveDate: number | null | undefined;
  }[],
): DatedRecord[] {
  const seen = new Map<string, DatedRecord>();
  for (const row of rows) {
    const id = row.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      id,
      effectiveDate:
        typeof row.effectiveDate === "number"
          ? new Date(row.effectiveDate).toISOString()
          : undefined,
    });
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Esri polygon JSON in WGS84. Esri reads clockwise rings as outer rings and
 * counter-clockwise rings as holes, so each ring is oriented that way
 * regardless of how the GeoJSON source wound it.
 */
export function toEsriPolygon(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): string {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const rings = polygons.flatMap((polygon) =>
    polygon.map((ring, index) => orient(ring, index === 0)),
  );
  return JSON.stringify({ rings, spatialReference: { wkid: 4326 } });
}

function orient(ring: number[][], outer: boolean): number[][] {
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1 = 0, y1 = 0] = ring[i] ?? [];
    const [x2 = 0, y2 = 0] = ring[i + 1] ?? [];
    twiceArea += x1 * y2 - x2 * y1;
  }
  const clockwise = twiceArea < 0;
  return clockwise === outer ? ring : [...ring].reverse();
}
