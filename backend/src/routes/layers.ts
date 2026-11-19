import type { Parcel, ParcelLayers } from "@groundtruth/shared";
import type { RequestHandler } from "express";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError, logSafeFailure } from "../http/errors.js";
import { countyByFips } from "../parcels/ohioCounties.js";
import type { OgripClient } from "../parcels/ogrip.js";
import { parseParcelKey } from "../parcels/parcelKey.js";
import { loadParcel } from "./report.js";

/** A complete answer is reused for this long; one with a failed layer is not kept. */
export const LAYERS_TTL_MS = 60 * 60 * 1_000;
const MAX_CACHED = 200;

export interface LayersRouteOptions {
  ogrip: OgripClient;
  /** The layer builder; its clock, when it has one, also times the cache. */
  layers: { layers(parcel: Parcel): Promise<ParcelLayers>; now?: () => Date };
}

/**
 * `GET /api/parcels/:parcelKey/layers`
 *
 * The map layers drawn on the parcel's land block (src/layers). Always 200
 * once the parcel exists: a source that fails or runs out of time is an
 * `unavailable` layer inside the answer, never an empty map in its place.
 */
export function layersRoute(options: LayersRouteOptions): RequestHandler {
  const now = options.layers.now ?? (() => new Date());
  const cache = new Map<string, { expiresAt: number; layers: ParcelLayers }>();

  return asyncRoute(async (req, res) => {
    const requestId = String(res.locals.requestId);
    const raw = req.params.parcelKey;
    const key = parseParcelKey(typeof raw === "string" ? raw : "");
    if (!key) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        "Parcel key must look like ohio:39049:PARCEL-ID.",
        false,
      );
    }
    const county = countyByFips(key.countyFips);
    if (!county) {
      throw new HttpError(
        404,
        "NO_COVERAGE",
        `${key.countyFips} is not an Ohio county code. GroundTruth covers Ohio's 88 counties.`,
        false,
      );
    }
    const parcelKey = `ohio:${key.countyFips}:${key.sourceParcelId}`;
    const cached = cache.get(parcelKey);
    if (cached && cached.expiresAt > now().getTime()) {
      res.set("Cache-Control", "public, max-age=3600").json(cached.layers);
      return;
    }

    const parcel = await loadParcel(
      options.ogrip,
      key.countyFips,
      key.sourceParcelId,
      requestId,
    );
    if (!parcel) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        `Ohio's parcel map has no parcel ${key.sourceParcelId} in ${county.name} County.`,
        false,
      );
    }

    let layers: ParcelLayers;
    try {
      layers = await options.layers.layers(parcel);
    } catch (error) {
      // The layer builder catches provider failures itself; this is a bug.
      logSafeFailure(requestId, error);
      throw error;
    }
    const complete = layers.layers.every(
      (layer) => layer.status !== "unavailable",
    );
    if (complete) {
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(parcelKey, {
        expiresAt: now().getTime() + LAYERS_TTL_MS,
        layers,
      });
    }
    res
      .set("Cache-Control", complete ? "public, max-age=3600" : "no-store")
      .json(layers);
  });
}
