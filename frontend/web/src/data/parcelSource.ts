import {
  goldenParcel,
  type Parcel,
  type ParcelReport,
  type ParcelSearchResult,
} from "@groundtruth/shared";
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
