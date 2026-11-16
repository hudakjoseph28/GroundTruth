import { stagedParcel, type CheckKind, type CheckStatus, type ReviewerRole } from "@groundtruth/shared";

// Homepage copy. Claims follow docs/context/Problem.md: a public record, a
// professional's sign-off, and an escrow receipt stay separate, and every
// number carries its years and denominator. There is one escrow per deal, and
// a reviewer's approval is a signed transaction recorded against it. The
// moving diagrams are illustrations and say so.

export const SOURCES = {
  alta2026: {
    label: "ALTA 2026 study",
    href: "https://www.alta.org/business-operations/research-initiatives-and-resources/critical-issue-studies/seller-impersonation-fraud-study",
  },
  alta2024: {
    label: "ALTA 2024 study",
    href: "https://www.alta.org/file/Seller-Impersonation-Fraud-Study-Report.pdf",
  },
  fbi: {
    label: "FBI IC3 advisory",
    href: "https://www.ic3.gov/PSA/2026/PSA260616",
  },
} as const;

export type SourceLink = (typeof SOURCES)[keyof typeof SOURCES];

/** The amount the diagrams move. An example figure, not the staged deal's. */
export const EXAMPLE_AMOUNT = 25_000;

// ---------- Hero ----------

export type TrustIcon = "record" | "signature" | "escrow";

export const HERO = {
  eyebrow: "Vacant land · Ohio · Solana escrow",
  /** One line each, so the headline can be set large. */
  headline: ["Know the land", "before the money", "moves."],
  subhead: "Records checked. Approvals signed on-chain. Your USDC in escrow until both clear.",
  searchLabel: "Search for a parcel",
  demo: { before: "Try a demo parcel:", parcelId: stagedParcel.sourceParcelId },
  trust: [
    { icon: "record", label: "Public records cited" },
    { icon: "signature", label: "Licensed reviewers sign" },
    { icon: "escrow", label: "USDC escrow on Solana" },
  ] satisfies readonly { icon: TrustIcon; label: string }[],
  land: {
    open: "Open the demo parcel",
    description:
      "A parcel of land as a block resting on a survey grid: real aerial imagery on real terrain, with its boundary outlined in gold.",
  },
} as const;

// ---------- How it works ----------

export type StepId = "parcel" | "checks" | "escrow" | "release";
export type Outcome = "held" | "cleared";
export type CalloutId = "imagery" | "elevation" | "boundary" | "earth";

export const HOW = {
  eyebrow: "How it works",
  title: "From a parcel ID to a payout.",
  tabsLabel: "The four steps",
  steps: [
    {
      id: "parcel",
      title: "Parcel",
      line: "Ohio parcel records",
      headline: "Every parcel, rendered from real imagery and terrain.",
      body: "",
      bullets: [],
    },
    {
      id: "checks",
      title: "Checks",
      line: "Zoning, access, septic, title",
      headline: "Every answer in one place.",
      body: "Zoning, access, flood, utilities, septic, title: each with its source, who's responsible, and an on-chain record when it's signed.",
      bullets: [
        "No more PDFs and email threads",
        "Every claim has a source and a date",
        "Every sign-off is a signed transaction anyone can verify",
      ],
    },
    {
      id: "escrow",
      title: "Escrow",
      line: "USDC locked on Solana",
      headline: "Your USDC sits in a Solana escrow, not the seller's account.",
      body: "",
      bullets: [
        "Funds can't move without the required sign-offs",
        "Any reviewer can freeze the payout",
        "Refundable to the buyer under the deal's rules",
      ],
    },
    {
      id: "release",
      title: "Release",
      line: "Paid only when cleared",
      headline: "Money moves only when the facts clear.",
      body: "",
      bullets: [],
    },
  ] satisfies readonly {
    id: StepId;
    title: string;
    line: string;
    headline: string;
    body: string;
    bullets: readonly string[];
  }[],
  parcel: {
    callouts: [
      { id: "imagery", label: "Real aerial imagery" },
      { id: "elevation", label: "Real elevation" },
      { id: "boundary", label: "Boundary from Ohio parcel records" },
      { id: "earth", label: "Explore in Google Earth" },
    ] satisfies readonly { id: CalloutId; label: string }[],
    /** What the picture says about each layer. The credits come from the baked tiles. */
    labels: {
      elevation: (credit: string, low: number, high: number) =>
        `${credit} · ${low} to ${high} m across this tile`,
      boundary: "Boundary: outlined in gold on the imagery",
    },
    profile: "Elevation, west to east",
    note: "Shown: the demo parcel, with a stand-in boundary.",
    description:
      "The demo parcel from above: aerial imagery with the boundary outlined in gold, over a profile of the ground's elevation from west to east.",
  },
  checks: {
    /** The three records shown, and the statuses each one steps through. */
    frames: [
      { zoning: "unknown", access: "evidenceFound", survey: "needsReview" },
      { zoning: "evidenceFound", access: "evidenceFound", survey: "needsReview" },
      { zoning: "evidenceFound", access: "needsReview", survey: "needsReview" },
      { zoning: "evidenceFound", access: "needsReview", survey: "signedOff" },
    ] satisfies readonly Partial<Record<CheckKind, CheckStatus>>[],
    kinds: ["zoning", "access", "survey"] satisfies readonly CheckKind[],
    note: "Example statuses.",
    description:
      "Three ledger records for a parcel, linked in a chain: zoning, road access, and survey, each with its status and who confirms it.",
  },
  diagram: {
    buyer: "Buyer",
    escrow: "Escrow",
    seller: "Seller",
    unit: "USDC",
    locked: "locked",
    paid: "paid out",
    waiting: "Locked until three reviewers sign",
    roles: { title: "Title", survey: "Survey", septic: "Septic" } satisfies Record<ReviewerRole, string>,
    seal: { waiting: "waiting", signed: "signed", held: "hold" },
    outcomeLabel: "Outcome",
    outcomes: [
      { value: "held", label: "Held" },
      { value: "cleared", label: "Cleared" },
    ] satisfies readonly { value: Outcome; label: string }[],
    result: {
      held: "Payout blocked: balance unchanged",
      cleared: "Paid to the bound seller",
    } satisfies Record<Outcome, string>,
    note: "Illustration.",
    description: {
      lock: "Diagram: USDC flows from the buyer's wallet into the escrow and locks there, with three reviewer sign-offs still waiting.",
      held: "Diagram: the title reviewer has placed a hold, so the release is rejected and the escrow's balance is unchanged.",
      cleared:
        "Diagram: title, survey, and septic have all signed, and the escrow pays the bound seller.",
    },
  },
} as const;

