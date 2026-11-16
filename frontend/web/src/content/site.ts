import { stagedDeal } from "@groundtruth/shared";

// Copy and links for the shell every page shares: header, mobile menu, footer.
// Nothing here is invented: the repository is this project's own, and anything
// we do not have yet is a visible TODO instead of a made-up link.

export const REPO_URL = "https://github.com/hudakjoseph28/UBC-Hackathon";

export const SITE = {
  name: "GroundTruth",
  home: "GroundTruth home",
  skip: "Skip to content",
  newTab: "opens in a new tab",
} as const;

/** Sections of the homepage the header links to. */
export const NAV = [
  { label: "How it works", hash: "how-it-works" },
  { label: "Escrow", hash: "escrow" },
  { label: "For reviewers", hash: "reviewers" },
] as const;

export const DOCS = { label: "Docs", href: REPO_URL, note: "GitHub" } as const;

export const DEMO = { label: "Try the demo" } as const;

export const MENU = {
  open: "Menu",
  close: "Close menu",
  title: "Menu",
  navLabel: "Main",
} as const;

// The chip says "live" only after Solana devnet has answered this page. The
// parcels and deals shown on the site are staged either way, and it says so.
export const NETWORK = {
  name: "Devnet",
  live: "live",
  preview: "preview",
  liveTitle: (slot: number) =>
    `Solana devnet answered this page at slot ${slot.toLocaleString("en-US")}. Parcels and deals on this site are staged.`,
  previewTitle:
    "This page has not reached Solana devnet. Parcels and deals on this site are staged.",
} as const;

export const FOOTER = {
  columns: {
    product: "Product",
    developers: "Developers",
    project: "Project",
    legal: "Legal",
  },
  demoParcel: "Demo parcel",
  github: { label: "GitHub", href: REPO_URL },
  dataContract: {
    label: "Data contract",
    href: `${REPO_URL}/blob/main/docs/architecture/DataContract.md`,
  },
  mint: {
    label: "Devnet USDC mint",
    address: stagedDeal.mint,
    copy: "Copy the devnet USDC mint address",
  },
  hackathon: "UBC 2026 hackathon",
  devpost: { label: "Devpost", todo: "TODO: add link" },
  team: { label: "Team", href: `${REPO_URL}#team-and-roles` },
  legal:
    "GroundTruth is decision support and closing coordination. It is not a legal opinion on whether you can build, a title search or title insurance, a survey, an identity check, or a deed transfer.",
  built: "Built on Solana · Settled in USDC",
  disclaimer:
    "Devnet preview. Not legal, title, or financial advice. GroundTruth surfaces records and professional sign-offs; it doesn't replace them.",
} as const;
