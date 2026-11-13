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

export const CHECK_KINDS = [
  "zoning",
  "flood",
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

export interface Coverage {
  county: string;
  countyFips: string;
  boundarySearchable: boolean;
  evidenceKinds: CheckKind[];
  lastVerifiedAt: string;
}
