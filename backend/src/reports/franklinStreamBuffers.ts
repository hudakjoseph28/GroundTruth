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
  type Box,
} from "./sampling.js";

/**
 * Franklin County's stream-buffer layer: the riparian setbacks the county
 * maps along streams in the Big Darby Creek watershed and the Alum Creek and
 * Big Walnut Creek watersheds. The golden report cites this layer for the
 * Big Darby setback. Fields (`Name`, `Details_lnk`) were read from the live
 * layer (`?f=json`) on 2026-11-18; it held two features, one per program.
 */
export const FRANKLIN_STREAM_BUFFERS_LAYER =
  "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/Franklin_County_Stream_Buffers/FeatureServer/0";

/**
 * Each feature is one polygon for a whole watershed (Big Darby: 206,830
 * vertices, 5.5 MB), and the service cannot clip it to a lot. So the lot
 * query asks only which setbacks overlap it, and each overlapping setback's
 * outline is downloaded once at full precision and kept for this long.
 * Generalizing it to 1e-6° (about 0.1 m) moved the golden parcel's share
 * from 4.651% to 4.643%, across the rounding line, so it is not generalized.
 */
export const SETBACK_GEOMETRY_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * A download runs on its own limit, not the check's: when a check times out
 * waiting for a first download, the download still finishes for the next
 * lot. Measured 2026-11-18: about 1.5 s for the Big Darby outline.
 */
export const SETBACK_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Grid points per side across the parcel's bounding box (as for zoning). */
export const SETBACK_SAMPLE_GRID = 300;

export interface Setback {
  /** The layer's `Name`, e.g. `Big Darby Creek Watershed Riparian Setbacks`. */
  name: string;
  /** Share of the parcel's area inside this setback, 0 to 1. */
  share: number;
}

/**
 * The adapter outcomes (DataContract, "Provider normalization"). `found`
 * with no setbacks means the layer answered and maps none on the lot.
 */
export type StreamSetbackOutcome =
  | {
      outcome: "found";
      retrievedAt: string;
      /** Largest share first. Empty when no setback covers the lot. */
      setbacks: Setback[];
      /** Share of the parcel inside any setback. */
      share: number;
    }
  | {
      outcome: "timeout";
      cause: "timedOut" | "unavailable";
    };

export interface FranklinStreamBuffersClient {
  /** Never throws. Aborting `signal` yields `timeout`. */
  setbacks(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<StreamSetbackOutcome>;
}

export interface FranklinStreamBuffersClientOptions {
  fetch?: typeof fetch;
  now?: () => Date;
}

const overlapSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        OBJECTID: z.number(),
        Name: z.string().nullish(),
      }),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

const ringsSchema = z.array(z.array(z.array(z.number()).min(2)));
const outlineSchema = z.object({
  features: z
    .array(
      z.object({
        attributes: z.object({ OBJECTID: z.number() }),
        geometry: z.object({ rings: ringsSchema }),
      }),
    )
    .length(1),
});

class StreamBuffersUnavailable extends Error {
  constructor() {
    super("Franklin County stream-buffer layer returned an unusable answer");
    this.name = "StreamBuffersUnavailableError";
  }
}

/** One setback outline in WGS84, each ring with its bounding box. */
export interface Outline {
  rings: { coords: number[][]; box: Box }[];
}

