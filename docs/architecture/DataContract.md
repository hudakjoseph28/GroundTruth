# GroundTruth · Data contract (v1)

**Accepted Nov 12, 2026.** UI, API, report adapters, Stream consumer, and escrow client build against these names and rules. The scaffold implements the schemas in `packages/shared`; once that code exists, this document explains the contract and the checked-in schemas validate it.

IDs are strings. Times are UTC ISO 8601 strings. Token amounts are integer base units encoded as decimal strings: `"25000000"` means 25 USDC at six decimals. Public parcel objects never contain owner mailing addresses, phone numbers, identity documents, or raw provider payloads.

## Shared TypeScript model

```ts
// ---------- Common ----------
export interface ApiError {
  error: {
    code:
      | "INVALID_REQUEST" | "NOT_FOUND" | "NO_COVERAGE"
      | "PROVIDER_TIMEOUT" | "FORBIDDEN" | "CONFLICT"
      | "PENDING_CONFIRMATION" | "INTERNAL_ERROR";
    message: string;       // safe, buyer-readable summary
    requestId: string;
    retryable: boolean;
    details?: Record<string, string>; // allowlisted; never raw provider data
  };
}

// ---------- Parcels ----------
export type ParcelKey = string; // `ohio:${countyFips}:${sourceParcelId}`

export interface Parcel {
  key: ParcelKey;
  sourceParcelId: string;
  county: string;
  countyFips: string;
  township?: string;
  siteAddress?: string;     // physical site address only
  acreage?: number;
  centroid: { latitude: number; longitude: number };
  geometry: {
    geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    authority: "Ohio OGRIP";
    sourceUrl: string;
    retrievedAt: string;
  };
}

export interface ParcelSearchResult {
  parcel: Omit<Parcel, "geometry">;
  matchedOn: "siteAddress" | "parcelId";
}

export type CheckKind =
  | "zoning" | "flood" | "access" | "utilities"
  | "easements" | "sellerAuthority" | "survey"
  | "septic" | "closing";

export type CheckStatus =
  | "evidenceFound"   // a source supports the stated fact; not a professional approval
  | "needsReview"     // evidence exists, but a qualified decision remains
  | "unknown"         // missing, conflicting, timed out, or uncovered
  | "signedOff"       // assigned reviewer signed the scope
  | "held";           // assigned reviewer placed a blocking hold

export interface Source {
  authority: string;
  title: string;
  url: string;
  retrievedAt: string;
  effectiveDate?: string;
}

export interface ResponsibleParty {
  role: string;            // e.g. `Title reviewer`, `Township zoning office`
  organization?: string;
  publicContactUrl?: string;
}

export interface Check {
  kind: CheckKind;
  status: CheckStatus;
  finding: string;         // what the supplied evidence supports
  limitation: string;      // what it does not establish
  sources: Source[];       // empty only when status is `unknown`
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

// ---------- Deals ----------
export type ReviewerRole = "title" | "survey" | "septic";
export type DealState = "draft" | "funded" | "held" | "released" | "refunded";

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
  reasonCode: "SELLER_IDENTITY_DISPUTED" | "TITLE_EXCEPTION" | "SITE_REVIEW_FAILED" | "OTHER";
  buyerMessage: string;
  transactionSignature: string;
  placedAt: string;
}

export type TimelineEventType =
  | "dealCreated" | "funded" | "evidenceReceived"
  | "approvalSigned" | "holdPlaced" | "releaseRejected"
  | "released" | "refunded";

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
  amountBaseUnits: string;
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  cluster: "devnet";
  state: DealState;
  escrowAddress?: string;
  hold?: Hold;
  timeline: TimelineEvent[];
}
```

`Deal.state` is a projection of the confirmed program account and transactions. The browser never sets it. The API may show `PENDING_CONFIRMATION` while waiting, but it does not optimistically label a deal held, released, or refunded.

## HTTP API v1

All responses are JSON. Success returns the named object directly. Failure returns `ApiError` with the matching HTTP status. `requestId` is also set in the `x-request-id` response header.

| Method and route | Success | Contract |
| --- | --- | --- |
| `GET /api/health` | `200 { status: "ok", commit: string }` | No dependency details or secrets. |
| `GET /api/parcels/search?q=` | `200 ParcelSearchResult[]` | Address or source parcel ID; trimmed query length 3–120. `[]` means valid query with no match. `NO_COVERAGE` means outside the supported source. |
| `GET /api/parcels/:parcelKey` | `200 Parcel` | Key is URL encoded. Returns the published boundary and retrieval metadata. |
| `GET /api/parcels/:parcelKey/report` | `200 ParcelReport` | Each adapter resolves independently. A timeout yields an `unknown` check inside a successful partial report. |
| `GET /api/coverage` | `200 Coverage[]` | Each row: county, boundary searchable, evidence kinds, last verified time. No marketing totals without measured data. |
| `GET /api/deals/:id` | `200 Deal` | Public only for the two staged, non-sensitive demo deals. Unknown/non-demo deals return `404`. |
| `GET /api/deals/:id/timeline` | `200 TimelineEvent[]` | Stable ascending order by chain slot/event index, then off-chain timestamp. |
| `POST /api/deals/:id/evidence/owner-call` | `201 TimelineEvent` | Internal service use after a verified ElevenLabs webhook; never callable by the public browser. |
| `POST /api/webhooks/quicknode` | `204` | Verify HMAC/raw body, dedupe by signature + event index, write confirmed program events. |
| `POST /api/webhooks/elevenlabs` | `204` | Verify signature/raw body, dedupe by conversation ID, store minimum staged call outcome. |