// ---------- For reviewers ----------

export const REVIEWERS = {
  eyebrow: "For reviewers",
  title: "Sign with your wallet. Your approval is permanent, public, and yours.",
  bullets: [
    "Review evidence in one place",
    "Approve or hold with one signature",
    "Your record is on-chain, verifiable by anyone",
  ],
  cta: { label: "Become a reviewer", todo: "TODO: reviewer signup" },
  roles: {
    title: "Title agent",
    survey: "Surveyor",
    septic: "Septic inspector",
  } satisfies Record<ReviewerRole, string>,
  escrow: "Escrow",
  signOffs: "sign-offs",
  waiting: "Waiting",
  held: "Held",
  ready: "Ready to release",
  verbs: { approve: "approve", hold: "hold" },
  note: "Illustration.",
  description:
    "Diagram: a chain of blocks moves left as new ones form. A surveyor, a septic inspector, and a title agent each sign from their wallet; each signature lands in the next block as a receipt, and the escrow's sign-off count rises from one of three to three of three. In one loop out of three the title agent places a hold instead, and the escrow locks.",
} as const;

// ---------- Three seats ----------

export type SeatId = "buyer" | "seller" | "reviewer";

export const SEATS = {
  eyebrow: "Who it's for",
  title: "One closing, three seats at the table.",
  deal: { title: "Deal", line: "One escrow" },
  cards: [
    { id: "buyer", title: "Buyer", line: "Your money stays put until it's clear." },
    { id: "seller", title: "Seller", line: "Paid the moment sign-offs clear." },
    { id: "reviewer", title: "Reviewer", line: "Sign once. On-chain forever." },
  ] satisfies readonly { id: SeatId; title: string; line: string }[],
} as const;

// ---------- Proof strip ----------

export interface ProofStat {
  figure: string;
  /** Sentence that completes the figure. `strong` marks a second number. */
  body: readonly { text: string; strong?: boolean }[];
  sources: readonly SourceLink[];
}

export const PROOF = {
  title: "Why seller verification comes first",
  stats: [
    {
      figure: "59%",
      body: [
        {
          text: "of 245 surveyed title professionals reported at least one seller-impersonation attempt in 2025, vs. ",
        },
        { text: "28%", strong: true },
        { text: " in the 2024 survey covering 2023." },
      ],
      sources: [SOURCES.alta2026, SOURCES.alta2024],
    },
    {
      figure: "82%",
      body: [
        {
          text: "of respondents in the same survey rated vacant land at least somewhat common in seller-impersonation fraud.",
        },
      ],
      sources: [SOURCES.alta2026],
    },
    {
      figure: "June 2026",
      body: [{ text: "The FBI warned about criminals impersonating owners of vacant parcels." }],
      sources: [SOURCES.fbi],
    },
  ] satisfies readonly ProofStat[],
  finePrint:
    "The survey figures are respondent reports of attempts, including failed ones, not the odds on any one purchase.",
} as const;

// ---------- Final call to action ----------

export const CTA = {
  title: "See a parcel the way we do.",
  searchLabel: "Search for a parcel, bottom of page",
} as const;
