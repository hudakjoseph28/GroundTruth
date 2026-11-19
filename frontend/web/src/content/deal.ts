import type {
  DealState,
  Hold,
  ReviewerRole,
  TimelineEventType,
} from "@groundtruth/shared";

// Copy for the deal page and the 404 page. Claims follow
// docs/context/Problem.md: the page reports what the API projected from
// confirmed chain events and says nothing the deal does not show. Roles are
// staged wallets and the money is test USDC, and the page says so.

export const DEAL_PAGE = {
  eyebrow: "Deal",
  staged: "Solana devnet · test USDC · reviewer wallets",
  unit: "test USDC",
  amount: "In this deal",
  status: "Status",
  next: "Next",
  parcel: {
    label: "Parcel",
    open: (parcelId: string) => `Parcel ${parcelId}`,
    county: (name: string) => `${name} County`,
  },
  escrowAddress: "Escrow account",
  dealId: "Deal",
  title: (state: string) => `Deal · ${state}`,
  loading: "Loading the deal…",
  retry: "Try again",
  missing: {
    title: "Deal not found",
    body: "No public deal has this ID.",
    home: "Go to the homepage",
    parcel: "Open the Franklin parcel",
  },
} as const;

export const STATE_LABELS: Record<DealState, string> = {
  draft: "Draft",
  funded: "Funded",
  held: "Held",
  released: "Released",
  refunded: "Refunded",
};

export const MONEY_FLOW = {
  eyebrow: "Money flow",
  title: "Where the money is",
  buyer: "Buyer",
  buyerDetail: "Source wallet",
  vault: "Escrow vault",
  vaultDetail: "Program controlled",
  locked: "Locked by reviewer hold",
  seller: "Seller",
  sellerDetail: "Bound payout",
  unit: "test USDC",
  statement: {
    draft: (amount: string) =>
      `${amount} test USDC remains with the buyer until this deal is funded.`,
    funded: () => "The funds are in the escrow vault.",
    held: () => "The funds are locked in the escrow vault.",
    released: (amount: string) => `The seller received ${amount} test USDC.`,
    refunded: (amount: string) =>
      `The buyer received ${amount} test USDC back.`,
  } satisfies Record<DealState, (amount: string) => string>,
} as const;

const ROLE: Record<ReviewerRole, string> = {
  title: "title",
  survey: "survey",
  septic: "septic",
};

export const ROLE_LABELS: Record<ReviewerRole, string> = {
  title: "Title",
  survey: "Survey",
  septic: "Septic",
};

export const HOLD_REASONS: Record<Hold["reasonCode"], string> = {
  SELLER_IDENTITY_DISPUTED: "Seller identity disputed",
  TITLE_EXCEPTION: "Title exception",
  SITE_REVIEW_FAILED: "Site review failed",
  OTHER: "Reviewer's hold",
};

