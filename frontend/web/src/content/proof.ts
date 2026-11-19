import {
  GROUNDTRUTH_PROGRAM_ID,
  stagedDeal,
  stagedLiveDeal,
  stagedReleasedDeal,
} from "@groundtruth/shared";
import { explorerAddressUrl, explorerTxUrl } from "../data/ledger";
import { REPO_URL } from "./site";

// Copy for /proof: every claim the demo makes, each beside the link that lets
// a judge check it. Nothing here is new. Each claim, number, signature, and
// time is copied from docs/phases/04-pitch/Devpost.md or QA-Proof.md, and the
// screenshots are docs/proof/*.png. proof.test.ts fails if a link or quoted
// value here is missing from those files.

export interface EvidenceLink {
  label: string;
  href: string;
}

export interface Claim {
  text: string;
  evidence: readonly EvidenceLink[];
  /** What the evidence does not establish, when the source says so. */
  limit?: string;
}

export interface BalanceRow {
  step: string;
  /** Transaction signatures, in order. */
  signatures: readonly string[];
  buyer: string;
  vault: string;
  seller: string;
  /** The rejected release: drawn as the row that did not move money. */
  rejected?: boolean;
}

const DOCS_BASE = `${REPO_URL}/blob/main/docs`;

export const PROOF_DOCS = {
  devpost: {
    label: "Devpost.md",
    href: `${DOCS_BASE}/phases/04-pitch/Devpost.md`,
  },
  qa: {
    label: "QA-Proof.md",
    href: `${DOCS_BASE}/phases/04-pitch/QA-Proof.md`,
  },
  folder: { label: "docs/proof", href: `${REPO_URL}/tree/main/docs/proof` },
  quicknodeShot: {
    label: "quicknode-stage-prep.png",
    href: `${DOCS_BASE}/proof/quicknode-stage-prep.png`,
  },
  elevenlabsShot: {
    label: "elevenlabs-owner-callback.png",
    href: `${DOCS_BASE}/proof/elevenlabs-owner-callback.png`,
  },
} as const;

const tx = (label: string, signature: string): EvidenceLink => ({
  label,
  href: explorerTxUrl(signature),
});
const account = (label: string, address: string): EvidenceLink => ({
  label,
  href: explorerAddressUrl(address),
});

/** Transaction signatures, exactly as Devpost.md links them. */
export const SIGNATURES = {
  deploy:
    "4jSbDspA2EBfhghHxmiZJ5mkce4Ho4CZ34aqawPdMVJzDGjJxXdRfxjjMREgiKdnfpxeDXVgUqpECTwb8T39P8NU",
  held: {
    initialize:
      "4ZscUVnfZ3W5ukt7H8tSBrQZNrvY5Hu3Qq9oRNJeTbHj61UvwcPAAssZJ4DtaxzeVQAb2rcFPYyRGWsQuaoPKjNv",
    fund: "grkKU9YqV1xpAkHySCjdhLgavpd5dW3mJsvbiZ1tjEyvuHC9T373Hmscubsm8UapaA7j93pHrseJMepw1C3dd74",
    hold: "5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib",
    rejectedRelease:
      "Rro8WAjpc8w7s2taWhSeZaCUnxkLjN3Vx3iJCJdDboGTUVem8ZaX63FFvJhWaHFMHVLJ6EQwc4qG7H8r4MnvwGz",
    refund:
      "SgPJ9jQCNZfHrp1ipKK3tQ6LYwSaGS9qdhpkshUt8zNJW9JJ2s5V8B9WYuzq5nxLy3sWGvT94ZduEvSDgMzyaSo",
  },
  released: {
    initialize:
      "ZFo3g36XTKCaVkLJKpgD2S2sGf4zqNVp3tsFkpSPeJ9mNyfJbWCHtjPDbAV8oUvdXGZs7Ag7n9jTxGbRhh2hM9M",
    fund: "4a2HxSta9rKio7BsFMVzTvKfA9yBBSzr9uFzJEtDDNG3wJi7hzsJCgkM8SuCt3qQfkUCg4VUM8VCwxHykhDwtxgR",
    approvals: [
      "5Rnsas4nLpLJM8ss63dB2768wbTRJteEWBMCE7Z4njzE1JNk547WQ7nQdp38W8Go25tX2YsQtvvn5nRNdEV5jBqt",
      "3D8ahBLYuhCiZfNZcMgQZZ3UQnHeoNcBFCgu9NLbyao1TZUMCKBn4RjWcKYJhQupNiZy1JiXnyN8UUARFM57jL9P",
      "7tnvjTxYw6vu7xFKCDTJ4fJGjerS6SCJ3QfSkFn3N916bXaBVEmBnrYwrF9hHSFyCurox1Kct9YdcJGxm4XS2fb",
    ],
    release:
      "5kWpcHzaj1gic1gAehkJcQztexDn2jL2Y765WSXjEvRiFrDmDkYiy5EwY4gYSeeJHo9C6DGnAXrQ9EWDPZhvvHdC",
  },
  live: {
    initialize:
      "jmK7fg1PBNa2kYfqbvaDJ3sNWCBSUM4gAbEp529M5QHYeg145EF9RpKGaHKThkZ9PGt2Q9o1jDRFG2ny2GApPeE",
    fund: "5waYrx5rD6y7sZttZ73i7H2v1eFyqXvuCkuwxBKC11atb5DQi3CsgHrEyUYrwppxTPPHowg1uxxRejrcaVrJPxH5",
    titleApproval:
      "2VSXvYoKQcaHxfK6V8zCFZE9imyBxE8ZF3b8RK7snsP57HxrWdpnYVWUT8puLoZ53bKzvoas2CyuvBUZeRGvsFPL",
    surveyApproval:
      "Gj327zRzpfPwqmnTW669iuBQ1DK8e1PTWSMoQKmZcvezZZuZTwFded8mea1bHvHsKLDnfYCBS1w4YikYeNsM89V",
  },
} as const;

