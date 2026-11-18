import type { CheckKind, DealState, ReviewerRole } from "@groundtruth/shared";

// Copy for the parcel page. Claims follow docs/context/Problem.md: a public
// record, a professional's decision, and an escrow receipt stay separate, and
// anything staged says so. There is one escrow per deal; a reviewer's approval
// is a signed transaction against it, never "its own contract".

export const PARCEL_PAGE = {
  back: "Back to search",
  stagedLabel: "Staged sample",
  stagedNote: "A stand-in boundary for the demo, not a surveyed lot.",
  keyLabel: "Parcel key",
  county: (name: string) => `${name} County`,
  acres: (value: number) => `${value} acres`,
  /** The OGRIP boundary's own area: a map measurement, not legal acreage. */
  mappedAcres: (value: number) => `about ${value} acres, mapped`,
  missing: {
    title: "Parcel not found",
    body: "That link does not name an Ohio parcel. Search by parcel ID or street address instead.",
  },
} as const;

export const LAND = {
  label3d:
    "The parcel as a block of land: aerial imagery on its terrain, soil below, and the boundary outlined in gold.",
  labelFlat: "Aerial imagery of the parcel, with the boundary outlined in gold.",
  hint: "Drag to turn it, or click it to explore the area.",
  exaggerated: (times: number) => `Height exaggerated ×${times}`,
  flat: {
    reduced: "Shown flat because motion is reduced.",
    fallback: "Shown flat because WebGL is unavailable.",
    chosen: "Flat aerial view of the parcel.",
  },
  loading: "Loading the land…",
  /** What the land block says when it has keyboard focus. */
  stage: {
    turning: "Land block. Arrow keys turn it. Enter opens Explore the area.",
    still: "Aerial image of the parcel. Enter opens Explore the area.",
  },
  view: {
    label: "Land view",
    three: "3D",
    two: "2D",
    noWebgl: "3D needs WebGL, which this browser does not provide.",
    reduced: "3D is off while motion is reduced.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Reset view",
  },
} as const;

// Links out to the real surroundings. Google's names are theirs; the in-app
// view is labeled as Google's imagery, not as anything about the parcel.
export const EXPLORE = {
  button: "Explore the area",
  newTab: "opens in a new tab",
  maps: { title: "Google Maps satellite", note: "The parcel from above" },
  earth: { title: "Google Earth 3D", note: "The surroundings in 3D" },
  area: { title: "3D area view", note: "Google 3D imagery of the area, in this page" },
} as const;

export const AREA_VIEW = {
  title: "Google 3D imagery of the area",
  around: (parcelId: string) => `Around parcel ${parcelId}`,
  boundary: "The gold line is the parcel boundary.",
  stagedBoundary: "The gold line is the demo's stand-in boundary, not a surveyed lot.",
  close: "Close",
  loading: "Loading Google 3D imagery…",
  failed: "Google 3D imagery could not be loaded. The links above still open the area in Google Maps and Google Earth.",
  mapLabel: "Google 3D imagery around the parcel",
} as const;

// ---------- Ledger ----------

export const CHECK_TITLES: Record<CheckKind, string> = {
  zoning: "Can you build here?",
  flood: "Flood",
  access: "Road access",
  utilities: "Water & sewer",
  easements: "Easements",
  sellerAuthority: "Seller authority",
  survey: "Survey",
  septic: "Septic",
  closing: "Closing",
};

export const LEDGER = {
  title: "Ledger",
  lede: "Each check on this parcel, who decides it, and whether that decision is on-chain.",
  stagedTag: "Staged demo data",
  stagedNote:
    "The closing statuses are a staged example of how a held closing reads. They are not read from the chain.",
  biggest: "Biggest open question",
  signs: "Signs",
  confirms: "Confirms",
  notOnChain: "Not on-chain yet",
  signature: "Signature",
  copy: "Copy signature",
  copied: "Copied",
  details: "Details",
  steps: ["Evidence", "Review", "On-chain"],
  stepStates: { done: "done", current: "in progress", todo: "not yet" },
  empty: "No report is recorded for this parcel yet.",
} as const;

const ROLE_NAMES: Record<ReviewerRole, string> = {
  title: "title",
  survey: "survey",
  septic: "septic",
};

