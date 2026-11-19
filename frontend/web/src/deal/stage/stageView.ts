import type { Deal, ReviewerRole, TimelineEvent } from "@groundtruth/shared";
import type { ReviewerStatus, ReviewerView } from "../../data/dealView";

// Stage mode's view model, on top of dealView. It adds two things the normal
// page does not need: which reviewer badges changed since the last poll, so
// they can light up once, and the payout moment, which exists only when the
// API reports the deal released.

/** A badge lights up when it reaches one of these while the page is open. */
const ARRIVING: ReadonlySet<ReviewerStatus> = new Set(["signed", "held"]);

/**
 * Roles whose status moved to signed or held between two reads of the deal.
 * The first read has nothing before it, so nothing on it counts as arriving.
 */
export function arrivedRoles(
  before: readonly ReviewerView[] | null,
  after: readonly ReviewerView[],
): ReviewerRole[] {
  if (!before) return [];
  const previous = new Map(
    before.map((reviewer) => [reviewer.role, reviewer.status]),
  );
  return after
    .filter(
      (reviewer) =>
        ARRIVING.has(reviewer.status) &&
        previous.get(reviewer.role) !== reviewer.status,
    )
    .map((reviewer) => reviewer.role);
}

export interface Payout {
  /** Whole and fractional token units, for example "10". */
  amount: string;
  /** The confirmed release transaction, when the timeline carries it. */
  signature?: string;
}

/**
 * The payout to show on stage: only for a released deal, and the Explorer
 * link only from a confirmed `released` row's own signature.
 */
export function payoutOf(
  deal: Pick<Deal, "state">,
  amount: string,
  timeline: readonly TimelineEvent[],
): Payout | null {
  if (deal.state !== "released") return null;
  const release = [...timeline]
    .reverse()
    .find(
      (event) =>
        event.type === "released" &&
        event.confirmationStatus === "confirmed" &&
        event.transactionSignature,
    );
  return release?.transactionSignature
    ? { amount, signature: release.transactionSignature }
    : { amount };
}

/** Is this URL asking for stage mode? `?stage=1` (also `true` or bare `?stage`). */
export function wantsStage(search: URLSearchParams): boolean {
  const value = search.get("stage");
  return value !== null && value !== "0" && value !== "false";
}
