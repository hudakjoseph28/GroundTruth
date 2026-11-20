import { stagedDeal, stagedLiveDeal, stagedReleasedDeal } from "@groundtruth/shared";
import { dealPath } from "../data/dealSource";
import { sampleParcelPath } from "../data/parcelSource";

// Copy for /roadmap. Only "Now" is built; every other card is a plan and says
// so on its face. No counts, partners, or results appear here: there is no
// pilot yet. The pilot metrics are the three named in docs/context/Problem.md
// ("Proof, pilot, and beyond"). docs/phases/04-pitch/Devpost.md, "What's next
// for GroundTruth", says the same thing; change both together.

export type StageId = "now" | "next" | "later";

export type RoadmapIcon =
  | "search"
  | "report"
  | "escrow"
  | "reviewer"
  | "live"
  | "pilot"
  | "mainnet"
  | "qr"
  | "credential"
  | "checks"
  | "nation"
  | "deed"
  | "identity"
  | "milestone"
  | "ask"
  | "alert";

export interface RoadmapLink {
  label: string;
  to: string;
}

export interface RoadmapItem {
  id: RoadmapIcon;
  title: string;
  /** Exactly two plain-English sentences. */
  body: readonly [string, string];
  /** Where the live feature is. Only "Now" items have them. */
  links?: readonly RoadmapLink[];
}

export interface RoadmapStage {
  id: StageId;
  name: string;
  label: string;
  line: string;
  items: readonly RoadmapItem[];
}

export const ROADMAP = {
  pageTitle: "Roadmap",
  eyebrow: "Roadmap",
  title: "What's next",
  lede: "What runs today on Solana devnet, what a first pilot would add, and what comes after it. Only the first section is built. Everything under Next and Later is a plan.",
  planned: "Planned · not built yet",
  live: "Live on devnet",
  illustration: "Illustration",
  jump: "Sections",
} as const;

const heldDeal = dealPath(stagedDeal.id);
const clearedDeal = dealPath(stagedReleasedDeal.id);
const liveDeal = dealPath(stagedLiveDeal.id);

