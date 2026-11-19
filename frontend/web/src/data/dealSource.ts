import {
  stagedDemoDeals,
  type Deal,
  type DealSmsSubscription,
  type DealSmsSubscriptionRequest,
  type TimelineEvent,
} from "@groundtruth/shared";
import { postJson, request, type FailedOutcome } from "./api";

/**
 * Deal data from the GroundTruth API (v1 routes). The API projects deal state
 * from confirmed chain events, so what these return is what the page shows:
 * nothing here falls back to a bundled fixture.
 *
 *   GET /api/deals/:id
 *   GET /api/deals/:id/timeline
 *   POST /api/deals/:id/sms-subscriptions
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

export type TextAlertsOutcome =
  | { status: "subscribed"; subscription: DealSmsSubscription }
  /** A 4xx the visitor can act on: a bad number, a closed deal, a full list. */
  | { status: "rejected"; message: string }
  | FailedOutcome;

/**
 * Whether this API sends deal texts. It has no read-only route for that, so
 * this posts an empty body, which can never be stored. The route answers 503
 * before it reads the body when Twilio is not configured, and 400 when it is
 * (no number, no consent). Anything else, including an API without the route
 * or no connection, counts as off: the opt-in only shows when it can work.
 * backend/test/smsSubscriptions.test.ts pins both answers.
 */
export async function dealTextsEnabled(
  dealId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await postJson(
    `/api/deals/${encodeURIComponent(dealId)}/sms-subscriptions`,
    {},
    signal,
  );
  return (
    response.status === "rejected" &&
    response.error.error.code === "INVALID_REQUEST"
  );
}

/** Staged demo: texts this number about the deal's future confirmed events. */
export async function subscribeToDealTexts(
  dealId: string,
  phoneNumber: string,
  signal?: AbortSignal,
): Promise<TextAlertsOutcome> {
  const body: DealSmsSubscriptionRequest = { phoneNumber, consent: true };
  const response = await postJson(
    `/api/deals/${encodeURIComponent(dealId)}/sms-subscriptions`,
    body,
    signal,
  );
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return { status: "rejected", message: response.error.error.message };
  }
  return {
    status: "subscribed",
    subscription: response.body as DealSmsSubscription,
  };
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
