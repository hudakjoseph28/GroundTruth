import {
  goldenParcel,
  type ApiError,
  type Parcel,
  type ParcelReport,
  type ParcelSearchResult,
} from "@groundtruth/shared";

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

/** A request that failed. `retryable` comes from the API's ApiError. */
export interface FailedOutcome {
  status: "error";
  message: string;
  retryable: boolean;
}

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
      message: `No Ohio parcel matched “${query}”. Try a parcel ID such as 230-000918, or a street address that starts with a house number.`,
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

type ApiResponse =
  | { status: "ok"; body: unknown }
  /** A 4xx ApiError: the request itself was not answerable (bad key, no such parcel). */
  | { status: "rejected"; error: ApiError }
  /** A 5xx, an unreadable body, or no connection. */
  | { status: "failed"; failure: FailedOutcome };

const UNREACHABLE: FailedOutcome = {
  status: "error",
  message:
    "GroundTruth could not be reached. Check your connection and try again.",
  retryable: true,
};

async function request(
  path: string,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "failed", failure: UNREACHABLE };
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok && body !== undefined) return { status: "ok", body };

  const apiError = isApiError(body) ? body : null;
  if (apiError && response.status >= 400 && response.status < 500) {
    return { status: "rejected", error: apiError };
  }
  return {
    status: "failed",
    failure: {
      status: "error",
      message: apiError?.error.message ?? UNREACHABLE.message,
      // 502 and 504 from OGRIP or FEMA say retryable: true. A gateway page
      // with no ApiError body is a transient failure too.
      retryable: apiError?.error.retryable ?? true,
    },
  };
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string" &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  );
}