/** The Anchor IDL's metadata account on devnet. */
const IDL_ACCOUNT = "uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma";

export const ELEVENLABS_CONVERSATION = "conv_9801m7rbaxvye0yrq4jmyzfyq6xz";

export const PROOF_PAGE = {
  title: "Proof",
  eyebrow: "Proof",
  heading: "Every claim, with the link that checks it.",
  lede: "Each line below is something GroundTruth says it did. Beside it is the public record you can open yourself: a Solana Explorer page, a log screenshot, or the government source. Nothing here goes beyond what the project's proof docs record.",
  staged:
    "The deals use staged wallets standing in for the buyer, the seller, and the title, survey, and septic reviewers, and Circle's test USDC on Solana devnet. The parcel records are real.",
  sourcesLabel: "Sources for this page",
  toc: "On this page",
  newTab: "opens in a new tab",
  explorer: "Explorer",
  dealPage: "Open the deal page",
  verifyIntro:
    "Your browser reads this deal's escrow account and vault straight from a public Solana devnet RPC, decodes it with the program's published IDL, and compares it with what the GroundTruth API reports for the deal. No GroundTruth server is involved in the read.",
  dealLoading: "Loading the deal from the GroundTruth API…",
  dealUnavailable:
    "Until the GroundTruth API returns this deal there is nothing to compare against the chain. The Explorer links above do not depend on it.",
  dealRetry: "Try again",
  balances: {
    caption: (deal: string) => `Test USDC after each step, ${deal}`,
    step: "Step",
    tx: "Transaction",
    buyer: "Buyer",
    vault: "Vault",
    seller: "Seller",
    note: "Balances are test USDC after each step, read from the transactions' token balances on the public devnet RPC. Where a step does not touch an account, its value is carried from the steps on either side.",
  },
  screenshot: "Open the full-size screenshot",
} as const;

export const PROGRAM = {
  id: "program",
  title: "The escrow program",
  claims: [
    {
      text: `The Rust and Anchor escrow program is deployed to Solana devnet as ${GROUNDTRUTH_PROGRAM_ID}.`,
      evidence: [
        account("Program on Explorer", GROUNDTRUTH_PROGRAM_ID),
        tx("Deploy transaction", SIGNATURES.deploy),
      ],
    },
    {
      text: "Its published Anchor IDL is identical to the IDL the backend decodes events with.",
      evidence: [account("IDL metadata account", IDL_ACCOUNT)],
    },
  ] satisfies readonly Claim[],
} as const;

