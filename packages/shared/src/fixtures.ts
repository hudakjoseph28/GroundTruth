import {
  CHECK_KINDS,
  CHECK_STATUSES,
  type Check,
  type Deal,
  type Parcel,
  type ParcelReport,
} from "./contract.js";
import golden from "./fixtures/golden-parcel.json" with { type: "json" };
import secondCounty from "./fixtures/second-county-parcel.json" with { type: "json" };

/**
 * The golden parcel: Franklin County 230-000918 (Seaman Rd rear lot, Pleasant
 * Township), checked by hand on 2026-11-17. The boundary is the published
 * OGRIP polygon; every report source carries the time it was retrieved.
 * Captured by .context tooling from live sources, see the PR that added it.
 * `acreage` is absent because OGRIP publishes 0 for Franklin; the Auditor's
 * legal acreage is cited inside the zoning check instead. The septic check
 * (added 2026-11-19) is the SSURGO soil screening from Esri's Living Atlas
 * copy of USDA gSSURGO, checked live on that date; see QA-Proof.md.
 */
export const goldenParcel: Parcel = toParcel(golden.parcel);
export const goldenReport: ParcelReport = toReport(golden.report);

/**
 * The second-county parcel: Licking County 00500729609000 (93 Woody Knoll Dr,
 * Bowling Green Township). GroundTruth has no Licking zoning check, so zoning
 * is unknown; the FEMA flood finding is its one sourced check. `acreage` is
 * OGRIP's published LandArea.
 *
 * Wording sources for both reports: unknown checks carry the per-kind text
 * of templateCheck() in backend/src/reports/templates.ts (#9). `db:seed`
 * writes them from templateCheck() itself, and a backend test fails if this
 * JSON drifts from it. One documented override: this
 * parcel's zoning check says "GroundTruth doesn't check zoning in Licking
 * County yet." and names the Bowling Green Township zoning inspector, which
 * is more specific than the generic zoning template. Seeded reports carry no
 * `closing` check (no closing is open on either parcel), and
 * `biggestOpenQuestion` follows #9's rule in backend/src/reports/pipeline.ts.
 */
export const secondCountyParcel: Parcel = toParcel(secondCounty.parcel);
export const secondCountyReport: ParcelReport = toReport(secondCounty.report);

/**
 * The staged demo closings on Solana devnet, all on the golden parcel with
 * required title, survey, and septic reviewers: `stagedDeal` is held
 * (release rejected, buyer refunded) and `stagedReleasedDeal` is released to
 * the seller after every approval, both 25 test USDC and run on 2026-11-18;
 * `stagedLiveDeal` (10 test USDC) is released live on stage, and
 * `stagedRehearsalDeal` is its copy for rehearsing that moment.
 *
 * Public keys only. The wallets are the staged demo keypairs that
 * escrow/scripts/demo-deals.ts generated (their private keys stay in the
 * gitignored escrow/.demo-wallets/), and each `escrowAddress` is the deal
 * PDA for sha256(STAGED_DEAL_ID_LABELS[outcome]), printed by
 * `demo:deals plan`. backend/test/stagedDemoDeals.test.ts re-derives every
 * address. Transaction signatures are recorded after the devnet run.
 */
export const STAGED_DEAL_ID_LABELS = {
  held: "groundtruth-demo-held-v1",
  released: "groundtruth-demo-released-v1",
  live: "groundtruth-demo-live-v1",
  rehearsal: "groundtruth-demo-rehearsal-v1",
  rehearsalV2: "groundtruth-demo-rehearsal-v2",
} as const;

const stagedParticipants = {
  parcelKey: goldenParcel.key,
  buyerWallet: "HEDe3DMbVbFRku2Kzxq6usSjUdDJ1vphohTBxAXqEtXJ",
  sellerWallet: "6XPGX3Vmqh4gtj6UZNcgJTDN1haWivctw8KQ7D6UpMMj",
  sellerTokenAccount: "CZQyg2JGyjj9vRyvaBYS2tz54kproMxoiNF9hHxTG5Zu",
  reviewers: [
    {
      wallet: "ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW",
      role: "title",
      required: true,
    },
    {
      wallet: "CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa",
      role: "survey",
      required: true,
    },
    {
      wallet: "Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F",
      role: "septic",
      required: true,
    },
  ],
  amountBaseUnits: "25000000",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  cluster: "devnet",
  state: "draft",
} satisfies Omit<Deal, "id" | "timeline">;

