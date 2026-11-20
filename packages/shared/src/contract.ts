/** Polygon and MultiPolygon shapes named by the v1 contract. Defined here so the package has no GeoJSON dependency. */
export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export interface ApiError {
  error: {
    code:
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "NO_COVERAGE"
      | "PROVIDER_TIMEOUT"
      | "FORBIDDEN"
      | "CONFLICT"
      | "PENDING_CONFIRMATION"
      | "INTERNAL_ERROR";
    message: string;
    requestId: string;
    retryable: boolean;
    details?: Record<string, string>;
  };
}

export type ParcelKey = string;

export interface Parcel {
  key: ParcelKey;
  sourceParcelId: string;
  county: string;
  countyFips: string;
  township?: string;
  siteAddress?: string;
  acreage?: number;
  /**
   * Area of the OGRIP boundary in acres. A map measurement, never a recorded
   * or legal acreage; show it labeled as mapped.
   */
  mappedAcreage?: number;
  centroid: { latitude: number; longitude: number };
  geometry: {
    geojson: GeoJsonPolygon | GeoJsonMultiPolygon;
    authority: "Ohio OGRIP";
    sourceUrl: string;
    retrievedAt: string;
  };
}

export interface ParcelSearchResult {
  parcel: Omit<Parcel, "geometry">;
  matchedOn: "siteAddress" | "parcelId";
}

/** One parcel drawn on the explore map: its summary and published outline. */
export type ParcelOutline = Omit<Parcel, "geometry"> & {
  outline: GeoJsonPolygon | GeoJsonMultiPolygon;
};

/**
 * The parcels whose published boundaries touch one map box, from
 * `GET /api/parcels/area?bbox=`. `truncated` means OGRIP holds more parcels
 * there than one answer carries: the map shows these and asks to zoom in.
 */
export interface ParcelArea {
  /** `[west, south, east, north]` in WGS84 degrees, as asked. */
  bbox: [number, number, number, number];
  parcels: ParcelOutline[];
  truncated: boolean;
  authority: "Ohio OGRIP";
  sourceUrl: string;
  retrievedAt: string;
}

export const CHECK_KINDS = [
  "zoning",
  "flood",
  // Wetlands (National Wetlands Inventory) and, in Franklin County, stream
  // setbacks. Added Nov 18, 2026; additive, so the v1 shapes are unchanged.
  "environmental",
  "access",
  "utilities",
  "easements",
  "sellerAuthority",
  "survey",
  "septic",
  "closing",
] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

export const CHECK_STATUSES = [
  "evidenceFound",
  "needsReview",
  "unknown",
  "signedOff",
  "held",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];

export interface Source {
  authority: string;
  title: string;
  url: string;
  retrievedAt: string;
  effectiveDate?: string;
}

export interface ResponsibleParty {
  role: string;
  organization?: string;
  publicContactUrl?: string;
}

export interface Check {
  kind: CheckKind;
  status: CheckStatus;
  finding: string;
  limitation: string;
  sources: Source[];
  responsibleParty: ResponsibleParty;
  nextAction: string;
  reviewerWallet?: string;
  transactionSignature?: string;
}

export interface ParcelReport {
  parcelKey: ParcelKey;
  generatedAt: string;
  coverage: "deep" | "partial" | "boundaryOnly";
  biggestOpenQuestion: CheckKind;
  checks: Check[];
}

export type ReviewerRole = "title" | "survey" | "septic";

export const DEAL_STATES = [
  "draft",
  "funded",
  "held",
  "released",
  "refunded",
] as const;

export type DealState = (typeof DEAL_STATES)[number];

export interface Reviewer {
  wallet: string;
  role: ReviewerRole;
  required: boolean;
  approvedAt?: string;
  approvalTransaction?: string;
}

export interface Hold {
  placedByWallet: string;
  role: ReviewerRole;
  reasonCode:
    | "SELLER_IDENTITY_DISPUTED"
    | "TITLE_EXCEPTION"
    | "SITE_REVIEW_FAILED"
    | "OTHER";
  buyerMessage: string;
  transactionSignature: string;
  placedAt: string;
}

export type TimelineEventType =
  | "dealCreated"
  | "funded"
  | "evidenceReceived"
  | "approvalSigned"
  | "holdPlaced"
  | "releaseRejected"
  | "released"
  | "refunded";

export interface TimelineEvent {
  id: string;
  at: string;
  type: TimelineEventType;
  actorRole?: string;
  buyerMessage: string;
  transactionSignature?: string;
  confirmationStatus: "offChainEvidence" | "confirmed";
  /**
   * Additive (2026-11-19). On a confirmed `approvalSigned` row whose
   * transaction carried a `groundtruth:doc:<sha256>` Memo instruction: the
   * document the reviewer relied on.
   */
  citedDocument?: DocumentCitation;
}

// ---------- Deal documents (additive, 2026-11-19) ----------

export const DEAL_DOCUMENT_TYPES = [
  "titleCommitment",
  "surveyPlat",
  "septicSoilEvaluation",
  "zoningLetter",
  "other",
] as const;