export const HELD = {
  id: "held",
  dealId: stagedDeal.id,
  escrowAddress: stagedDeal.escrowAddress,
  title: "Held deal: a reviewer's hold blocks the payout",
  summary:
    "The buyer funded 25 test USDC. The staged title reviewer signed a hold. A release was then attempted and the program rejected it with DealHeld; the buyer then took a refund.",
  claims: [
    {
      text: "A release was attempted after the hold, and the program rejected it with DealHeld (6019): the vault still held 25 and the seller still held 0.",
      evidence: [
        tx("Rejected release on Explorer", SIGNATURES.held.rejectedRelease),
      ],
    },
    {
      text: "The buyer then took a refund: the buyer's balance went back to 40 test USDC and the vault closed.",
      evidence: [tx("Refund on Explorer", SIGNATURES.held.refund)],
    },
  ] satisfies readonly Claim[],
  log: "Error Code: DealHeld. Error Number: 6019. Error Message: Cannot release funds while deal is under active hold.",
  logLabel: "The rejected release's log reads:",
  account: "Held deal account",
  balances: [
    {
      step: "Initialize",
      signatures: [SIGNATURES.held.initialize],
      buyer: "40",
      vault: "0",
      seller: "0",
    },
    {
      step: "Fund",
      signatures: [SIGNATURES.held.fund],
      buyer: "15",
      vault: "25",
      seller: "0",
    },
    {
      step: "Title reviewer places hold",
      signatures: [SIGNATURES.held.hold],
      buyer: "15",
      vault: "25",
      seller: "0",
    },
    {
      step: "Release attempted: rejected, DealHeld (6019)",
      signatures: [SIGNATURES.held.rejectedRelease],
      buyer: "15",
      vault: "25",
      seller: "0",
      rejected: true,
    },
    {
      step: "Buyer refund",
      signatures: [SIGNATURES.held.refund],
      buyer: "40",
      vault: "closed",
      seller: "0",
    },
  ] satisfies readonly BalanceRow[],
} as const;

export const RELEASED = {
  id: "released",
  dealId: stagedReleasedDeal.id,
  escrowAddress: stagedReleasedDeal.escrowAddress,
  title: "Released deal: cleared sign-offs pay the seller",
  summary:
    "On a second deal, the title, survey, and septic reviewers each signed an approval, and the release paid exactly 25 test USDC to the bound seller and closed the vault.",
  claims: [
    {
      text: "The release paid exactly 25 test USDC to the bound seller and closed the vault.",
      evidence: [tx("Release on Explorer", SIGNATURES.released.release)],
    },
  ] satisfies readonly Claim[],
  account: "Released deal account",
  balances: [
    {
      step: "Initialize",
      signatures: [SIGNATURES.released.initialize],
      buyer: "40",
      vault: "0",
      seller: "0",
    },
    {
      step: "Fund",
      signatures: [SIGNATURES.released.fund],
      buyer: "15",
      vault: "25",
      seller: "0",
    },
    {
      step: "Three reviewer approvals",
      signatures: SIGNATURES.released.approvals,
      buyer: "15",
      vault: "25",
      seller: "0",
    },
    {
      step: "Release to the bound seller",
      signatures: [SIGNATURES.released.release],
      buyer: "15",
      vault: "closed",
      seller: "25",
    },
  ] satisfies readonly BalanceRow[],
  notShown:
    "Not shown on devnet: a second release attempt on the released deal. The vault is closed, and the local test suite covers repeated settlement.",
} as const;

export const QUICKNODE = {
  id: "quicknode",
  dealId: stagedLiveDeal.id,
  escrowAddress: stagedLiveDeal.escrowAddress,
  title: "QuickNode Streams: the live stage deal",
  summary:
    "A Solana devnet Stream, filtered to the escrow program, sends confirmed program events to a signed webhook that writes them to the buyer's deal timeline.",
  account: "Stage deal account",
  claims: [
    {
      text: "On Nov 18 the stage deal ran four transactions, in slots 523727603–523727618: initialize, fund, and the title and survey approvals.",
      evidence: [
        tx("Initialize", SIGNATURES.live.initialize),
        tx("Fund", SIGNATURES.live.fund),
        tx("Title approval", SIGNATURES.live.titleApproval),
        tx("Survey approval", SIGNATURES.live.surveyApproval),
      ],
    },
    {
      text: "All four were applied straight from the Stream, with no replay: the API logged quicknode applied for DealInitialized, DealFunded, and both ApprovalSigned events.",
      evidence: [PROOF_DOCS.quicknodeShot],
    },
    {
      text: "Railway's HTTP log shows each webhook arriving 1–2 s after its block (18:57:20–18:57:24 UTC).",
      evidence: [
        { label: "Recorded in Devpost.md", href: PROOF_DOCS.devpost.href },
      ],
      limit:
        "The screenshot's app-log lines are all stamped 13:57:29 EST; the arrival times come from the HTTP log, which is not in the repo. The 1.8–3.3 s first measured on the deal timeline came from polling the timeline API every 1.5 s against whole-second block times, so it includes up to 1.5 s of polling delay.",
    },
  ] satisfies readonly Claim[],
  screenshotAlt:
    "Railway log for the GroundTruth API filtered to “quicknode applied”: four lines stamped 2026-11-18 13:57:29 EST, for ApprovalSigned Gj327z…M89V, DealInitialized jmK7fg…pPeE, DealFunded 5waYrx…PxH5, and ApprovalSigned 2VSXvY…sFPL.",
  screenshotCaption:
    "Railway log: four quicknode applied lines for the stage deal.",
  notStream:
    "The held and released closings above are not Stream deliveries: their timeline rows were backfilled with replay:devnet, because QuickNode backfill needs a paid plan.",
  pending: "Pending: measuring the timeline update on a second device.",
} as const;