export const ESCROW = {
  title: "Escrow",
  unit: "test USDC",
  cluster: "Solana devnet",
  staged: "Staged",
  stagedRoles: "Staged roles",
  open: "Open the deal timeline",
  others: "All staged deals on this parcel",
  deal: "Deal",
  loading: "Reading the deal's state…",
  unavailable: "The deal's state could not be loaded, so no closing status is shown here.",
  retry: "Try again",
  signOffs: "Sign-offs",
  state: "State",
  amount: "Deposit",
  address: "Escrow address",
  states: {
    draft: "Draft",
    funded: "Funded",
    held: "Held",
    released: "Released",
    refunded: "Refunded",
  } satisfies Record<DealState, string>,
  verdict: {
    held: (role: ReviewerRole) => `Payout blocked: ${ROLE_NAMES[role]} hold active`,
    heldUnknown: "Payout blocked: a reviewer's hold is active",
    waiting: (count: number) => `Waiting on ${count} sign-off${count === 1 ? "" : "s"}`,
    ready: "All required sign-offs are in",
    released: "Released to the bound seller",
    refunded: "Refunded to the buyer",
  },
} as const;

/** Findings written from confirmed chain state, when the deal has it. */
export const CHAIN_FINDINGS = {
  signedOff: (role: ReviewerRole) =>
    `The ${ROLE_NAMES[role]} reviewer signed this approval against the escrow.`,
  signedLimit: "The approval covers this reviewer's scope only.",
  held: (role: ReviewerRole) => `The ${ROLE_NAMES[role]} reviewer placed a hold on the escrow.`,
  heldLimit: "A hold blocks the payout until it is resolved. It is not a finding of fraud.",
  reviewer: (role: ReviewerRole) => `${ROLE_NAMES[role].charAt(0).toUpperCase()}${ROLE_NAMES[role].slice(1)} reviewer`,
  program: "Escrow program",
  undecided: (role: ReviewerRole, closed: boolean) =>
    closed
      ? `The ${ROLE_NAMES[role]} reviewer did not sign on this deal before it closed.`
      : `The ${ROLE_NAMES[role]} reviewer has not signed on this deal yet.`,
  undecidedLimit: "No decision by this reviewer is recorded on-chain for this deal.",
  undecidedNext: (role: ReviewerRole) => `Waiting on the ${ROLE_NAMES[role]} reviewer's signature.`,
  closedNext: "Nothing further. This deal is closed.",
  closingLimit:
    "This is the escrow's state for one staged deal in test USDC. It is not a deed transfer or a real closing.",
  closing: {
    released: "Every required reviewer signed, and the escrow paid the bound seller.",
    refunded: (held: boolean) =>
      `The escrow returned the deposit to the buyer${held ? " while a reviewer's hold was active" : ""}. Nothing was paid to the seller.`,
    held: "A reviewer's hold is active, so the escrow cannot pay the seller.",
    heldNext: "The reviewer who placed the hold investigates. The buyer can take a refund while it is active.",
    open: (signed: number, required: number, funded: boolean) =>
      `${signed} of ${required} required sign-offs are in. ${funded ? "The deposit is in escrow." : "The escrow is not funded yet."}`,
    readyNext: "Anyone can submit the release. The program pays only the bound seller.",
    waitingNext: "Collect the remaining required sign-offs.",
  },
} as const;

export const INSPECTOR = {
  close: "Close",
  wallet: "Reviewer wallet",
  party: "Reviewer",
  program: "Escrow program",
  outcome: {
    signedOff: "Signed off",
    held: "Held",
    pending: "Waiting on a decision",
  },
  illustration: "How this decision reaches the escrow. Illustration only: it is not on-chain yet.",
  confirmed: "Confirmed on Solana devnet.",
  stagedExample: "Staged example. Not a record retrieved for this parcel.",
  finding: "What we know",
  limitation: "What it does not establish",
  sources: "Sources",
  references: "Where it gets confirmed",
  retrieved: "retrieved",
  effective: "effective",
  next: "Next action",
  who: "Who acts",
  explorer: "View on Solana Explorer",
  unsigned: "This approval hasn't been signed on-chain yet.",
  unrecorded: "This check has no on-chain record yet.",
} as const;

export const TRANSITION = {
  loading: "Loading parcel…",
  skip: "Press any key to skip",
  slot: (slot: number) => `slot ${slot.toLocaleString("en-US")}`,
  slotShort: (slot: number) => slot.toLocaleString("en-US"),
  caption: {
    pending: "Reading the latest Solana devnet slot…",
    live: (slot: number) =>
      `Counting up from Solana devnet slot ${slot.toLocaleString("en-US")}, read as this page opened.`,
    illustrative: "Illustrative slot numbers. The devnet slot could not be read.",
  },
} as const;
