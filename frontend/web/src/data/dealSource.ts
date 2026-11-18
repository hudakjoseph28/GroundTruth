import {
  stagedDemoDeals,
  type Deal,
  type TimelineEvent,
} from "@groundtruth/shared";
import { request, type FailedOutcome } from "./api";

/**
 * Deal data from the GroundTruth API (v1 routes). The API projects deal state
 * from confirmed chain events, so what these return is what the page shows:
 * nothing here falls back to a bundled fixture.
 *
 *   GET /api/deals/:id
 *   GET /api/deals/:id/timeline
 *
 * Every function resolves to an outcome and never throws, except when the
 * caller aborts it (an AbortError the caller ignores).
 */

export type DealOutcome =
  | { status: "found"; deal: Deal }
  | { status: "missing"; message: string }
  | FailedOutcome;

export type TimelineOutcome =
  | { status: "found"; timeline: TimelineEvent[] }
  | { status: "missing"; message: string }
  | FailedOutcome;

export async function getDeal(
  dealId: string,
  signal?: AbortSignal,
): Promise<DealOutcome> {
  const response = await request(
    `/api/deals/${encodeURIComponent(dealId)}`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "missing", message: response.error.error.message };
  }
  return { status: "found", deal: response.body as Deal };
}

export async function getDealTimeline(
  dealId: string,
  signal?: AbortSignal,
): Promise<TimelineOutcome> {
  const response = await request(
    `/api/deals/${encodeURIComponent(dealId)}/timeline`,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "missing", message: response.error.error.message };
  }
  return { status: "found", timeline: response.body as TimelineEvent[] };
}

export function dealPath(dealId: string): string {
  return `/deals/${encodeURIComponent(dealId)}`;
}

/**
 * IDs of the public staged deals on a parcel. Only the IDs come from the
 * shared fixtures; each deal's state is read from the API.
 */
export function stagedDealIdsFor(parcelKey: string): string[] {
  return stagedDemoDeals
    .filter((deal) => deal.parcelKey === parcelKey)
    .map((deal) => deal.id);
}