export const ELEVENLABS = {
  id: "elevenlabs",
  dealId: stagedDeal.id,
  title: "ElevenLabs: the owner callback",
  summary:
    "The owner callback supplies evidence to a staged title reviewer. The call never approves, holds, releases, or refunds a deal by itself.",
  claims: [
    {
      text: `A real ElevenLabs Agents call to a consenting teammate playing the owner of record (conversation ${ELEVENLABS_CONVERSATION}) ended at 22:10:40 UTC on Nov 18.`,
      evidence: [
        {
          label: "Held deal timeline",
          href: "/deals/staged-devnet-deal#timeline",
        },
      ],
    },
    {
      text: `The API verified its signed post-call webhook and logged “elevenlabs recorded ownerDeniesSale ${ELEVENLABS_CONVERSATION} deal=staged-devnet-deal” at 22:10:54 UTC.`,
      evidence: [PROOF_DOCS.elevenlabsShot],
    },
    {
      text: "The held deal shows it as an Evidence received row: the person reached as the owner on record said they are not selling.",
      evidence: [
        {
          label: "Held deal timeline",
          href: "/deals/staged-devnet-deal#timeline",
        },
      ],
    },
  ] satisfies readonly Claim[],
  after:
    "The call was recorded after that deal's hold and refund, so it appears after them on the timeline and changed no deal state. In a real closing, this callback is what prompts the title reviewer to hold. Only the title reviewer's signature, not the call, is what the escrow program checks.",
  screenshotAlt:
    "Railway log for the GroundTruth API filtered to “elevenlabs AND recorded”: one line stamped 2026-11-18 17:10:54 EST reading elevenlabs recorded ownerDeniesSale conv_9801m7rbaxvye0yrq4jmyzfyq6xz deal=staged-devnet-deal.",
  screenshotCaption:
    "Railway log: the owner callback recorded on the held deal.",
} as const;

const AUDITOR =
  "https://audr-apps.franklincountyohio.gov/redir/Link/Parcel/230-000918";
const ZONING_RESOLUTION =
  "https://www.franklincountyohio.gov/files/assets/public/v/1/edp/documents/zoning-resolution/zoning-resolution-2026.pdf";
const RIGHT_OF_WAY =
  "https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/6";

