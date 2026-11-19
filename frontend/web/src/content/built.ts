/**
 * What the product actually runs on. Each line is the job that tool does here.
 * A logo is included only when a real brand mark was available; the rest are
 * set as wordmarks rather than drawn.
 */
export const BUILT = {
  eyebrow: "Built with",
  title: "Built with",
  lede: "Real parcel data, a real escrow on Solana, and a voice agent that calls the owner.",
  program: "Program on Explorer",
  programHref:
    "https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet",
} as const;

export interface BuiltLogo {
  src: string;
  /** Brand color for the monochrome mark on hover. */
  color: string;
}

export interface BuiltTool {
  name: string;
  line: string;
  href: string;
  /** Monochrome marks, tinted off-white until hover. */
  logos?: readonly BuiltLogo[];
  /** A mark that already has its own colors, such as USDC. */
  colorLogo?: string;
  /** A second site, when one tile names two tools. */
  also?: { label: string; href: string };
  /** Shown under the Solana tile. */
  program?: boolean;
}

export const BUILT_TOOLS: readonly BuiltTool[] = [
  {
    name: "Solana",
    line: "Holds the escrow. Every approval, hold, and release is a signed transaction on devnet.",
    href: "https://solana.com",
    logos: [{ src: "/logos/solana.svg", color: "#9945FF" }],
    program: true,
  },
  {
    name: "USDC (Circle)",
    line: "The deposit, in test USDC on devnet.",
    href: "https://www.circle.com/usdc",
    colorLogo: "/logos/usdc.svg",
  },
  {
    name: "Anchor",
    line: "The framework our escrow program is written in.",
    href: "https://www.anchor-lang.com",
  },
  {
    name: "QuickNode Streams",
    line: "Sends each confirmed escrow transaction to our backend within about 1–2 s.",
    href: "https://www.quicknode.com/streams",
  },
  {
    name: "ElevenLabs + Twilio",
    line: "The AI voice agent that calls the owner on record.",
    href: "https://elevenlabs.io",
    logos: [
      { src: "/logos/elevenlabs.svg", color: "#ffffff" },
      { src: "/logos/twilio.svg", color: "#F22F46" },
    ],
    also: { label: "Twilio", href: "https://www.twilio.com" },
  },
  {
    name: "OGRIP",
    line: "Ohio's statewide parcel boundaries, all 88 counties.",
    href: "https://gis.ohio.gov/",
  },
  {
    name: "FEMA",
    line: "Live flood-zone check on every parcel.",
    href: "https://www.fema.gov/flood-maps",
  },
  {
    name: "Cursor",
    line: "Where we built it.",
    href: "https://cursor.com",
    logos: [{ src: "/logos/cursor.svg", color: "#ffffff" }],
  },
  {
    name: "Grok",
    line: "Our AI teammate for prompts and planning.",
    href: "https://x.ai/grok",
  },
  {
    name: "Railway + Vercel",
    line: "API and website hosting.",
    href: "https://railway.com",
    logos: [
      { src: "/logos/railway.svg", color: "#ffffff" },
      { src: "/logos/vercel.svg", color: "#ffffff" },
    ],
    also: { label: "Vercel", href: "https://vercel.com" },
  },
];
