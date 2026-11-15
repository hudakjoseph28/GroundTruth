import {
  DEAL_STATES,
  type Deal,
  type DealState,
  type Hold,
  type Reviewer,
  type ReviewerRole,
  type TimelineEvent,
  type TimelineEventType,
} from "@groundtruth/shared";

// Keyed records make the compiler flag any contract value missing here.
const REVIEWER_ROLES = Object.keys({
  title: true,
  survey: true,
  septic: true,
} satisfies Record<ReviewerRole, true>) as ReviewerRole[];

const HOLD_REASONS = Object.keys({
  SELLER_IDENTITY_DISPUTED: true,
  TITLE_EXCEPTION: true,
  SITE_REVIEW_FAILED: true,
  OTHER: true,
} satisfies Record<Hold["reasonCode"], true>) as Hold["reasonCode"][];

const TIMELINE_EVENT_TYPES = Object.keys({
  dealCreated: true,
  funded: true,
  evidenceReceived: true,
  approvalSigned: true,
  holdPlaced: true,
  releaseRejected: true,
  released: true,
  refunded: true,
} satisfies Record<TimelineEventType, true>) as TimelineEventType[];

const CONFIRMATION_STATUSES = Object.keys({
  offChainEvidence: true,
  confirmed: true,
} satisfies Record<
  TimelineEvent["confirmationStatus"],
  true
>) as TimelineEvent["confirmationStatus"][];

const DEVNET_USDC_MINT: Deal["mint"] =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export interface StoredReviewer {
  position: number;
  wallet: string;
  role: string;
  required: boolean;
  approvedAt: Date | null;
  approvalTransaction: string | null;
}

export interface StoredHold {
  placedByWallet: string;
  role: string;
  reasonCode: string;
  buyerMessage: string;
  transactionSignature: string;
  placedAt: Date;
}

export interface StoredTimelineEvent {
  id: string;
  at: Date;
  type: string;
  actorRole: string | null;
  buyerMessage: string;
  transactionSignature: string | null;
  confirmationStatus: string;
}

export interface StoredDeal {
  id: string;
  parcelKey: string;
  buyerWallet: string;
  sellerWallet: string;
  sellerTokenAccount: string;
  amountBaseUnits: string;
  mint: string;
  cluster: string;
  state: string;
  escrowAddress: string | null;
  reviewers: StoredReviewer[];
  hold: StoredHold | null;
  /** Already in contract order; see routes/deals.ts. */
  timelineEvents: StoredTimelineEvent[];
}

export function toDeal(row: StoredDeal): Deal {
  const state = parseOne(DEAL_STATES, row.state, "deal state");
  if (state === "held" && !row.hold) {
    throw new Error("Stored held deal is missing its hold");
  }
  if (!/^[0-9]+$/.test(row.amountBaseUnits)) {
    throw new Error("Stored amount is not a base-unit integer");
  }
  if (row.mint !== DEVNET_USDC_MINT) {
    throw new Error("Stored mint is not the devnet test USDC mint");
  }
  if (row.cluster !== "devnet") {
    throw new Error("Stored cluster is not devnet");
  }

  return {
    id: row.id,
    parcelKey: row.parcelKey,
    buyerWallet: row.buyerWallet,
    sellerWallet: row.sellerWallet,
    sellerTokenAccount: row.sellerTokenAccount,
    reviewers: [...row.reviewers]
      .sort((left, right) => left.position - right.position)
      .map(toReviewer),
    amountBaseUnits: row.amountBaseUnits,
    mint: DEVNET_USDC_MINT,
    cluster: "devnet",
    state: state satisfies DealState,
    escrowAddress: row.escrowAddress ?? undefined,
    hold: row.hold ? toHold(row.hold) : undefined,
    timeline: row.timelineEvents.map(toTimelineEvent),
  };
}

function toReviewer(row: StoredReviewer): Reviewer {
  if ((row.approvedAt === null) !== (row.approvalTransaction === null)) {
    throw new Error("Stored approval is missing its time or transaction");
  }
  return {
    wallet: row.wallet,
    role: parseOne(REVIEWER_ROLES, row.role, "reviewer role"),
    required: row.required,
    approvedAt: row.approvedAt?.toISOString(),
    approvalTransaction: row.approvalTransaction ?? undefined,
  };
}

function toHold(row: StoredHold): Hold {
  return {
    placedByWallet: row.placedByWallet,
    role: parseOne(REVIEWER_ROLES, row.role, "hold role"),
    reasonCode: parseOne(HOLD_REASONS, row.reasonCode, "hold reason"),
    buyerMessage: row.buyerMessage,
    transactionSignature: row.transactionSignature,
    placedAt: row.placedAt.toISOString(),
  };
}

function toTimelineEvent(row: StoredTimelineEvent): TimelineEvent {
  const confirmationStatus = parseOne(
    CONFIRMATION_STATUSES,
    row.confirmationStatus,
    "confirmation status",
  );
  if (confirmationStatus === "confirmed" && !row.transactionSignature) {
    throw new Error("Stored confirmed event is missing its transaction");
  }
  return {
    id: row.id,
    at: row.at.toISOString(),
    type: parseOne(TIMELINE_EVENT_TYPES, row.type, "timeline event type"),
    actorRole: row.actorRole ?? undefined,
    buyerMessage: row.buyerMessage,
    transactionSignature: row.transactionSignature ?? undefined,
    confirmationStatus,
  };
}

function parseOne<T extends string>(
  allowed: readonly T[],
  value: string,
  label: string,
): T {
  const found = allowed.find((item) => item === value);
  if (!found) throw new Error(`Stored ${label} is outside the contract`);
  return found;
}