export type DealDocumentType = (typeof DEAL_DOCUMENT_TYPES)[number];

export const DEAL_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type DealDocumentContentType =
  (typeof DEAL_DOCUMENT_CONTENT_TYPES)[number];

/** Largest file the API stores: 10 MB. */
export const DEAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Who uploaded a document: a wallet bound to the deal in one of these roles. */
export type DealParticipantRole = "buyer" | "seller" | ReviewerRole;

/**
 * Public metadata for one document a deal participant uploaded. The file
 * itself is never part of this object; reading it needs a fresh wallet
 * signature from a participant on the deal.
 */
export interface DealDocument {
  id: string;
  dealId: string;
  type: DealDocumentType;
  filename: string;
  /** Detected from the file's own bytes, not its extension. */
  contentType: DealDocumentContentType;
  sizeBytes: number;
  /** SHA-256 of the stored bytes, lowercase hex, computed by the API. */
  sha256: string;
  uploaderRole: DealParticipantRole;
  uploadedAt: string;
  /**
   * Whether the parcel ID printed in the document is this deal's parcel
   * (additive, 2026-11-20). Advisory only: it never blocks or changes deal
   * state. Public: the status alone, never the text the API read.
   */
  parcelCheck?: DocumentParcelCheck;
}

/**
 * - `checking`: the API is reading the document.
 * - `matches`: the document names this deal's parcel ID.
 * - `different`: the document names another parcel ID.
 * - `noParcelId`: no parcel ID was found in the document.
 * - `unavailable`: the document was not read (check off, failed, or
 *   uploaded before the check existed). Never a finding either way.
 */
export const DOCUMENT_PARCEL_CHECK_STATUSES = [
  "checking",
  "matches",
  "different",
  "noParcelId",
  "unavailable",
] as const;

export type DocumentParcelCheckStatus =
  (typeof DOCUMENT_PARCEL_CHECK_STATUSES)[number];

export interface DocumentParcelCheck {
  status: DocumentParcelCheckStatus;
  /** When the API finished reading the document; absent while checking or unread. */
  checkedAt?: string;
}

/**
 * What the API read from one document, for a deal participant only
 * (a fresh wallet signature). Machine-read and advisory: a reviewer still
 * reads the document and signs the decision.
 */
export interface DocumentFindings {
  documentId: string;
  parcelCheck: DocumentParcelCheck;
  /** The parcel ID the deal is for, as the parcel key holds it. */
  dealParcelId: string;
  /** Absent unless the document was read. */
  found?: {
    /** As printed in the document; null when none was found. */
    parcelId: string | null;
    /** The property's address as printed; null when none was found. */
    address: string | null;
    /** What the document says it is, e.g. "Septic system soil evaluation". */
    documentType: string;
    /** One line: the document's main finding in its own terms. */
    keyFinding: string;
  };
  /** The model that read the document. */
  model?: string;
}

/** A document hash an approval transaction committed to on-chain. */
export interface DocumentCitation {
  /** Read from the confirmed transaction's Memo instruction. */
  sha256: string;
  /** The deal's document with exactly this hash; absent when none matches. */
  document?: Pick<DealDocument, "id" | "type" | "filename" | "uploaderRole">;
}

export interface Deal {
  id: string;
  parcelKey: ParcelKey;
  buyerWallet: string;
  sellerWallet: string;
  sellerTokenAccount: string;
  reviewers: Reviewer[];
  // Integer token base units as a decimal string so USDC precision survives and the UI, vault, and recipient balances compare exactly.
  amountBaseUnits: string;
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  cluster: "devnet";
  state: DealState;
  escrowAddress?: string;
  hold?: Hold;
  timeline: TimelineEvent[];
}

/**
 * Additive (2026-11-19). One confirmed program event from a public staged
 * deal, newest first in `GET /api/activity`. Built from the same confirmed
 * timeline rows a deal's timeline serves; off-chain rows are never included.
 */
export interface ActivityEvent {
  /** The timeline row's ID: `<transactionSignature>:<eventIndex>`. */
  id: string;
  dealId: string;
  /** The deal's agreed amount, integer test USDC base units. */
  dealAmountBaseUnits: string;
  /** Block time. */
  at: string;
  type: TimelineEventType;
  actorRole?: string;
  buyerMessage: string;
  transactionSignature: string;
  confirmationStatus: "confirmed";
}

/**
 * Staged-demo text alerts for one deal: `POST /api/deals/:id/sms-subscriptions`.
 * The number is stored for that deal only and is never returned unmasked.
 */
export interface DealSmsSubscriptionRequest {
  phoneNumber: string;
  /** The visitor ticked the staged-demo consent box. */
  consent: true;
}

export interface DealSmsSubscription {
  dealId: string;
  /** Only the last four digits, e.g. "+1 ••• ••• 0123". */
  maskedPhoneNumber: string;
}

export interface Coverage {
  county: string;
  countyFips: string;
  boundarySearchable: boolean;
  evidenceKinds: CheckKind[];
  lastVerifiedAt: string;
}
