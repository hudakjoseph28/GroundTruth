import type { Parcel } from "@groundtruth/shared";
import type { RequestHandler } from "express";
import { prisma } from "../db.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError, logSafeFailure } from "../http/errors.js";
import { countyByFips } from "../parcels/ohioCounties.js";
import { OgripError, type OgripClient } from "../parcels/ogrip.js";
import { parseParcelKey } from "../parcels/parcelKey.js";
import {
  createFemaFloodClient,
  type FemaFloodClient,
} from "../reports/femaFlood.js";
import {
  createFranklinZoningClient,
  type FranklinZoningClient,
} from "../reports/franklinZoning.js";
import {
  buildReport,
  DEFAULT_FEMA_TIMEOUT_MS,
  DEFAULT_ZONING_TIMEOUT_MS,
} from "../reports/pipeline.js";
import { prismaReportStore, type ReportStore } from "../reports/store.js";

/** How long a live report is served from PostgreSQL before it is rebuilt. */
export const LIVE_REPORT_TTL_MS = 24 * 60 * 60 * 1_000;

export interface ReportRouteOptions {
  ogrip: OgripClient;
  fema?: FemaFloodClient;
  store?: ReportStore;
  /** Limit for the flood check. Defaults to 6000 ms. */
  floodTimeoutMs?: number;
  /** Franklin County zoning map, for Franklin parcels only. */
  zoning?: FranklinZoningClient;
  /** Limit for the Franklin zoning check. Defaults to 6000 ms. */
  zoningTimeoutMs?: number;
  now?: () => Date;
}

/**
 * `GET /api/parcels/:parcelKey/report`
 *
 * 1. A stored report in force (seeded, or a live copy before it expires)
 *    is served as stored.
 * 2. Otherwise the parcel is loaded from OGRIP and every check runs live
 *    (src/reports/pipeline.ts). The report is always 200 once the parcel
 *    exists; a slow or failed check is an `unknown` check inside it.
 * 3. A live report with no passing failure is stored for LIVE_REPORT_TTL_MS
 *    after the response is sent. A database failure never blocks a live
 *    report; it only decides the answer when OGRIP has no such parcel.
 */
export function reportRoute(options: ReportRouteOptions): RequestHandler {
  const fema = options.fema ?? createFemaFloodClient();
  const store = options.store ?? prismaReportStore(prisma);
  const floodTimeoutMs = options.floodTimeoutMs ?? DEFAULT_FEMA_TIMEOUT_MS;
  const zoning = options.zoning ?? createFranklinZoningClient();
  const zoningTimeoutMs = options.zoningTimeoutMs ?? DEFAULT_ZONING_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  return asyncRoute(async (req, res) => {
    const requestId = String(res.locals.requestId);
    const raw = req.params.parcelKey;
    const parcelKey = typeof raw === "string" ? raw : "";
    const key = parseParcelKey(parcelKey);
    if (!key) {
      throw new HttpError(
        400,
        "INVALID_REQUEST",
        "Parcel key must look like ohio:39049:PARCEL-ID.",
        false,
      );
    }

    let storeFailure: unknown;
    try {
      const stored = await store.read(parcelKey, now());
      if (stored) {
        res.json(stored);
        return;
      }
    } catch (error) {
      storeFailure = error;
      logSafeFailure(requestId, error);
    }

    const county = countyByFips(key.countyFips);
    if (!county) {
      if (storeFailure) throw storeFailure;
      throw new HttpError(
        404,
        "NO_COVERAGE",
        `${key.countyFips} is not an Ohio county code. GroundTruth covers Ohio's 88 counties.`,
        false,
      );
    }

    const parcel = await loadParcel(
      options.ogrip,
      key.countyFips,
      key.sourceParcelId,
      requestId,
    );
    if (!parcel) {
      if (storeFailure) throw storeFailure;
      throw new HttpError(
        404,
        "NOT_FOUND",
        `Ohio's parcel map has no parcel ${key.sourceParcelId} in ${county.name} County.`,
        false,
      );
    }

    const built = await buildReport(parcel, {
      fema,
      floodTimeoutMs,
      zoning,
      zoningTimeoutMs,
      now,
    });
    res.json(built.report);

    if (built.complete && !storeFailure) {
      const expiresAt = new Date(now().getTime() + LIVE_REPORT_TTL_MS);
      store.write(parcel, built.report, expiresAt).catch((error: unknown) => {
        logSafeFailure(requestId, error);
      });
    }
  });
}

/** An OGRIP failure is a retryable v1 error, never a guessed parcel. */
async function loadParcel(
  ogrip: OgripClient,
  countyFips: string,
  sourceParcelId: string,
  requestId: string,
): Promise<Parcel | null> {
  try {
    return await ogrip.getParcel(countyFips, sourceParcelId);
  } catch (error) {
    if (!(error instanceof OgripError)) throw error;
    logSafeFailure(requestId, error);
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
