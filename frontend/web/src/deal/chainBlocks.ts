import type { Deal, ReviewerRole, TimelineEvent, TimelineEventType } from "@groundtruth/shared";

/** One step on a closing. An outline is what is still ahead, not an event. */
export interface ChainBlock {
  id: string;
  label: string;
  at: string;
  signature?: string;
  tone: "pending" | "held" | "released" | "quiet";
  mark: "none" | "check" | "lock" | "blocked" | "refund" | "coin";
  /** Dashed future step. No time and no signature, because nothing is confirmed. */
  outline?: boolean;
  /** The next step that can still happen. */
  pulse?: boolean;
  /** The closing's last confirmed step. */
  hero?: boolean;
}

const LABELS: Record<TimelineEventType, string> = {
  dealCreated: "Created",
  funded: "Funded",
  evidenceReceived: "Callback",
  approvalSigned: "Signed",
  holdPlaced: "Hold",
  releaseRejected: "Release blocked",
  released: "Released",
  refunded: "Refunded",
};

const TONES: Record<TimelineEventType, ChainBlock["tone"]> = {
  dealCreated: "quiet",
  funded: "pending",
  evidenceReceived: "quiet",
  approvalSigned: "released",
  holdPlaced: "held",
  releaseRejected: "held",
  released: "released",
  refunded: "held",
};

const MARKS: Record<TimelineEventType, ChainBlock["mark"]> = {
  dealCreated: "none",
  funded: "coin",
  evidenceReceived: "none",
  approvalSigned: "check",
  holdPlaced: "lock",
  releaseRejected: "blocked",
  released: "coin",
  refunded: "refund",
};

const ROLE_ORDER: readonly ReviewerRole[] = ["title", "survey", "septic"];

const ROLE_LABEL: Record<ReviewerRole, string> = {
  title: "Title",
  survey: "Survey",
  septic: "Septic",
};

/** Confirmed timeline rows only, in the order they happened. */
export function chainBlocks(events: readonly TimelineEvent[]): ChainBlock[] {
  const blocks = events
    .filter((event) => event.confirmationStatus === "confirmed")
    .map((event): ChainBlock => ({
      id: event.id,
      label:
        event.type === "approvalSigned" && event.actorRole && event.actorRole in ROLE_LABEL
          ? ROLE_LABEL[event.actorRole as ReviewerRole]
          : LABELS[event.type],
      at: event.at,
      signature: event.transactionSignature,
      tone: TONES[event.type],
      mark: MARKS[event.type],
    }));
  const last = blocks[blocks.length - 1];
  if (last && (last.label === "Released" || last.label === "Refunded")) last.hero = true;
  return blocks;
}

/**
 * Steps this deal has not reached. Only while it is still open.
 * A closed, held, or refunded deal does not grow imaginary future blocks.
 */
export function pendingOutlines(deal: Deal): ChainBlock[] {
  if (deal.state !== "draft" && deal.state !== "funded") return [];
  const waiting = ROLE_ORDER.filter((role) =>
    deal.reviewers.some((reviewer) => reviewer.required && reviewer.role === role && !reviewer.approvedAt),
  );
  const outlines: ChainBlock[] = waiting.map((role) => ({
    id: `outline-${deal.id}-${role}`,
    label: ROLE_LABEL[role],
    at: "",
    tone: "pending",
    mark: "none",
    outline: true,
  }));
  outlines.push({
    id: `outline-${deal.id}-release`,
    label: "Release",
    at: "",
    tone: "pending",
    mark: "none",
    outline: true,
  });
  const next = outlines[0];
  if (next) next.pulse = true;
  return outlines;
}
