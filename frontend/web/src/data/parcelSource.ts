import {
  goldenParcel,
  type Parcel,
  type ParcelArea,
  type ParcelReport,
  type ParcelSearchResult,
} from "@groundtruth/shared";
import { EXPLORE_MAP } from "../content/explore";
import { SEARCH } from "../content/search";
import { request, type FailedOutcome } from "./api";

export type { FailedOutcome };

const MIN_QUERY = 3;
const MAX_QUERY = 120;

/**
 * Parcel data from the GroundTruth API (v1 routes). The browser calls
 * relative `/api/...` paths: Vercel forwards them to the API in production,
 * and Vite does the same in dev and preview (vite.config.ts).
 *
 *   GET /api/parcels/search?q=
 *   GET /api/parcels/:parcelKey
 *   GET /api/parcels/:parcelKey/report
 *   GET /api/parcels/area?bbox=west,south,east,north
 *
 * Every function resolves to an outcome and never throws, except when the
 * caller aborts it (an AbortError the caller ignores).
 */

export type SearchOutcome =
  | { status: "invalid"; message: string }
  | { status: "empty"; message: string }
  | { status: "results"; results: ParcelSearchResult[] }
  | FailedOutcome;

export type ParcelOutcome =
  | { status: "found"; parcel: Parcel }
  | { status: "missing"; message: string }
  | FailedOutcome;

export type ReportOutcome =
  | { status: "found"; report: ParcelReport }
  | { status: "missing"; message: string }
  | FailedOutcome;

export type AreaOutcome =
  | { status: "found"; area: ParcelArea }
  /** The box is outside Ohio (NO_COVERAGE) or too large to draw. */
  | { status: "refused"; code: "outside" | "zoomIn"; message: string }
  | FailedOutcome;

/**
 * How long the map waits for one area. The API gives OGRIP 8 s per request
 * and answers 504 after that; this covers a slow network on top.
 */
export const AREA_TIMEOUT_MS = 15_000;

/** The /api/parcels/area box: `[west, south, east, north]` in degrees. */
export type Bbox = [number, number, number, number];

/** The parcels whose published outlines touch the box. */
export async function getParcelArea(
  bbox: Bbox,
  signal?: AbortSignal,
): Promise<AreaOutcome> {
  const timeout = AbortSignal.timeout(AREA_TIMEOUT_MS);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const timedOut: FailedOutcome = {
    status: "error",
    message: EXPLORE_MAP.timeout,
    retryable: true,
  };
  let response;
  try {
    response = await request(
      `/api/parcels/area?bbox=${bbox.map((value) => value.toFixed(5)).join(",")}`,
      both,
    );
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) return timedOut;
    throw error;
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (response.status === "failed") {
    return timeout.aborted ? timedOut : response.failure;
  }
  if (response.status === "rejected") {
    const { code, message } = response.error.error;
    return {
      status: "refused",
      code: code === "NO_COVERAGE" ? "outside" : "zoomIn",
      message,
    };
  }
  return { status: "found", area: response.body as ParcelArea };
}

/** The answer for a query the API would reject, or null if it is valid. */
export function invalidQuery(
  rawQuery: string,
): Extract<SearchOutcome, { status: "invalid" }> | null {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY) {
    return {
      status: "invalid",
      message:
        "Enter at least 3 characters. Use a street address or a parcel ID.",
    };
  }
  if (query.length > MAX_QUERY) {
    return { status: "invalid", message: "Use 120 characters or fewer." };
  }
  return null;
}

export async function searchParcels(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  const invalid = invalidQuery(rawQuery);
  if (invalid) return invalid;
  const query = rawQuery.trim();

  const response = await request(
    `/api/parcels/search?q=${encodeURIComponent(query)}`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "invalid", message: response.error.error.message };
  }
  const results = response.body as ParcelSearchResult[];
  if (results.length === 0) {
    return {
      status: "empty",
      message: SEARCH.empty(query),
    };
  }
  return { status: "results", results };
}

export async function getParcel(
  parcelKey: string,
  signal?: AbortSignal,
): Promise<ParcelOutcome> {
  const response = await request(
    `/api/parcels/${encodeURIComponent(parcelKey)}`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "missing", message: response.error.error.message };
  }
  return { status: "found", parcel: response.body as Parcel };
}

export async function getParcelReport(
  parcelKey: string,
  signal?: AbortSignal,
): Promise<ReportOutcome> {
  const response = await request(
    `/api/parcels/${encodeURIComponent(parcelKey)}/report`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "missing", message: response.error.error.message };
  }
  return { status: "found", report: response.body as ParcelReport };
}

export function sampleParcelPath(): string {
  return parcelPath(goldenParcel.key);
}

export function parcelPath(parcelKey: string): string {
  return `/parcels/${encodeURIComponent(parcelKey)}`;
}