export const STAGES: readonly RoadmapStage[] = [
  {
    id: "now",
    name: "Now",
    label: "Live today",
    line: "Built, deployed, and running on Solana devnet with test USDC and staged reviewer wallets.",
    items: [
      {
        id: "search",
        title: "Ohio parcel search and the 3D land view",
        body: [
          "Search any Ohio parcel by address or parcel ID, using the state's OGRIP boundaries for all 88 counties.",
          "Open a lot to see its boundary in gold on real aerial imagery and terrain, and turn it in 3D.",
        ],
        links: [
          { label: "Search Ohio", to: "/search" },
          { label: "Open the Franklin parcel", to: sampleParcelPath() },
        ],
      },
      {
        id: "report",
        title: "Sourced reports, check by check",
        body: [
          "Flood, wetlands, septic soils and public water and sewer service are read from FEMA, the National Wetlands Inventory, the USDA soil survey and EPA wherever those maps cover the lot.",
          "Zoning, road access and stream setbacks are read in Franklin County so far, and any check without a record says No answer yet instead of guessing.",
        ],
        links: [{ label: "Read the Franklin report", to: sampleParcelPath() }],
      },
      {
        id: "escrow",
        title: "Solana escrow: holds block payouts, approvals release",
        body: [
          "A reviewer's hold makes the payout fail on-chain, and the test USDC stays in the vault.",
          "Once every required reviewer approves, the program releases the exact USDC amount the deal was opened with.",
        ],
        links: [
          { label: "The held deal", to: heldDeal },
          { label: "The released deal", to: clearedDeal },
        ],
      },
      {
        id: "reviewer",
        title: "Reviewer portal, documents, and Verify on-chain",
        body: [
          "Title, survey and septic reviewers approve or hold from their wallet, on a phone too through the Phantom app's browser.",
          "Each document's hash is written on-chain, and Verify on-chain reads the escrow account straight from Solana devnet to check the page against it.",
        ],
        links: [
          { label: "Reviewer portal", to: "/review" },
          { label: "Verify a deal", to: `${clearedDeal}#verify` },
        ],
      },
      {
        id: "live",
        title: "Live updates and an owner callback",
        body: [
          "QuickNode Streams sends each confirmed escrow transaction to the backend, and the deal's timeline updates without a reload.",
          "An ElevenLabs voice agent's call to the owner on record is saved on the held deal's timeline as evidence, never as an approval.",
        ],
        links: [
          { label: "The stage deal's timeline", to: `${liveDeal}#timeline` },
          { label: "The owner callback", to: `${heldDeal}#timeline` },
        ],
      },
      {
        id: "ask",
        title: "Ask this lot",
        body: [
          "Ask a question in plain English or by microphone and get an answer drawn only from that parcel report's checks and sources.",
          "Every answer cites its check and record, and an uncovered question says I don't know and names the responsible party.",
        ],
        links: [{ label: "Ask the Franklin parcel", to: sampleParcelPath() }],
      },
    ],
  },
  {
    id: "next",
    name: "Next",
    label: "Pilot",
    line: "What a first real pilot would need. None of it is built, and no pilot or partner exists yet.",
    items: [
      {
        id: "pilot",
        title: "A title or closing company pilot in Ohio",
        body: [
          "Run real deals with an Ohio title or closing company, with its licensed staff as the reviewers and private, signed-in evidence handling in place first.",
          "The professionals, not us, would define when money is released and when it is refunded.",
        ],
      },
      {
        id: "mainnet",
        title: "Mainnet with real USDC and sponsored fees",
        body: [
          "Move the escrow from devnet test funds to Solana mainnet and real USDC.",
          "Network fees would be sponsored, so a reviewer never needs to hold SOL to sign.",
        ],
      },
      {
        id: "qr",
        title: "Pay with Solana Pay",
        body: [
          "The buyer funds the escrow by scanning a QR code with their wallet.",
          "The amount and the escrow address would come filled in, so nothing has to be typed or copied.",
        ],
      },
      {
        id: "credential",
        title: "Verified reviewer credentials",
        body: [
          "Licensed title, survey and septic professionals would carry a credential that can be checked on-chain.",
          "The escrow would count an approval only from a wallet that holds the right one.",
        ],
      },
      {
        id: "checks",
        title: "More local checks",
        body: [
          "Zoning for more Ohio counties, and the distance to water and sewer mains in more cities than the few that publish their main maps.",
          "Easements would be read from recorded documents, each one cited like every other check.",
        ],
      },
    ],
  },
  {
    id: "later",
    name: "Later",
    label: "Scale",
    line: "Where the product could go once a pilot shows it helps. Not built.",
    items: [
      {
        id: "nation",
        title: "Nationwide parcels",
        body: [
          "Parcel boundaries beyond Ohio would come from a nationwide provider such as Regrid.",
          "FEMA's flood maps are already a national service, so the flood check would carry over wherever FEMA has mapped.",
        ],
      },
      {
        id: "deed",
        title: "Deed recording handoff",
        body: [
          "After the escrow releases, the deed would be handed to the county's e-recording system.",
          "The recording receipt would join the deal's timeline beside the payout.",
        ],
      },
      {
        id: "identity",
        title: "Seller identity verification",
        body: [
          "A trusted identity partner would confirm the seller is the owner on record.",
          "It would be a step inside the closing flow, finished before any reviewer can approve.",
        ],
      },
      {
        id: "milestone",
        title: "Milestone payments and deadlines",
        body: [
          "A deal could be split into staged payments, each with its own deadline.",
          "If a review never arrives in time, the buyer's money would be refunded automatically.",
        ],
      },
      {
        id: "alert",
        title: "Saved lots with alerts",
        body: [
          "Save a lot and get an alert when its public records change, such as a new flood map.",
          "Each alert would link to the source that changed.",
        ],
      },
    ],
  },
];

/** The pilot's measures, from docs/context/Problem.md. No results: there is no pilot yet. */
export const MEASURE = {
  eyebrow: "Pilot",
  title: "How we'll measure the pilot",
  note: "These are the measures we would track. There is no pilot yet, so there are no results to show.",
  metrics: [
    {
      title: "Time to the first actionable finding",
      line: "How long from opening a lot until the buyer has one concrete thing to do next.",
    },
    {
      title: "Findings with traceable evidence",
      line: "The share of material findings that link to the public record or sign-off behind them.",
    },
    {
      title: "Buyers who can explain a pause",
      line: "When a deal is paused, whether the buyer can say why and what has to happen next.",
    },
  ],
} as const;
