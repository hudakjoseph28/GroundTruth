import type { RequestHandler } from "express";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError, logSafeFailure } from "../http/errors.js";
import { countyByFips } from "../parcels/ohioCounties.js";
import { OgripError, type OgripClient } from "../parcels/ogrip.js";
import { parseParcelKey } from "../parcels/parcelKey.js";

const MIN_QUERY = 3;
const MAX_QUERY = 120;

/** A parcel-ID query is one token with at least one digit: `010-042534`. */
const PARCEL_ID_QUERY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface ParcelRoutes {
  search: RequestHandler;
  getParcel: RequestHandler;
  coverage: RequestHandler;
}

export function parcelRoutes(ogrip: OgripClient): ParcelRoutes {
  const search = asyncRoute(async (req, res) => {
    const query = readQuery(req.query.q);
    const results = await fromOgrip(res.locals.requestId, () =>
      looksLikeParcelId(query)
        ? ogrip.searchByParcelId(query)
        : ogrip.searchByAddress(query),
    );
    res.json(results);
  });

  const getParcel = asyncRoute(async (req, res) => {
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
    const parcel = await fromOgrip(res.locals.requestId, () =>
      ogrip.getParcel(key.countyFips, key.sourceParcelId),
    );
    if (!parcel) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        `Ohio's parcel map has no parcel ${key.sourceParcelId} in ${county.name} County.`,
        false,
      );
    }
    res.json(parcel);
  });

  const coverage = asyncRoute(async (_req, res) => {
    res.json(await fromOgrip(res.locals.requestId, () => ogrip.getCoverage()));
  });

  return { search, getParcel, coverage };
}

function readQuery(value: unknown): string {
  const query = typeof value === "string" ? value.trim() : "";
  if (query.length < MIN_QUERY) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Enter at least 3 characters. Use a street address or a parcel ID.",
      false,
    );
  }
  if (query.length > MAX_QUERY) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Use 120 characters or fewer.",
      false,
    );
  }
  return query;
}

function looksLikeParcelId(query: string): boolean {
  return PARCEL_ID_QUERY.test(query) && /\d/.test(query);
}

/** Turns an OGRIP failure into a retryable v1 error; never into a result. */
async function fromOgrip<T>(
  requestId: unknown,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof OgripError)) throw error;
    logSafeFailure(
      typeof requestId === "string" ? requestId : "unknown",
      error,
    );
    if (error.kind === "timeout") {
      throw new HttpError(
        504,
        "PROVIDER_TIMEOUT",
        "Ohio's parcel service did not answer in time. Try again in a moment.",
        true,
      );
    }
    throw new HttpError(
      502,
      "INTERNAL_ERROR",
      "Ohio's parcel service could not be reached. Try again in a moment.",
      true,
    );
  }
}
