import type { RequestHandler, Response } from "express";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError, logSafeFailure } from "../http/errors.js";
import type { LandAssetFiles } from "../land/buildLandAssets.js";
import {
  NoDrawableBoundaryError,
  type LandAssetService,
} from "../land/landAssets.js";
import { countyByFips } from "../parcels/ohioCounties.js";
import { OgripError } from "../parcels/ogrip.js";
import { parseParcelKey } from "../parcels/parcelKey.js";

/** Browsers and the Vercel edge may keep built assets for a day. */
const CACHE_CONTROL = "public, max-age=86400";

export interface LandRoutes {
  /** `GET /api/parcels/:parcelKey/land`: the LandMeta, building if needed. */
  meta: RequestHandler;
  /** `GET /api/parcels/:parcelKey/land/:file`: imagery.jpg or height.png. */
  file: RequestHandler;
}

/**
 * The land block's imagery and elevation for any parcel, built on demand
 * from its OGRIP boundary (src/land) and cached. File names in the meta are
 * relative to `/api/parcels/:parcelKey/land/`, as the baked files are to
 * their folder.
 */
export function landRoutes(service: LandAssetService): LandRoutes {
  async function assetsFor(req: Parameters<RequestHandler>[0], res: Response) {
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
    let files: LandAssetFiles | null;
    try {
      files = await service.get(key.countyFips, key.sourceParcelId, parcelKey);
    } catch (error) {
      throw toHttpError(String(res.locals.requestId), error);
    }
    if (!files) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        `Ohio's parcel map has no parcel ${key.sourceParcelId} in ${county.name} County.`,
        false,
      );
    }
    return files;
  }

  const meta = asyncRoute(async (req, res) => {
    const files = await assetsFor(req, res);
    res.set("Cache-Control", CACHE_CONTROL).json(files.meta);
  });

  const file = asyncRoute(async (req, res) => {
    const name = req.params.file;
    if (name !== "imagery.jpg" && name !== "height.png") {
      throw new HttpError(404, "NOT_FOUND", "No such land asset.", false);
    }
    const files = await assetsFor(req, res);
    res
      .set("Cache-Control", CACHE_CONTROL)
      .type(name === "imagery.jpg" ? "image/jpeg" : "image/png")
      .send(name === "imagery.jpg" ? files.imagery : files.height);
  });

  return { meta, file };
}

/** Provider failures are retryable errors; never a made-up land block. */
function toHttpError(requestId: string, error: unknown): HttpError {
  if (error instanceof NoDrawableBoundaryError) {
    return new HttpError(404, "NOT_FOUND", error.message, false);
  }
  logSafeFailure(requestId, error);
  const timedOut =
    (error instanceof OgripError && error.kind === "timeout") ||
    (error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError"));
  if (timedOut) {
    return new HttpError(
      504,
      "PROVIDER_TIMEOUT",
      "The imagery or elevation service did not answer in time. Try again in a moment.",
      true,
    );
  }
  return new HttpError(
    502,
    "INTERNAL_ERROR",
    error instanceof OgripError
      ? "Ohio's parcel service could not be reached. Try again in a moment."
      : "The imagery or elevation service could not be reached. Try again in a moment.",
    true,
  );
}
