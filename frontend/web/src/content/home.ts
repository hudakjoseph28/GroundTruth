import {
  stagedParcel,
  type Check,
  type CheckKind,
  type CheckStatus,
  type DealState,
  type ParcelReport,
} from "@groundtruth/shared";

// Homepage copy. Claims follow docs/context/Problem.md: public records,
// professional sign-offs, and escrow receipts are kept separate, every number
// carries its years and denominator, and sample content is labeled as sample.

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

// ---------- Hero ----------

export const HERO = {
  eyebrow: "For first-time vacant-land buyers in Ohio",
  headline: ["Know the land.", "Know what comes next."],
  subhead:
    "A listing shows a price. It doesn’t show the road you can’t legally use, the sewer that isn’t there, or the seller who isn’t the owner.",
  staged: {
    before: "No street number? Search by parcel ID. This preview has one staged parcel: try ",
    parcelId: stagedParcel.sourceParcelId,
    after: ". Live Ohio records are not connected.",
  },
} as const;

// ---------- Sample report card ----------

// The staged parcel has no recorded report yet, so the card's findings are
// sample copy typed against the shared contract. Only the county and parcel ID
// come from the fixture. Nothing here is a live record or a real transaction.
export interface SampleCheck extends Pick<Check, "kind" | "status"> {
  /** Overrides the shared check label when the card names a narrower fact. */
  label?: string;
}

export interface SampleReport {
  eyebrow: string;
  place: string;
  parcelId: string;
  openQuestion: {
    heading: string;
    kind: ParcelReport["biggestOpenQuestion"];
    title: string;
    status: CheckStatus;
    resolverLabel: string;
    resolver: string;
  };
  checksLabel: string;
  checks: readonly SampleCheck[];
  escrow: { state: DealState; title: string; body: string };
  linkLabel: string;
  disclaimer: string;
}

export const SAMPLE_REPORT: SampleReport = {
  eyebrow: "Sample report",
  place: `${stagedParcel.county} County, OH`,
  parcelId: stagedParcel.sourceParcelId,
  openQuestion: {
    heading: "Biggest open question",
    kind: "access",
    title: "Legal road access",
    status: "needsReview",
    resolverLabel: "Who resolves it",
    resolver: "Title team, then surveyor",
  },
  checksLabel: "Other checks in this sample",
  checks: [
    { kind: "zoning", status: "evidenceFound" },
    { kind: "flood", status: "evidenceFound" },
    { kind: "utilities", status: "unknown", label: "Sewer" },
    { kind: "sellerAuthority", status: "held" },
  ],
  escrow: {
    state: "held",
    title: "Payout held.",
    body: "A title reviewer’s hold blocks release. Test USDC on Solana devnet.",
  },
  linkLabel: "Open the sample report",
  disclaimer: "Sample statuses for the staged demo. Not live records; no funds have moved.",
};

// ---------- Proof strip ----------

export interface ProofStat {
  figure: string;
  /** Sentence that completes the figure. `strong` marks a second number. */
  body: readonly { text: string; strong?: boolean }[];
  sources: readonly SourceLink[];
}

export const PROOF = {
  title: "The evidence behind seller verification",
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
      body: [
        {
          text: "The FBI warned about criminals impersonating owners of vacant parcels.",
        },
      ],
      sources: [SOURCES.fbi],
    },
  ] satisfies readonly ProofStat[],
  finePrint:
    "The survey figures are respondent reports of attempts, including failed ones, not the odds on any one purchase.",
} as const;

// ---------- Three questions ----------

export type QuestionIconName = "parcel" | "seller" | "escrow";

export interface BuyerQuestion {
  icon: QuestionIconName;
  title: string;
  body: string;
  checks: readonly CheckKind[];
  /** One illustrative status, labeled as an example wherever it is shown. */
  example: { label: string; status: CheckStatus };
}

export const QUESTIONS = {
  title: "Three questions before your money moves",
  exampleLabel: "Example",
} as const;

export const BUYER_QUESTIONS: readonly BuyerQuestion[] = [
  {
    icon: "parcel",
    title: "Can I use it?",
    body: "A map can show a lot touching a road. It can’t show a legal right to use it.",
    checks: ["zoning", "flood", "access", "utilities", "easements"],
    example: { label: "Road access", status: "needsReview" },
  },
  {
    icon: "seller",
    title: "Is the seller authorized?",
    body: "A title reviewer checks the seller. A listing and a matching name are not enough.",
    checks: ["sellerAuthority"],
    example: { label: "Seller authority", status: "held" },
  },
  {
    icon: "escrow",
    title: "What has to happen before I pay?",
    body: "Title, survey, and septic each have a named reviewer. You see who has signed and who acts next.",
    checks: ["survey", "septic", "closing"],
    example: { label: "Survey", status: "signedOff" },
  },
];

// ---------- Two outcomes ----------

export type StepTone = "evidence" | "held" | "signed" | "released";

export interface OutcomeStep {
  tone: StepTone;
  /** Where the step happens. A call is evidence; only signatures move money. */
  where: string;
  title: string;
  detail: string;
}

export interface Outcome {
  tone: "held" | "released";
  kicker: string;
  title: string;
  steps: readonly OutcomeStep[];
}

const OFF_CHAIN = "Off-chain evidence";
const ON_CHAIN = "On-chain";