/**
 * When each staged deal was registered with its wallets and escrow address:
 * the merge that added it to this file (#29 for the held and released deals,
 * #31 for the live one, #41 for the rehearsal copy). Each is before the
 * deal's first on-chain transaction, so the off-chain "created" row sorts
 * first and reads as the same afternoon: the first three deals were created
 * on devnet at 17:41:17Z, 17:48:33Z, and 18:57:19Z on 2026-11-18, and the
 * rehearsal deal had no transaction when it was registered.
 */
const REGISTERED_AT = {
  heldAndReleased: "2026-11-18T17:24:49.000Z",
  live: "2026-11-18T18:48:34.000Z",
  rehearsal: "2026-11-18T22:40:31.000Z",
  // When the v2 fixture was written (before any transaction on its PDA).
  rehearsalV2: "2026-11-18T23:23:17.000Z",
} as const;

/** The held demo deal. Its ID predates the second deal; the web reads it. */
export const stagedDeal = {
  id: "staged-devnet-deal",
  ...stagedParticipants,
  escrowAddress: "54Va6qKNQTsbuXTqi4tXaPVgdkQh4S7McsCKsjKPE4tW",
  timeline: [
    {
      id: "staged-devnet-deal-created",
      at: REGISTERED_AT.heldAndReleased,
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

/** The released demo deal. */
export const stagedReleasedDeal = {
  id: "staged-devnet-deal-released",
  ...stagedParticipants,
  escrowAddress: "3uBECmkG9XKbJbGisPjqWNxy6Sb3knVZ2cnwF7jby2yu",
  timeline: [
    {
      id: "staged-devnet-deal-released-created",
      at: REGISTERED_AT.heldAndReleased,
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

/**
 * The deal released live on stage: `demo:deals stage-prep` initializes and
 * funds it with title and survey approvals, then `stage-finish` sends the
 * septic approval and the release. 10 test USDC, so the buyer covers it from
 * what the first two closings left.
 */
export const stagedLiveDeal = {
  id: "staged-devnet-deal-live",
  ...stagedParticipants,
  amountBaseUnits: "10000000",
  escrowAddress: "2UrftJMzbvMngu6Mdg4PhFscqkCHnuLksfbSAiddF6Cg",
  timeline: [
    {
      id: "staged-devnet-deal-live-created",
      at: REGISTERED_AT.live,
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

/**
 * A copy of the live deal for rehearsing the stage moment: the same 10 test
 * USDC, participants, and two-step flow (`stage-prep --deal
 * staged-devnet-deal-rehearsal`, then `stage-finish --deal ...`), on its own
 * PDA, so a rehearsal never consumes the deal released on stage.
 */
export const stagedRehearsalDeal = {
  id: "staged-devnet-deal-rehearsal",
  ...stagedParticipants,
  amountBaseUnits: "10000000",
  escrowAddress: "6KQJYssz234KjxrMkREcxpcKbok34aaFyihDST6DmH5u",
  timeline: [
    {
      id: "staged-devnet-deal-rehearsal-created",
      at: REGISTERED_AT.rehearsal,
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

/**
 * The second rehearsal copy of the live deal. The first
 * (`staged-devnet-deal-rehearsal`) was used up testing the reviewer portal
 * (#45) on 2026-11-18. Same 10 test USDC, wallets, and parcel; its own PDA.
 */
export const stagedRehearsalV2Deal = {
  id: "staged-devnet-deal-rehearsal-v2",
  ...stagedParticipants,
  amountBaseUnits: "10000000",
  escrowAddress: "EPYNKVUCSUJvmuKa5NqJqNmswcdziLRJHUgwTkkC8J2X",
  timeline: [
    {
      id: "staged-devnet-deal-rehearsal-v2-created",
      at: REGISTERED_AT.rehearsalV2,
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

export const stagedDemoDeals = [
  stagedDeal,
  stagedReleasedDeal,
  stagedLiveDeal,
  stagedRehearsalDeal,
  stagedRehearsalV2Deal,
] as const;

/**
 * On-chain accounts of each staged demo deal that `Deal` does not carry,
 * keyed by deal ID. Public addresses only.
 */
export const stagedDemoChainAccounts = {
  [stagedDeal.id]: {
    outcome: "held",
    dealIdLabel: STAGED_DEAL_ID_LABELS.held,
    dealIdHex:
      "156fa2df1ad3e85c616dcb087b3b8f0a393862ed5dbaf4242f069752b8086a9c",
    vault: "HZUjdzLUAx7dSfQ3DjfFmsZ93Xfcy7Xrr7hKTnR6eecj",
    buyerTokenAccount: "7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73",
  },
  [stagedLiveDeal.id]: {
    outcome: "live",
    dealIdLabel: STAGED_DEAL_ID_LABELS.live,
    dealIdHex:
      "9ea97f60d7b1c3bc164c8465ca3026c725c04cb17c8d07dc4c5eacf68aaa1b86",
    vault: "8hTorFjmtUyS3DeRn6A9drtb4cjmSix711bKAydXmHXZ",
    buyerTokenAccount: "7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73",
  },
  [stagedRehearsalDeal.id]: {
    outcome: "rehearsal",
    dealIdLabel: STAGED_DEAL_ID_LABELS.rehearsal,
    dealIdHex:
      "b4c31dd9f5b572ffbac275189ff161d55015171d1d537264cfc7cceeaae99312",
    vault: "EebWs66L2rogg9PDi5xMcKAWpfZ5xTyB1VBcFMyzNqe2",
    buyerTokenAccount: "7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73",
  },
  [stagedRehearsalV2Deal.id]: {
    outcome: "rehearsalV2",
    dealIdLabel: STAGED_DEAL_ID_LABELS.rehearsalV2,
    dealIdHex:
      "6554bc65047df74393d5596eb8bb9d493bb646c30f7f798de1566b150b0db7cc",
    vault: "4awpxEmXL8fHDFDE9Lu6qHGq6NdBVpLjUUgT3nCHtCpt",
    buyerTokenAccount: "7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73",
  },
  [stagedReleasedDeal.id]: {
    outcome: "released",
    dealIdLabel: STAGED_DEAL_ID_LABELS.released,
    dealIdHex:
      "4833f90d34852fcf7bc1e683386a641b485bc2aae4178efefa34fc8565b112e4",
    vault: "8M4S4zZVgBxMPJ5oyzDngU2tGfUZSf5g4osa1vAXNJ6w",
    buyerTokenAccount: "7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73",
  },
} as const satisfies Record<
  string,
  {
    outcome: keyof typeof STAGED_DEAL_ID_LABELS;
    dealIdLabel: string;
    dealIdHex: string;
    vault: string;
    buyerTokenAccount: string;
  }
>;

// JSON imports widen literal types; check the contract's literals at load.
type RawParcel = Omit<Parcel, "geometry"> & {
  geometry: Omit<Parcel["geometry"], "geojson" | "authority"> & {
    authority: string;
    geojson: { type: string; coordinates: number[][][] };
  };
};
type RawReport = Omit<
  ParcelReport,
  "coverage" | "biggestOpenQuestion" | "checks"
> & {
  coverage: string;
  biggestOpenQuestion: string;
  checks: (Omit<Check, "kind" | "status"> & { kind: string; status: string })[];
};
function toParcel(raw: RawParcel): Parcel {
  const type = raw.geometry.geojson.type;
  if (type !== "Polygon") throw new Error(`fixture geometry ${type}`);
  if (raw.geometry.authority !== "Ohio OGRIP") {
    throw new Error("fixture geometry authority");
  }
  return {
    ...raw,
    geometry: {
      ...raw.geometry,
      authority: "Ohio OGRIP",
      geojson: { type, coordinates: raw.geometry.geojson.coordinates },
    },
  };
}

function toReport(raw: RawReport): ParcelReport {
  const coverage = raw.coverage;
  if (
    coverage !== "deep" &&
    coverage !== "partial" &&
    coverage !== "boundaryOnly"
  ) {
    throw new Error(`fixture coverage ${coverage}`);
  }
  return {
    ...raw,
    coverage,
    biggestOpenQuestion: oneOf(CHECK_KINDS, raw.biggestOpenQuestion),
    checks: raw.checks.map(
      (check): Check => ({
        ...check,
        kind: oneOf(CHECK_KINDS, check.kind),
        status: oneOf(CHECK_STATUSES, check.status),
      }),
    ),
  };
}

function oneOf<T extends string>(allowed: readonly T[], value: string): T {
  const found = allowed.find((entry) => entry === value);
  if (found === undefined) throw new Error(`fixture value ${value}`);
  return found;
}
