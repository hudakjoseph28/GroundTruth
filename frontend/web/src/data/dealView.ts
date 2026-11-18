import type {
  Deal,
  DealState,
  ReviewerRole,
  TimelineEvent,
  TimelineEventType,
} from "@groundtruth/shared";
import {
  HOLD_REASONS,
  ROLE_LABELS,
  TIMELINE,
  VERDICT,
} from "../content/deal";
import { formatUsdc } from "./ledger";

// The deal page's view model: plain values worked out from the API's Deal
// and timeline. It never invents state. A reviewer is "signed" only when the
// deal carries their approval, and a row links to Explorer only when the API
// marked it confirmed and gave its signature.

/** gold = waiting, red = held or blocked, green = signed or paid, quiet = closed or neutral. */
export type Tone = "pending" | "held" | "released" | "quiet";

export type ReviewerStatus = "signed" | "held" | "waiting" | "notSigned";

export interface ReviewerView {
  role: ReviewerRole;
  wallet: string;
  status: ReviewerStatus;
  /** When they signed or placed the hold. */
  at?: string;
  signature?: string;
}

export interface HoldView {
  /** True only while the deal is held. A deal refunded under a hold keeps the record. */
  active: boolean;
  role: ReviewerRole;
  reason: string;
  message: string;
  at: string;
  signature: string;
}

export interface DealView {
  id: string;
  state: DealState;
  tone: Tone;
  /** Whole and fractional token units, for example "25" or "25.5". */
  amount: string;
  headline: string;
  /** One sentence: why the funds can or cannot move. */
  message: string;
  /** One owner and one action. */
  next: string;
  signed: number;
  required: number;
  reviewers: ReviewerView[];
  hold: HoldView | null;
  parcelKey: string;
  /** The county's own parcel ID, the last part of the parcel key. */
  parcelId: string;
  escrowAddress?: string;
}

const ROLE_ORDER: readonly ReviewerRole[] = ["title", "survey", "septic"];

const TONES: Record<DealState, Tone> = {
  draft: "quiet",
  funded: "pending",
  held: "held",
  released: "released",
  refunded: "quiet",
};

/** A deal that can no longer change. */
function closed(state: DealState): boolean {
  return state === "released" || state === "refunded";
}

export function viewDeal(deal: Deal): DealView {
  const amount = formatUsdc(deal.amountBaseUnits);
  const hold = deal.hold;
  const reviewers = [...deal.reviewers]
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((reviewer): ReviewerView => {
      const base = { role: reviewer.role, wallet: reviewer.wallet };
      if (reviewer.approvedAt) {
        return {
          ...base,
          status: "signed",
          at: reviewer.approvedAt,
          signature: reviewer.approvalTransaction,
        };
      }
      if (hold && hold.placedByWallet === reviewer.wallet) {
        return {
          ...base,
          status: "held",
          at: hold.placedAt,
          signature: hold.transactionSignature,
        };
      }
      return { ...base, status: closed(deal.state) ? "notSigned" : "waiting" };
    });

  const required = deal.reviewers.filter((reviewer) => reviewer.required);
  const waiting = required.filter((reviewer) => !reviewer.approvedAt);
  const signed = required.length - waiting.length;

  return {
    id: deal.id,
    state: deal.state,
    tone: TONES[deal.state],
    amount,
    ...verdict(deal, amount, waiting.map((reviewer) => reviewer.role)),
    signed,
    required: required.length,
    reviewers,
    hold: hold
      ? {
          active: deal.state === "held",
          role: hold.role,
          reason: HOLD_REASONS[hold.reasonCode],
          message: hold.buyerMessage,
          at: hold.placedAt,
          signature: hold.transactionSignature,
        }
      : null,
    parcelKey: deal.parcelKey,
    parcelId: deal.parcelKey.split(":").slice(2).join(":") || deal.parcelKey,
    escrowAddress: deal.escrowAddress,
  };
}

function verdict(
  deal: Deal,
  amount: string,
  waiting: readonly ReviewerRole[],
): Pick<DealView, "headline" | "message" | "next"> {
  switch (deal.state) {
    case "draft":
      return VERDICT.draft;
    case "funded":
      return waiting.length > 0
        ? {
            headline: VERDICT.waiting.headline(waiting.length),
            message: VERDICT.waiting.message(waiting.length),
            next: VERDICT.waiting.next(
              [...waiting].sort(
                (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
              ),
            ),
          }
        : VERDICT.ready;
    case "held":
      return {
        headline: deal.hold
          ? VERDICT.held.headline(HOLD_REASONS[deal.hold.reasonCode])
          : VERDICT.held.headlineUnknown,
        message: VERDICT.held.message(deal.hold?.role),
        next: VERDICT.held.next(deal.hold?.role),
      };
    case "released":
      return {
        headline: VERDICT.released.headline,
        message: VERDICT.released.message(amount),
        next: VERDICT.released.next,
      };
    case "refunded":
      return {
        headline: VERDICT.refunded.headline,
        message: VERDICT.refunded.message(amount, Boolean(deal.hold)),
        next: VERDICT.refunded.next,
      };
  }
}

export interface TimelineRow {
  id: string;
  at: string;
  label: string;
  actor: string | null;
  message: string;
  tone: Tone;
  /** A release the program rejected: nothing moved. */
  blocked: boolean;
  confirmed: boolean;
  /** Present only on confirmed rows that carry a signature. */
  signature?: string;
}

const ROW_TONES: Record<TimelineEventType, Tone> = {
  dealCreated: "quiet",
  funded: "pending",
  evidenceReceived: "quiet",
  approvalSigned: "released",
  holdPlaced: "held",
  releaseRejected: "held",
  released: "released",
  refunded: "quiet",
};

function actorLabel(actorRole: string | undefined): string | null {
  if (!actorRole) return null;
  if (actorRole in ROLE_LABELS) {
    return `${ROLE_LABELS[actorRole as ReviewerRole]} reviewer`;
  }
  return actorRole.charAt(0).toUpperCase() + actorRole.slice(1);
}

/** The timeline as the page lists it: newest first. The API sends it oldest first. */
export function viewTimeline(timeline: readonly TimelineEvent[]): TimelineRow[] {
  return timeline
    .map((event): TimelineRow => {
      const confirmed = event.confirmationStatus === "confirmed";
      return {
        id: event.id,
        at: event.at,
        label: TIMELINE.types[event.type],
        actor: actorLabel(event.actorRole),
        message: event.buyerMessage,
        tone: ROW_TONES[event.type],
        blocked: event.type === "releaseRejected",
        confirmed,
        signature: confirmed ? event.transactionSignature : undefined,
      };
    })
    .reverse();
}

const TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/** "Nov 18, 12:46:50 PM EST" in the visitor's own time zone. */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : TIME.format(date);
}

/** "12:46:50 PM", for the page's own "updated" clock. */
export function formatClock(date: Date): string {
  return CLOCK.format(date);
}