`Coverage` has this shape:

```ts
export interface Coverage {
  county: string;
  countyFips: string;
  boundarySearchable: boolean;
  evidenceKinds: CheckKind[];
  lastVerifiedAt: string;
}
```

Wallets build and sign program transactions client-side from the checked-in IDL. There is no API route that signs an approval, hold, release, or refund on behalf of a participant.

## Provider normalization

- **OGRIP:** the backend adapter accepts current Ohio field names and emits `Parcel`. The globally unique key includes state, county FIPS, and published parcel ID; a county-local ID alone is never a database key.
- **FEMA/local records:** every adapter returns `found`, `missing`, `timeout`, or `conflict`. Only `found` may produce `evidenceFound`; every other outcome becomes `unknown` with an explicit limitation and next action.
- **ElevenLabs:** only `conversation_id`, completion time, staged deal ID, consenting demo participant label, call success, and the configured analysis outcome are retained. Raw audio/transcript is not copied into the GroundTruth database.
- **QuickNode:** only confirmed events emitted by the deployed GroundTruth program are projected. A transfer involving the vault but not a valid program event is not enough to change `Deal.state`.

## Escrow v1

One `DealAccount` PDA and one associated SPL-token vault exist per deal. PDA seeds are `['deal', buyer_wallet, deal_id]`; `deal_id` is a 32-byte client-generated value recorded in the API before initialization. The seller token account must be the associated token account for the bound seller wallet and mint.

| Instruction | Transaction signer | Program requirements and result |
| --- | --- | --- |
| `initialize_deal` | Buyer | Creates the PDA; binds buyer, seller wallet/token account, reviewer wallets/roles/required flags, devnet USDC mint, amount, and deal ID. Requires at least one reviewer with `required=true`; reviewer cannot be default, buyer, or seller. Maximum eight reviewers. |
| `fund` | Buyer | State `draft`; transfers exactly the bound amount and mint into the PDA vault; state becomes `funded`. |
| `sign_approval` | Assigned reviewer | State `funded`; signer and role match an assigned reviewer; records one approval and emits `ApprovalSigned`. Duplicate approval fails. |
| `place_hold` | Assigned reviewer | State `funded`; records reason code, makes the deal `held`, emits `HoldPlaced`. Approval and release after a hold fail. |
| `release` | Any fee payer | State `funded`, vault has exact bound amount, every required reviewer approved, no hold, bound mint and seller ATA match. Transfers the full amount to the seller, closes the vault, state becomes `released`. |
| `refund` | Buyer | State `held`, buyer signs, bound buyer ATA and mint match. Transfers the full amount to buyer, closes the vault, state becomes `refunded`. |

There are no fees, tranches, juries, mutable payout addresses, admin bypasses, auto-release timers, or release-on-silence paths. `released` and `refunded` are terminal. A second settlement, wrong mint, wrong destination, unassigned signer, missing approval, or active hold must fail without changing balances.

Required program events: `DealInitialized`, `DealFunded`, `ApprovalSigned`, `HoldPlaced`, `DealReleased`, and `DealRefunded`. Each event includes deal PDA and deal ID; settlement events include amount and destination token account.

## Canonical fixtures

The scaffold creates these in `packages/shared/src/fixtures` and keeps UI/API/program test values aligned:

- `golden-parcel.json`: manually verified Franklin County parcel with OGRIP geometry, at least one dated evidence source, and one deliberate unresolved check.
- `second-county-parcel.json`: real parcel from a second county where GroundTruth runs few local checks; unchecked items, including zoning, stay `unknown`, and `coverage` follows the results.
- `held-deal.json`: funded deal with a title-reviewer hold for `SELLER_IDENTITY_DISPUTED`; release is expected to fail.
- `cleared-deal.json`: funded deal with required title, survey, and septic approvals; release is expected to pay the bound seller once.

Fixture files contain staged wallets and public records only. Once the devnet accounts exist, the fixture records their addresses and saved transaction signatures; it never contains a private key.

## Contract change gate

A change to a field, status, route, instruction, PDA seed, required reviewer, or terminal-state rule updates `packages/shared`, this file, both fixture sets, affected tests, and the consuming phase docs in one pull request. Additive copy changes do not require a version bump. A breaking shape or state-machine change becomes v2.
