import type { ActivityEvent } from "@groundtruth/shared";
import { request, type FailedOutcome } from "./api";

/**
 * GET /api/activity: the newest confirmed program events across the staged
 * demo deals. Resolves to an outcome and never throws, except when the caller
 * aborts it.
 */
export type ActivityOutcome =
  | { status: "found"; events: ActivityEvent[] }
  | FailedOutcome;

export async function getActivity(
  signal?: AbortSignal,
): Promise<ActivityOutcome> {
  const response = await request("/api/activity", signal);
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return {
      status: "error",
      message: response.error.error.message,
      retryable: true,
    };
  }
  if (!Array.isArray(response.body)) {
    return {
      status: "error",
      message: "The activity answer was not a list.",
      retryable: true,
    };
  }
  // The API only serves confirmed rows; drop anything else rather than show it.
  const events = (response.body as ActivityEvent[]).filter(
    (event) =>
      event.confirmationStatus === "confirmed" &&
      Boolean(event.transactionSignature),
  );
  return { status: "found", events };
}
