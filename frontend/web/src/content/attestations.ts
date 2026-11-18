import { stagedDeal } from "@groundtruth/shared";
import { shortAddress } from "../data/ledger";

// The tags pinned to the land on the homepage. They are an illustration
// of what a parcel's on-chain record looks like, not activity that happened:
// the page says so once, beside them. Reviewer wallets are the staged
// fixture's, shortened. The others are made-up short forms; none is a whole
// address, none is a signature, and none links anywhere.

export type AttestationTone = "signed" | "pending" | "held";
export type AttestationMark = "check" | "cross" | "lock" | "none";

export interface Attestation {
  id: string;
  /** A shortened wallet, or "Escrow". */
  actor: string;
  /** True when `actor` is a wallet, so it is set in mono. */
  wallet: boolean;
  verb: string;
  detail: string;
  /** Green: signed or released. Gold: pending or funded. Red: held. */
  tone: AttestationTone;
  mark: AttestationMark;
  /** A release ripples through the parcel boundary. */
  release?: boolean;
}

const [title, survey, septic] = stagedDeal.reviewers.map((reviewer) => shortAddress(reviewer.wallet));
const TITLE = title ?? "";
const SURVEY = survey ?? "";
const SEPTIC = septic ?? "";
const ESCROW = "Escrow";

const by = (
  id: string,
  actor: string,
  verb: string,
  detail: string,
  tone: AttestationTone,
  mark: AttestationMark,
  release = false,
): Attestation => ({ id, actor, wallet: actor !== ESCROW, verb, detail, tone, mark, release });

/** In the order they appear, so neighbors differ in color and kind. */
export const ATTESTATIONS: readonly Attestation[] = [
  by("authority", TITLE, "approved", "Seller authority", "signed", "check"),
  by("funded", ESCROW, "funded", "25 test USDC", "pending", "lock"),
  by("survey", SURVEY, "survey recorded", "Boundary matches plat", "signed", "check"),
  by("septic-hold", SEPTIC, "placed a hold", "Septic permit missing", "held", "cross"),
  by("access", "7xKX…q9f2", "signed off", "Road access", "signed", "check"),
  by("zoning", "9mPd…T3vk", "evidence recorded", "Zoning district on file", "pending", "none"),
  by("released", ESCROW, "released", "Paid to bound seller", "signed", "check", true),
  by("flood", "4QeN…w8Zr", "evidence recorded", "FEMA flood map cited", "pending", "none"),
  by("title", TITLE, "signed off", "Title search", "signed", "check"),
  by("water", "2bHs…Lk7M", "evidence recorded", "Public water at the road", "pending", "none"),
  by("septic", SEPTIC, "signed off", "Septic site review", "signed", "check"),
  by("easement-hold", TITLE, "placed a hold", "Easement under review", "held", "cross"),
  by("easements", SURVEY, "signed off", "Easements mapped", "signed", "check"),
  by("sewer", "5cJr…9Wqa", "evidence recorded", "No public sewer on record", "pending", "none"),
  by("blocked", ESCROW, "held", "Payout blocked", "held", "cross"),
  by("released-again", ESCROW, "released", "Paid to bound seller", "signed", "check", true),
];

const pick = (id: string) => ATTESTATIONS.find((entry) => entry.id === id);

/** The still frame, for reduced motion: one signed, one funded, one held. */
export const STILL_ATTESTATIONS: readonly Attestation[] = [
  pick("authority"),
  pick("funded"),
  pick("septic-hold"),
].filter((entry): entry is Attestation => entry !== undefined);

export const ATTESTATION_COPY = {
  caption: "Illustrative activity.",
  summary:
    "Illustration: events on a parcel's on-chain record, each pinned to a spot on the land. For example, a title reviewer approves seller authority, the escrow is funded in USDC, a reviewer places a hold, and the escrow releases to the seller.",
} as const;
