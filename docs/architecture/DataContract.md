# GroundTruth · Data contract (v1)

**Accepted Nov 12, 2026.** Additive changes: Nov 18, 2026, check kind `environmental`; Nov 19, 2026, deal documents and parcel map layers (see [Contract change gate](#contract-change-gate)). UI, API, report adapters, Stream consumer, and escrow client build against these names and rules. The scaffold implements the schemas in `packages/shared`; once that code exists, this document explains the contract and the checked-in schemas validate it.

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
  acreage?: number;         // county-published acreage (OGRIP LandArea)
  mappedAcreage?: number;   // area of the OGRIP boundary; label it "mapped"
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

// One parcel on the explore map: its summary and published outline.
export type ParcelOutline = Omit<Parcel, "geometry"> & {
  outline: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

export interface ParcelArea {
  bbox: [number, number, number, number]; // [west, south, east, north], as asked
  parcels: ParcelOutline[];               // at most 500
  truncated: boolean;                     // OGRIP holds more here; the map asks to zoom in
  authority: "Ohio OGRIP";
  sourceUrl: string;
  retrievedAt: string;
}

export type CheckKind =
  | "zoning" | "flood" | "environmental" | "access" | "utilities"
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
  citedDocument?: DocumentCitation; // approvalSigned rows whose tx carried a document memo
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

// ---------- Deal documents (additive, Nov 19) ----------
export type DealDocumentType =
  | "titleCommitment" | "surveyPlat" | "septicSoilEvaluation"
  | "zoningLetter" | "other";
export type DealParticipantRole = "buyer" | "seller" | ReviewerRole;

// Public metadata only; the bytes need a participant's fresh wallet signature.
export interface DealDocument {
  id: string;
  dealId: string;
  type: DealDocumentType;
  filename: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg"; // from the bytes
  sizeBytes: number;        // at most 10 MB
  sha256: string;           // lowercase hex, computed by the API
  uploaderRole: DealParticipantRole;
  uploadedAt: string;
}

// The hash an approval's Memo instruction `groundtruth:doc:<sha256>` named.
export interface DocumentCitation {
  sha256: string;
  document?: Pick<DealDocument, "id" | "type" | "filename" | "uploaderRole">; // absent: no upload has this hash
}

// Staged demo text alerts. The number is never returned unmasked.
export interface DealSmsSubscriptionRequest { phoneNumber: string; consent: true; }
export interface DealSmsSubscription { dealId: string; maskedPhoneNumber: string; }
```

`Deal.state` is a projection of the confirmed program account and transactions. The browser never sets it. The API may show `PENDING_CONFIRMATION` while waiting, but it does not optimistically label a deal held, released, or refunded.

## HTTP API v1

All responses are JSON. Success returns the named object directly. Failure returns `ApiError` with the matching HTTP status. `requestId` is also set in the `x-request-id` response header.

| Method and route | Success | Contract |
| --- | --- | --- |
| `GET /api/health` | `200 { status: "ok", commit: string }` | No dependency details or secrets. |
| `GET /api/parcels/search?q=` | `200 ParcelSearchResult[]` | Address or source parcel ID; trimmed query length 3–120. `[]` means valid query with no match. `NO_COVERAGE` means outside the supported source. |
| `GET /api/parcels/area?bbox=` | `200 ParcelArea` | `bbox` is `west,south,east,north` in WGS84 degrees, each side at most 0.25°. Keyable parcels whose OGRIP boundary touches the box, at most 500; `truncated` says more exist. A multi-part parcel is merged into one outline and keeps `mappedAcreage` only when one part is in the answer. `400 INVALID_REQUEST` for a malformed or oversized box, `404 NO_COVERAGE` for a box outside Ohio, `504`/`502` (retryable) when OGRIP fails, never an empty map in its place. |
| `GET /api/parcels/:parcelKey` | `200 Parcel` | Key is URL encoded. Returns the published boundary and retrieval metadata. |
| `GET /api/parcels/:parcelKey/report` | `200 ParcelReport` | Each adapter resolves independently. A timeout yields an `unknown` check inside a successful partial report. |
| `GET /api/parcels/:parcelKey/land` | `200 LandMeta` | Land block assets for parcels not baked into the web app, built on demand from the OGRIP boundary (USGS NAIP imagery, Terrarium elevation) and cached. `LandMeta` is in `@groundtruth/shared` (`land.ts`). Provider failure is a retryable `502`/`504`, never a substitute image. |
| `GET /api/parcels/:parcelKey/land/:file` | `200` JPEG or PNG | `imagery.jpg` or `height.png`, the files the `LandMeta` names. |
| `GET /api/parcels/:parcelKey/layers` | `200 ParcelLayers` | Map layers for the land block's region (`landRegion`): FEMA flood zones, Franklin stream setbacks, NWI wetlands, Franklin zoning district lines, and the nearest Franklin public road right-of-way. `ParcelLayers` is in `@groundtruth/shared` (`layers.ts`). Each layer queries the same source as its report check, on its own limit, and is `found`, `none`, `notCovered`, or `unavailable`; a failing source is `unavailable` inside a `200`, never `none`. Outlines are clipped just outside the region. NWI cannot return its polygons, so wetlands come as NWI's own drawing of the region (PNG data URL). Lot shares (`onLot`) are measured only where the report measures them the same way (setback and zoning) or by the same sampling (flood). A complete answer is cached in memory for an hour; one with an `unavailable` layer is not. |
| `GET /api/coverage` | `200 Coverage[]` | Each row: county, boundary searchable, evidence kinds, last verified time. No marketing totals without measured data. |
| `GET /api/deals/:id` | `200 Deal` | Public only for the two staged, non-sensitive demo deals. Unknown/non-demo deals return `404`. |
| `GET /api/deals/:id/timeline` | `200 TimelineEvent[]` | Stable ascending order by chain slot/event index, then off-chain timestamp. |
| `POST /api/deals/:id/evidence/owner-call` | `201 TimelineEvent` | Internal service use after a verified ElevenLabs webhook; never callable by the public browser. Implemented as the in-process `recordOwnerCall` step of the webhook, not an HTTP route, so nothing outside the API can reach it. |
| `POST /api/deals/:id/sms-subscriptions` | `201`/`200 DealSmsSubscription` | Staged demo opt-in to texts about one public deal's future funded, hold, rejected-release, and released events. Body `{ phoneNumber, consent: true }`. Returns only `{ dealId, maskedPhoneNumber }`. `409` once the deal is released or refunded. `503` when Twilio is not configured. |
| `GET /api/deals/:id/documents` | `200 DealDocument[]` | Public staged deals only. Metadata only: never the file bytes or the uploader's wallet. |
| `POST /api/deals/:id/documents` | `201 DealDocument` | Raw body (PDF, PNG, or JPG by its bytes, matching the extension; max 10 MB). Signed by the deal's buyer, seller, or an assigned reviewer: `documentAuthMessage()` in `packages/shared` over action, deal, file SHA-256, wallet, time, and a single-use nonce, valid 5 minutes. `401` bad/expired/replayed signature, `403` not a participant, `413` too large, `415` wrong type, `409` same bytes already on the deal. |
| `POST /api/deals/:id/documents/:documentId/file` | `200` file bytes | Same signature rules, naming the document; `cache-control: private, no-store`. |
| `POST /api/webhooks/quicknode` | `204` | Verify HMAC/raw body, dedupe by signature + event index, write confirmed program events. Each newly projected funded, hold, rejected-release, or released event queues at most one text per subscriber in the same transaction. |
| `POST /api/webhooks/elevenlabs` | `200` | Verify signature/raw body, dedupe by conversation ID, store minimum staged call outcome. `200`, not `204`: ElevenLabs counts only `200` as delivered. |

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
- **Environmental (`environmental`):** one check built from two independent sources, each with its own timeout:
  - The National Wetlands Inventory, for every parcel. It reports wetland types and their approximate share of the lot.
  - Franklin County's stream-buffer layer, for Franklin parcels only. It reports the share inside a riparian setback.
  - The check is `needsReview` when either source maps something on the lot (a permit or setback rule may apply).
  - It is `evidenceFound` only when every source that applies answered `found` with nothing on the lot. Its limitation must then say that "NWI shows none" is not a wetland delineation.
  - Otherwise it is `unknown`: a timeout, error, or an NWI `missing` (no mapping project covers the lot) never becomes "none".
- **ElevenLabs:** only `conversation_id`, completion time, staged deal ID, consenting demo participant label, call success, and the configured analysis outcome are retained. Raw audio/transcript is not copied into the GroundTruth database.
- **Twilio:** a deal text subscriber's phone number is stored in E.164 form for that deal only. It is never part of `Deal`, never logged, and never returned unmasked. A text reports a confirmed event and authorizes nothing.
- **Deal documents:** a reviewer's approval may carry an SPL Memo instruction `groundtruth:doc:<sha256>` in the same transaction as `sign_approval`. The Stream filter passes the text of top-level Memo v1/v2 instructions as `memos`; memo-like text from any other program is ignored. Exactly one named document is recorded on that approval's timeline row and matched to the deal's uploads by hash when the deal is read. The memo is evidence of what the reviewer relied on; it does not change deal state.
- **QuickNode:** only confirmed events emitted by the deployed GroundTruth program are projected. A transfer involving the vault but not a valid program event is not enough to change `Deal.state`.

## Escrow v1

One `DealAccount` PDA and one associated SPL-token vault exist per deal. PDA seeds are `['deal', buyer_wallet, deal_id]`; `deal_id` is a 32-byte client-generated value recorded in the API before initialization. The seller token account must be the associated token account for the bound seller wallet and mint.

| Instruction | Transaction signer | Program requirements and result |
| --- | --- | --- |
| `initialize_deal` | Buyer | Creates the PDA; binds buyer, seller wallet/token account, reviewer wallets/roles/required flags, devnet USDC mint, amount, and deal ID. Requires at least one reviewer with `required=true`; reviewer cannot be default, buyer, or seller. Maximum eight reviewers. |
| `fund` | Buyer | State `draft`; transfers exactly the bound amount and mint into the PDA vault; state becomes `funded`. |
| `sign_approval` | Assigned reviewer | State `funded`; signer and role match an assigned reviewer; records one approval and emits `ApprovalSigned`. Duplicate approval fails. |
| `place_hold` | Assigned reviewer | State `funded`; records reason code, makes the deal `held`, emits `HoldPlaced`. Approval and release after a hold fail. |
| `release` | Any fee payer | State `funded`, vault balance >= agreed amount, every required reviewer approved, no hold, bound mint and seller ATA match. Transfers exactly the agreed amount to the seller ATA. Closes the vault and refunds rent lamports to buyer if post-transfer balance is zero; if unsolicited surplus tokens exist, vault remains open to avoid settlement lockout, leaving surplus permanently locked. State becomes `released`. |
| `refund` | Buyer | State `held`, buyer signs, bound buyer ATA and mint match. Transfers exactly the agreed amount to buyer ATA. Closes the vault and refunds rent lamports to buyer if post-transfer balance is zero; if unsolicited surplus tokens exist, vault remains open, leaving surplus permanently locked. State becomes `refunded`. |

There are no fees, tranches, juries, mutable payout addresses, admin bypasses, auto-release timers, or release-on-silence paths. `released` and `refunded` are terminal. A second settlement, wrong mint, wrong destination, unassigned signer, missing approval, or active hold must fail without changing balances. Unsolicited token transfers into the vault cannot lock settlements, but surplus tokens remain permanently inaccessible in the vault PDA once terminal; any future surplus token recovery mechanism requires a formal contract upgrade or migration. Staged demo deals are bound to the golden parcel (`ohio:39049:230-000918`).

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

| Date | Change | Kind | Where |
| --- | --- | --- | --- |
| 2026-11-18 | Check kind `environmental` (wetlands and stream setbacks) | Additive: a new `CheckKind` value; no field, status, route, or state-machine change | `CHECK_KINDS` in `packages/shared/src/contract.ts`; backend `src/reports/environmentalCheck.ts`; web `CHECK_TITLES`/`CHECK_LABELS`. The golden and second-county fixtures are unchanged and have no `environmental` check. The web ledger lists `environmental` only when a report carries it, and lists any kind it doesn't know last instead of failing. |
| 2026-11-19 | Deal documents: `DealDocument`, `DocumentCitation`, `TimelineEvent.citedDocument`, three `/api/deals/:id/documents` routes, and the optional `memos` field in the Stream payload | Additive: new types, an optional field, and new routes; no status, instruction, PDA, or state-machine change; the escrow program is unchanged | `packages/shared/src/contract.ts` and `documents.ts`; backend `src/routes/documents.ts`, `src/documents/`, `src/chain/documentMemo.ts`, migration `20261120000000_deal_documents`; `quicknode/groundtruth-filter.js`; web `src/documents/`, `/deals/:dealId`, `/review`. Fixtures unchanged: no staged deal seeds a document. |
| 2026-11-19 | Parcel map layers: `ParcelLayers`, `MapLayer`, `MapShape`, `MAP_LAYER_IDS`, and `GET /api/parcels/:parcelKey/layers` | Additive: new types and a new read-only route; no `Check`, status, or report change | `packages/shared/src/layers.ts`; backend `src/layers/parcelLayers.ts`, `src/routes/layers.ts`, recordings `test/fixtures/report/layers-*.json`; web `src/parcel/Layers/`, `src/content/layers.ts`. Fixtures unchanged. |