export function createFranklinStreamBuffersClient(
  options: FranklinStreamBuffersClientOptions = {},
): FranklinStreamBuffersClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const outlines = new Map<
    number,
    { expiresAt: number; outline: Promise<Outline> }
  >();

  /** One POST (the parcel polygon can be too long for a URL). */
  async function query<T>(
    params: Record<string, string>,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    const response = await fetchImpl(`${FRANKLIN_STREAM_BUFFERS_LAYER}/query`, {
      method: "POST",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ...params, f: "json" }).toString(),
    });
    if (!response.ok) throw new StreamBuffersUnavailable();
    // ArcGIS reports query errors as HTTP 200 with an `error` object.
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new StreamBuffersUnavailable();
    return parsed.data;
  }

  /**
   * A setback's outline, from the cache while it is fresh. The caller stops
   * waiting when its own `signal` aborts; the download itself carries on.
   */
  function outline(objectId: number, signal: AbortSignal): Promise<Outline> {
    const nowMs = now().getTime();
    const cached = outlines.get(objectId);
    if (cached && cached.expiresAt > nowMs) {
      return untilAborted(cached.outline, signal);
    }
    const loading = query(
      {
        objectIds: String(objectId),
        outFields: "OBJECTID",
        returnGeometry: "true",
        outSR: "4326",
        geometryPrecision: "7",
      },
      outlineSchema,
      AbortSignal.timeout(SETBACK_DOWNLOAD_TIMEOUT_MS),
    ).then(({ features }) => ({
      rings: (features[0]?.geometry.rings ?? []).map((coords) => ({
        coords,
        box: bounds(coords),
      })),
    }));
    outlines.set(objectId, {
      expiresAt: nowMs + SETBACK_GEOMETRY_TTL_MS,
      outline: loading,
    });
    // A failed or aborted download is not kept: the next lot asks again.
    loading.catch(() => {
      if (outlines.get(objectId)?.outline === loading) {
        outlines.delete(objectId);
      }
    });
    return untilAborted(loading, signal);
  }

  async function setbacks(
    geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
    signal: AbortSignal,
  ): Promise<StreamSetbackOutcome> {
    try {
      const overlapping = await query(
        {
          geometry: toEsriPolygon(geometry),
          geometryType: "esriGeometryPolygon",
          inSR: "4326",
          // Interiors must overlap: a setback that only touches the lot's
          // edge is left out by the server.
          spatialRel: "esriSpatialRelRelation",
          relationParam: "T********",
          outFields: "OBJECTID,Name",
          returnGeometry: "false",
        },
        overlapSchema,
        signal,
      );
      if (overlapping.exceededTransferLimit) {
        throw new StreamBuffersUnavailable();
      }
      const retrievedAt = now().toISOString();
      const areas = await Promise.all(
        overlapping.features.map(async ({ attributes }) => ({
          name: attributes.Name?.trim() || "Riparian setback",
          outline: await outline(attributes.OBJECTID, signal),
        })),
      );
      return {
        outcome: "found",
        retrievedAt,
        ...measureSetbacks(geometry, areas),
      };
    } catch {
      return {
        outcome: "timeout",
        cause: signal.aborted ? "timedOut" : "unavailable",
      };
    }
  }

  return { setbacks };
}

/** `promise`, or a rejection as soon as `signal` aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      },
    );
  });
}

/**
 * How much of the parcel each setback covers, by the same sampling as the
 * zoning check (franklinZoning.ts `measure`): a SETBACK_SAMPLE_GRID square
 * grid over the parcel's bounding box, each point tested with the even-odd
 * rule. Only rings whose box overlaps the parcel's are projected and tested,
 * so a watershed-sized outline costs milliseconds per lot.
 */
export function measureSetbacks(
  parcelGeometry: GeoJsonPolygon | GeoJsonMultiPolygon,
  areas: { name: string; outline: Outline }[],
): { setbacks: Setback[]; share: number } {
  const lonLat = parcelRings(parcelGeometry);
  const parcelBox = bounds(lonLat.flat());
  const project = localProjection(parcelGeometry);
  const rings = lonLat.map(project.ring);
  const box = bounds(rings.flat());
  const parcelEdges = edgesInBand(rings, box);

  const tested = areas.map((area) => ({
    name: area.name,
    edges: edgesInBand(
      area.outline.rings
        .filter((ring) => overlaps(ring.box, parcelBox))
        .map((ring) => project.ring(ring.coords)),
      box,
    ),
  }));

  const counts = new Map<string, number>();
  let total = 0;
  let covered = 0;
  const stepX = (box.maxX - box.minX) / SETBACK_SAMPLE_GRID;
  const stepY = (box.maxY - box.minY) / SETBACK_SAMPLE_GRID;
  for (let i = 0; i < SETBACK_SAMPLE_GRID; i += 1) {
    const x = box.minX + (i + 0.5) * stepX;
    for (let j = 0; j < SETBACK_SAMPLE_GRID; j += 1) {
      const y = box.minY + (j + 0.5) * stepY;
      if (!inside(x, y, parcelEdges)) continue;
      total += 1;
      const here = new Set<string>();
      for (const area of tested) {
        if (inside(x, y, area.edges)) here.add(area.name);
      }
      for (const name of here) counts.set(name, (counts.get(name) ?? 0) + 1);
      if (here.size > 0) covered += 1;
    }
  }
  if (total === 0) throw new StreamBuffersUnavailable();
  return {
    setbacks: [...counts.entries()]
      .map(([name, n]) => ({ name, share: n / total }))
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)),
    share: covered / total,
  };
}