function list(roles: readonly ReviewerRole[]): string {
  const names = roles.map((role) => ROLE[role]);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** The one line beside the status, and the sentence and next step under it. */
export const VERDICT = {
  draft: {
    headline: "Not funded yet",
    message: "No funds are in escrow for this deal.",
    next: "The buyer deposits the amount into escrow.",
  },
  waiting: {
    headline: (count: number) =>
      `Waiting on ${count} sign-off${count === 1 ? "" : "s"}`,
    message: (count: number) =>
      `The deposit is in escrow. It cannot move until ${count} more required reviewer${count === 1 ? " signs" : "s sign"}.`,
    next: (roles: readonly ReviewerRole[]) =>
      `The ${list(roles)} reviewer${roles.length === 1 ? " signs their approval" : "s each sign their approval"}.`,
  },
  ready: {
    headline: "All required reviews signed · Ready to release",
    message:
      "Every required reviewer has signed and no hold is active. The escrow can now pay the bound seller.",
    next: "Anyone can submit the release. The program pays only the bound seller.",
  },
  held: {
    headline: (reason: string) => `Closing paused · ${reason}`,
    headlineUnknown: "Closing paused · A reviewer's hold is active",
    message: (role: ReviewerRole | undefined) =>
      `${role ? `The ${ROLE[role]} reviewer's` : "A reviewer's"} hold is active, so the escrow cannot pay the seller.`,
    next: (role: ReviewerRole | undefined) =>
      `${role ? `The ${ROLE[role]} reviewer` : "The reviewer"} investigates. The buyer can take a refund while the hold is active.`,
  },
  released: {
    headline: "Payment released",
    message: (amount: string) =>
      `Every required reviewer signed, and the escrow paid ${amount} test USDC to the bound seller.`,
    next: "Nothing further. This deal is closed.",
  },
  refunded: {
    headline: "Refunded to the buyer",
    message: (amount: string, held: boolean) =>
      `The escrow returned ${amount} test USDC to the buyer${held ? " while a reviewer's hold was active" : ""}. Nothing was paid to the seller.`,
    next: "Nothing further. This deal is closed.",
  },
} as const;

export const REVIEWERS = {
  title: "Required reviewers",
  count: (signed: number, required: number) =>
    `${signed} of ${required} signed`,
  role: (role: ReviewerRole) => `${ROLE_LABELS[role]} reviewer`,
  status: {
    signed: "Signed",
    held: "Hold placed",
    waiting: "Waiting",
    notSigned: "Did not sign",
  },
  receipt: "Receipt",
  wallet: "Reviewer wallet",
} as const;

export const HOLD = {
  active: "Active hold",
  ended: "Hold on this deal",
  endedNote: "This hold was still active when the deal ended.",
  placedBy: (role: ReviewerRole) => `Placed by the ${ROLE[role]} reviewer`,
  receipt: "Hold transaction",
} as const;

export const TIMELINE = {
  title: "Timeline",
  order: "Newest first",
  empty: "Nothing has happened on this deal yet.",
  /** The deal's record in GroundTruth, before anything exists on-chain. */
  drafted: "Deal set up",
  types: {
    dealCreated: "Escrow opened",
    funded: "Deposit",
    evidenceReceived: "Evidence received",
    approvalSigned: "Approval signed",
    holdPlaced: "Hold placed",
    releaseRejected: "Release rejected",
    released: "Payment released",
    refunded: "Refund",
  } satisfies Record<TimelineEventType, string>,
  blocked: "Blocked · no money moved",
  confirmed: "Confirmed on Solana devnet",
  offChain: "Off-chain record · not a chain event",
  explorer: "View transaction",
  newTab: "opens Solana Explorer in a new tab",
  fresh: "New",
  announce: (message: string) => `New on the timeline: ${message}`,
} as const;

export const LIVE = {
  on: "Live",
  detail: "Checking for updates every 2 seconds",
  updated: (time: string) => `Updated ${time}`,
  stale: "Reconnecting. Showing the last confirmed state.",
} as const;

export const HANDOFF = {
  title: "Open on your phone",
  body: "Scan to follow this deal live. No app or wallet needed.",
  alt: (url: string) => `QR code for ${url}`,
} as const;

export const SOLANA_PAY = {
  title: "Fund with Solana Pay",
  body: (amount: string) =>
    `Scan with a Solana Pay wallet set to devnet to move ${amount} test USDC from the buyer into escrow.`,
  buyerOnly: (wallet: string) =>
    `Only the deal's buyer wallet (${wallet}) can fund it. Any other wallet is refused.`,
  open: "Open in wallet",
  link: "Request link",
  signing:
    "GroundTruth builds the transaction; your wallet signs and sends it. The API never signs, and the program checks every rule.",
  alt: (url: string) => `Solana Pay QR code for ${url}`,
} as const;

export const TEXT_ALERTS = {
  title: "Text me updates",
  body: "Get a text when this deal is funded, a hold is placed, a release is rejected, or the payment is released.",
  label: "Mobile number",
  placeholder: "614 555 0123",
  hint: "US numbers need no country code. Others start with +.",
  consent:
    "I agree to receive staged demo texts about this deal. Message and data rates may apply. Reply STOP to opt out.",
  note: "Staged demo. Your number is stored only for this deal and used only for these texts. It is never shown on this page.",
  submit: "Text me updates",
  sending: "Saving…",
  needConsent: "Tick the box to agree to the texts first.",
  needNumber: "Enter a mobile number.",
  done: (masked: string) => `Texts are on for ${masked}.`,
  doneNext:
    "You will get a text for each new confirmed event on this deal, with a link to the transaction on Solana Explorer.",
  another: "Use another number",
} as const;

export const NOT_FOUND = {
  title: "Page not found",
  body: "Nothing lives at this address. It may have been mistyped, or the link may be out of date.",
  home: "Go to the homepage",
  search: "Search for a parcel",
  parcel: "Open the Franklin parcel",
} as const;

/** The deal's parcel, drawn as a small block of land beside the summary. */
export const DEAL_LAND = {
  /** Read by screen readers in place of the picture. */
  description: (parcelId: string) =>
    `Aerial imagery of parcel ${parcelId} on its terrain, with the county parcel boundary outlined.`,
  loading: "Loading the parcel picture…",
  seal: {
    held: "Payout held",
    released: "Payout released",
  },
  /** What the boundary's color means, in words, for the states that change it. */
  boundary: {
    held: "Boundary in red while a reviewer hold locks the payout.",
    released: "Boundary in green: the payout reached the bound seller.",
  },
} as const;

/** Stage mode (`/deals/:id?stage=1`): the same deal, sized for a projector. */
export const STAGE = {
  eyebrow: "GroundTruth deal",
  staged: "Solana devnet · test USDC · staged reviewer wallets",
  reviewers: "Required sign-offs",
  count: (signed: number, required: number) =>
    `${signed} of ${required} signed`,
  status: {
    signed: "Signed",
    held: "Hold placed",
    waiting: "Waiting",
    notSigned: "Did not sign",
  },
  stagedWallet: "Staged wallet",
  arrived: (role: string, status: string) => `${role} reviewer: ${status}.`,
  paid: "Paid to seller",
  paidLine: (amount: string) => `Paid to seller: ${amount} test USDC`,
  paidNote:
    "Confirmed on Solana devnet. The program paid only the bound seller.",
  refunded: "Refunded to buyer",
  explorer: "View the payment on Solana Explorer",
  escrowExplorer: "View the escrow account on Solana Explorer",
  phone: "Follow on your phone",
  phoneBody: "Scan for this deal's live page. No app or wallet needed.",
  fullScreen: "Full screen",
  exit: "Exit stage mode",
  open: "Stage mode for a projector",
} as const;
