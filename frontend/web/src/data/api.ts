import type { ApiError } from "@groundtruth/shared";

/**
 * Calls against the GroundTruth API. The browser calls relative `/api/...`
 * paths: Vercel forwards them to the API in production, and Vite does the
 * same in dev and preview (vite.config.ts).
 *
 * It resolves to an answer and never throws, except when the caller aborts
 * it (an AbortError the caller ignores).
 */

/** A request that failed. `retryable` comes from the API's ApiError. */
export interface FailedOutcome {
  status: "error";
  message: string;
  retryable: boolean;
}

export type ApiResponse =
  | { status: "ok"; body: unknown }
  /** A 4xx ApiError: the request itself was not answerable (bad key, no such record). */
  | { status: "rejected"; error: ApiError }
  /** A 5xx, an unreadable body, or no connection. */
  | { status: "failed"; failure: FailedOutcome };

const UNREACHABLE: FailedOutcome = {
  status: "error",
  message:
    "GroundTruth could not be reached. Check your connection and try again.",
  retryable: true,
};

export function request(
  path: string,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  return call(path, { signal, headers: { accept: "application/json" } });
}

/** One JSON POST against the GroundTruth API, answered the same way as `request`. */
export function postJson(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  return call(path, {
    method: "POST",
    signal,
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(path: string, init: RequestInit): Promise<ApiResponse> {
  const signal = init.signal;
  let response: Response;
  try {
    response = await fetch(path, init);
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