export const OUTCOMES_SECTION = {
  title: "One escrow, two outcomes",
  lede: "A reviewer’s hold blocks the payout. Cleared sign-offs release it.",
  note: "Both outcomes are designed for the staged demo on Solana devnet, with test USDC and demo parties. The closing screen is not connected to this page yet, and no real funds are involved.",
} as const;

export const OUTCOMES: readonly Outcome[] = [
  {
    tone: "held",
    kicker: "Disputed deal",
    title: "Payout held",
    steps: [
      {
        tone: "evidence",
        where: OFF_CHAIN,
        title: "The owner callback raises a dispute",
        detail: "Reached at an independently verified number, the owner says the lot is not for sale.",
      },
      {
        tone: "held",
        where: ON_CHAIN,
        title: "The title reviewer places a hold",
        detail: "A call is evidence. The reviewer signs the decision.",
      },
      {
        tone: "held",
        where: ON_CHAIN,
        title: "The release fails",
        detail: "Escrow rejects the payout while the hold is active.",
      },
      {
        tone: "held",
        where: ON_CHAIN,
        title: "The balance stays intact",
        detail: "The deposit stays in escrow, and the buyer can ask for a refund.",
      },
    ],
  },
  {
    tone: "released",
    kicker: "Cleared deal",
    title: "Released to the seller",
    steps: [
      {
        tone: "signed",
        where: ON_CHAIN,
        title: "The title reviewer signs off",
        detail: "Seller authority and closing readiness.",
      },
      {
        tone: "signed",
        where: ON_CHAIN,
        title: "Survey and septic reviewers sign off",
        detail: "Each signs only their own scope.",
      },
      {
        tone: "signed",
        where: ON_CHAIN,
        title: "Every required sign-off is in",
        detail: "No hold is active, so escrow allows the release.",
      },
      {
        tone: "released",
        where: ON_CHAIN,
        title: "The payout goes only to the bound seller",
        detail: "The exact agreed amount, once, to the seller wallet fixed at the start.",
      },
    ],
  },
];

// ---------- How it works ----------

export const HOW_IT_WORKS = {
  title: "How it works",
  lede: "Public records supply the evidence. Professionals sign the decisions. Solana escrow decides whether money moves.",
} as const;

export const STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Find the lot",
    body: "Search by address or parcel ID. Vacant land often has no street number.",
  },
  {
    title: "See what is known and what is open",
    body: "Each check shows a status in words, a dated source, and who can resolve it.",
  },
  {
    title: "Reviewers sign their part",
    body: "A phone call or an AI summary is evidence for a reviewer. It never approves a deal.",
  },
  {
    title: "Escrow enforces the result",
    body: "The deposit pays the seller only when every required reviewer has signed and no hold is active.",
  },
];

// ---------- What a report checks ----------

export const CHECKS_SECTION = {
  title: "What a report checks",
  lede: "Nine checks, each with the person who can confirm it. Where a record is missing, the check says so.",
  confirmedByLabel: "Confirmed by",
  statusesLabel: "Every finding carries one of five statuses",
} as const;

export interface CheckCopy {
  question: string;
  confirmedBy: string;
}

export const CHECK_COPY: Record<CheckKind, CheckCopy> = {
  zoning: {
    question: "What can be built here?",
    confirmedBy: "The township or county zoning office",
  },
  flood: {
    question: "Is the lot in a mapped flood area?",
    confirmedBy: "FEMA flood maps, shown with their date",
  },
  access: {
    question: "Can you legally reach it from a road?",
    confirmedBy: "Title reviewer for recorded access; road authority for driveways",
  },
  utilities: {
    question: "Is public sewer or water available?",
    confirmedBy: "The utility or the local public health office",
  },
  easements: {
    question: "Are there recorded rights or restrictions?",
    confirmedBy: "Title reviewer",
  },
  sellerAuthority: {
    question: "Is the seller authorized to sell?",
    confirmedBy: "Title reviewer, using an independently verified contact",
  },
  survey: {
    question: "Where are the boundaries?",
    confirmedBy: "Licensed surveyor",
  },
  septic: {
    question: "Can a septic system work on this site?",
    confirmedBy: "Local public health site review",
  },
  closing: {
    question: "Is everything ready for payment?",
    confirmedBy: "Title or closing professional",
  },
};

export const STATUS_MEANING: Record<CheckStatus, string> = {
  evidenceFound: "A source supports the fact. This is not a professional approval.",
  needsReview: "Evidence exists, but a qualified person still decides.",
  unknown: "Missing, conflicting, or not covered yet. We do not guess.",
  signedOff: "The assigned reviewer signed their part.",
  held: "A reviewer blocked payout until the issue is resolved.",
};

// ---------- Coverage, start, account, footer ----------

export const COVERAGE = {
  title: "Ohio coverage",
  lede: `Search is built to cover parcels across Ohio, with deeper checks only where a source is verified. Live county coverage is not connected yet: this preview has one ${stagedParcel.county} County stand-in, parcel ID ${stagedParcel.sourceParcelId}.`,
} as const;

export const START = {
  title: "Find your lot",
  searchLabel: "Search for a parcel, bottom of page",
} as const;

export const ACCOUNT = {
  title: "Sign in",
  body: "Research does not need an account. This demo has no sign-in.",
} as const;

export const NOT_THIS: readonly string[] = [
  "a legal opinion on whether you can build",
  "a title search or title insurance",
  "a survey",
  "an identity check",
  "a deed transfer",
];

export const FOOTER = {
  position: "GroundTruth is decision support and closing coordination.",
  notPrefix: "It is not",
} as const;
