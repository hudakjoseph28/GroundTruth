import {
  CHECK_KINDS,
  CHECK_STATUSES,
  type Check,
  type Deal,
  type Parcel,
  type ParcelReport,
} from "./contract.js";
import golden from "./fixtures/golden-parcel.json" with { type: "json" };

/**
 * The golden parcel: Franklin County 230-000918 (Seaman Rd rear lot, Pleasant
 * Township), checked by hand on 2026-11-17. The boundary is the published
 * OGRIP polygon; every report source carries the time it was retrieved.
 * Captured by .context tooling from live sources, see the PR that added it.
 * `acreage` is absent because OGRIP publishes 0 for Franklin; the Auditor's
 * legal acreage is cited inside the zoning check instead.
 */
export const goldenParcel: Parcel = toParcel(golden.parcel);
export const goldenReport: ParcelReport = toReport(golden.report);

// TODO(Kadhir): Record escrowAddress and transaction signatures after the staged devnet accounts exist. Release stays any fee payer and refund stays the buyer, per Escrow v1.
export const stagedDeal = {
  id: "staged-devnet-deal",
  parcelKey: goldenParcel.key,
  buyerWallet: "HcLJ8kbrJ3Jxk7oEf84ZGpR8czUr4U2x3jVJosXPgykM",
  sellerWallet: "27hSFUGN9q65qXAvevvrUvvAunxiBLCFTG3SmdBWQJ6f",
  sellerTokenAccount: "3rim2iuiaKyoaBcsSyENyn5osJn2Hy93R5c8RL8GY7yC",
  reviewers: [
    {
      wallet: "66EpT1ZYPxzYJAvhkbb8dzphLmdK6grtvv3LxRE8hLeN",
      role: "title",
      required: true,
    },
    {
      wallet: "A4j9LzytgynD8kEMZty7tzP4jndrRDCkBCpAHDiR5xwv",
      role: "survey",
      required: true,
    },
    {
      wallet: "HopdTqQ2QWywRpMmPHmdeddowJKdAmZRQLkoNrefaAGx",
      role: "septic",
      required: true,
    },
  ],
  amountBaseUnits: "25000000",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  cluster: "devnet",
  state: "draft",
  timeline: [
    {
      id: "staged-devnet-deal-created",
      at: "2026-11-12T00:00:00.000Z",
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;

// JSON imports widen literal types; check the contract's literals at load.
function toParcel(raw: typeof golden.parcel): Parcel {
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

function toReport(raw: typeof golden.report): ParcelReport {
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
