import {
  type ActivityEvent,
  DEAL_DOCUMENT_TYPES,
  DEAL_STATES,
  type Deal,
  type DealDocument,
  type DealParticipantRole,
  type DocumentCitation,
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

const PARTICIPANT_ROLES = Object.keys({
  buyer: true,
  seller: true,
  title: true,
  survey: true,
  septic: true,
} satisfies Record<DealParticipantRole, true>) as DealParticipantRole[];

const DOCUMENT_CONTENT_TYPES = Object.keys({
  "application/pdf": true,
  "image/png": true,
  "image/jpeg": true,
} satisfies Record<
  DealDocument["contentType"],
  true
>) as DealDocument["contentType"][];

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
  /** Hash from an approval transaction's document memo, if any. */
  citedDocumentSha256?: string | null;
}

/** A deal document's public fields, as cited by an approval. */
export interface StoredDocumentRef {
  id: string;
  type: string;
  filename: string;
  sha256: string;
  uploaderRole: string;
}

export interface StoredDealDocument extends StoredDocumentRef {
  dealId: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
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
  /** The deal's documents, to resolve approval citations. */
  documents?: StoredDocumentRef[];
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
    timeline: row.timelineEvents.map((event) =>
      toTimelineEvent(event, row.documents ?? []),
    ),
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

function toTimelineEvent(
  row: StoredTimelineEvent,
  documents: StoredDocumentRef[],
): TimelineEvent {
  const confirmationStatus = parseOne(
    CONFIRMATION_STATUSES,
    row.confirmationStatus,
    "confirmation status",
  );
  if (confirmationStatus === "confirmed" && !row.transactionSignature) {
    throw new Error("Stored confirmed event is missing its transaction");
  }
  const citedDocument = row.citedDocumentSha256
    ? toCitation(row.citedDocumentSha256, documents)
    : undefined;
  return {
    id: row.id,
    at: row.at.toISOString(),
    type: parseOne(TIMELINE_EVENT_TYPES, row.type, "timeline event type"),
    actorRole: row.actorRole ?? undefined,
    buyerMessage: citedDocument
      ? citationMessage(row.buyerMessage, citedDocument)
      : row.buyerMessage,
    transactionSignature: row.transactionSignature ?? undefined,
    confirmationStatus,
    ...(citedDocument ? { citedDocument } : {}),
  };
}

/** The deal's document with exactly the hash the memo named, if any. */
function toCitation(
  sha256: string,
  documents: StoredDocumentRef[],
): DocumentCitation {
  const match = documents.find((document) => document.sha256 === sha256);
  return match
    ? {
        sha256,
        document: {
          id: match.id,
          type: parseOne(DEAL_DOCUMENT_TYPES, match.type, "document type"),
          filename: match.filename,
          uploaderRole: parseOne(
            PARTICIPANT_ROLES,
            match.uploaderRole,
            "uploader role",
          ),
        },
      }
    : { sha256 };
}

/**
 * "The septic reviewer signed their approval, relying on “Septic
 * evaluation.pdf” (hash on-chain)." The stored message is the projection's
 * own; the document part is added when the deal is read, so a document
 * uploaded after the approval is still matched by its hash.
 */
function citationMessage(base: string, citation: DocumentCitation): string {
  const sentence = base.replace(/\.$/, "");
  return citation.document
    ? `${sentence}, relying on “${citation.document.filename}” (hash on-chain).`
    : `${sentence}, citing document hash ${citation.sha256.slice(0, 12)}… on-chain. No document on this deal has that hash.`;
}

/** A confirmed timeline row with the public fields of its deal. */
export interface StoredActivityRow extends StoredTimelineEvent {
  deal: { id: string; amountBaseUnits: string };
}

/**
 * One row of `GET /api/activity`. Only a confirmed chain row with its
 * transaction becomes activity; anything else is a query or data error.
 */
export function toActivityEvent(row: StoredActivityRow): ActivityEvent {
  if (row.confirmationStatus !== "confirmed" || !row.transactionSignature) {
    throw new Error("Activity row is not a confirmed chain event");
  }
  if (!/^[0-9]+$/.test(row.deal.amountBaseUnits)) {
    throw new Error("Stored amount is not a base-unit integer");
  }
  return {
    id: row.id,
    dealId: row.deal.id,
    dealAmountBaseUnits: row.deal.amountBaseUnits,
    at: row.at.toISOString(),
    type: parseOne(TIMELINE_EVENT_TYPES, row.type, "timeline event type"),
    actorRole: row.actorRole ?? undefined,
    buyerMessage: row.buyerMessage,
    transactionSignature: row.transactionSignature,
    confirmationStatus: "confirmed",
  };
}

export function toDealDocument(row: StoredDealDocument): DealDocument {
  return {
    id: row.id,
    dealId: row.dealId,
    type: parseOne(DEAL_DOCUMENT_TYPES, row.type, "document type"),
    filename: row.filename,
    contentType: parseOne(
      DOCUMENT_CONTENT_TYPES,
      row.contentType,
      "document content type",
    ),
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploaderRole: parseOne(
      PARTICIPANT_ROLES,
      row.uploaderRole,
      "uploader role",
    ),
    uploadedAt: row.uploadedAt.toISOString(),
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