/** The Franklin section of QA-Proof.md, one claim per bullet, same order. */
export const PARCEL = {
  id: "parcel",
  parcelKey: "ohio:39049:230-000918",
  title: "The golden parcel's sources",
  summary:
    "Each claim the stage demo may make about Franklin County parcel 230-000918, with the exact public source. Unknown checks are not negative findings: they mean GroundTruth has not established a fact from a named source.",
  open: "Open the parcel report",
  checked:
    "Checked 2026-11-16 ET (2026-11-17 UTC); the septic soils claim was added and checked live 2026-11-19 UTC.",
  claims: [
    {
      text: "This is the real OGRIP parcel 230-000918 at 0 SEAMAN RD.",
      evidence: [
        {
          label: "OGRIP statewide parcels",
          href: "https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0/query?where=County%3D%27Franklin%27%20AND%20LocalParcelID%3D%27230-000918%27&outFields=County%2CLocalParcelID%2CStateParcelID%2CStateLUC%2CSitusAddressAll%2CLandArea%2CCurrentTo&returnGeometry=true&outSR=4326&geometryPrecision=7&f=geojson",
        },
      ],
    },
    {
      text: "The county treats the lot as vacant agricultural land.",
      evidence: [
        { label: "Franklin County Auditor", href: AUDITOR },
        {
          label: "OGRIP land use",
          href: "https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0/query?where=County%3D%27Franklin%27%20AND%20LocalParcelID%3D%27230-000918%27&outFields=County%2CLocalParcelID%2CStateLUC&returnGeometry=false&f=json",
        },
      ],
      limit: "Neither record is a site inspection.",
    },
    {
      text: "The legal acreage is 3.015 acres.",
      evidence: [{ label: "Franklin County Auditor", href: AUDITOR }],
    },
    {
      text: "The whole mapped parcel is Rural (R) zoning.",
      evidence: [
        {
          label: "FCEDP zoning districts",
          href: "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEDP_Zoning_Districts_2025_View/FeatureServer/0",
        },
      ],
    },
    {
      text: "Rural zoning permits a one-family dwelling under §302.021 and ordinarily requires at least 2.5 acres per dwelling under §302.041.",
      evidence: [{ label: "2026 Zoning Resolution", href: ZONING_RESOLUTION }],
      limit: "Those provisions alone do not establish buildability.",
    },
    {
      text: "A Rural dwelling lot ordinarily needs 150 feet of frontage/access under §302.042 unless an approved alternative applies.",
      evidence: [{ label: "2026 Zoning Resolution", href: ZONING_RESOLUTION }],
    },
    {
      text: "§302.0391 is only a conditional private-lane path, not proof that this parcel has access.",
      evidence: [{ label: "2026 Zoning Resolution", href: ZONING_RESOLUTION }],
    },
    {
      text: "No mapped county road right-of-way touches the parcel.",
      evidence: [{ label: "County right-of-way layer", href: RIGHT_OF_WAY }],
      limit: "This GIS result cannot reveal a recorded private easement.",
    },
    {
      text: "The nearest mapped road centerline is Seaman Road, about 106 metres away.",
      evidence: [
        {
          label: "FCEO road sections",
          href: "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/FCEO_Road_Sections_Public/FeatureServer/0",
        },
      ],
    },
    {
      text: "About 4.7% of the mapped parcel overlaps the Big Darby riparian-setback layer.",
      evidence: [
        {
          label: "Franklin County stream buffers",
          href: "https://services1.arcgis.com/7r2Wl09a1Apy459r/arcgis/rest/services/Franklin_County_Stream_Buffers/FeatureServer/0",
        },
      ],
      limit: "No permit or buildable-area conclusion.",
    },
    {
      text: "FEMA maps the whole parcel as Zone X, area of minimal flood hazard and outside the mapped SFHA.",
      evidence: [
        {
          label: "FEMA NFHL flood zones",
          href: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
        },
      ],
      limit:
        "Zone X is not zero flood risk or a flood-insurance determination.",
    },
    {
      text: "FEMA's panel layer returns Franklin panel 39049C0290K effective 2008-06-17 and Madison panel 39097C0190E effective 2023-11-16 for this parcel.",
      evidence: [
        {
          label: "FEMA NFHL panels",
          href: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/3/query?geometry=-83.248572451%2C39.883872187&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FIRM_PAN%2CEFF_DATE&returnGeometry=false&f=json",
        },
      ],
    },
    {
      text: "USDA SSURGO maps three soil map units under the parcel, all “Very limited” for septic-tank absorption fields: Ko (Kokomo silty clay loam, 0–2% slopes) 46.05%, CrB (Crosby silt loam, 2–6% slopes) 38.31%, CeB2 (Celina silt loam, 2–6% slopes, eroded) 15.64%.",
      evidence: [
        {
          label: "USA Soils Map Units (USDA NRCS gSSURGO)",
          href: "https://services5.arcgis.com/7weheFjxuNkGGiZi/arcgis/rest/services/USA_Soils_Map_Units/FeatureServer/0",
        },
      ],
      limit:
        "A soil rating does not show that a septic system will or will not work; only Franklin County Public Health's site and soil evaluation can.",
    },
    {
      text: "Utilities and recorded easements remain unresolved.",
      evidence: [
        {
          label: "Franklin County Public Health permits",
          href: "https://myfcph.org/forms-permits/",
        },
        { label: "County right-of-way layer", href: RIGHT_OF_WAY },
      ],
    },
  ] satisfies readonly Claim[],
} as const;

/** The deals with an escrow account a visitor can check from this page. */
export const PROOF_DEALS = [HELD, RELEASED, QUICKNODE] as const;

export const PROOF_SECTIONS = [
  { id: PROGRAM.id, label: "Escrow program" },
  { id: HELD.id, label: "Held deal" },
  { id: RELEASED.id, label: "Released deal" },
  { id: QUICKNODE.id, label: "QuickNode Streams" },
  { id: ELEVENLABS.id, label: "ElevenLabs" },
  { id: PARCEL.id, label: "Golden parcel" },
] as const;

/** For the footer and the homepage. */
export const PROOF_LINK = {
  label: "Proof",
  home: "See every claim with its evidence",
} as const;
