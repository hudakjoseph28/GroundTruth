import type { ReactNode } from "react";

// One small line glyph per check kind, drawn on a 16-unit grid with a 1.4
// stroke. Status is carried by the button around it, never by the glyph.
const GLYPHS: Record<string, ReactNode> = {
  // A house on its lot: what may be built.
  zoning: (
    <>
      <path d="M2.5 7.4 8 2.8l5.5 4.6" />
      <path d="M4 6.3v6.9h8V6.3" />
      <path d="M6.6 13.2V9.8h2.8v3.4" />
    </>
  ),
  flood: (
    <>
      <path d="M1.8 6.2c1.1-.9 2-.9 3.1 0s2 .9 3.1 0 2-.9 3.1 0 2 .9 3.1 0" />
      <path d="M1.8 9.4c1.1-.9 2-.9 3.1 0s2 .9 3.1 0 2-.9 3.1 0 2 .9 3.1 0" />
      <path d="M1.8 12.6c1.1-.9 2-.9 3.1 0s2 .9 3.1 0 2-.9 3.1 0 2 .9 3.1 0" />
    </>
  ),
  // Reeds over water.
  environmental: (
    <>
      <path d="M8 11.5V3.2M5.2 11.5c0-3-1-5-2.4-6.4M10.8 11.5c0-3 1-5 2.4-6.4" />
      <path d="M2 13.6c1-.7 2-.7 3 0s2 .7 3 0 2-.7 3 0 2 .7 3 0" />
    </>
  ),
  // A road running into the distance, with its center line.
  access: (
    <>
      <path d="M2.2 13.6 6.4 2.4M13.8 13.6 9.6 2.4" />
      <path d="M8 2.8v1.5M8 6.8v1.8M8 11.2v2.2" />
    </>
  ),
  // A drop for water, and the pipe that brings it.
  utilities: (
    <>
      <path d="M8 2.4s-3.6 4.1-3.6 6.7a3.6 3.6 0 0 0 7.2 0C11.6 6.5 8 2.4 8 2.4Z" />
      <path d="M6.4 9.5a1.7 1.7 0 0 0 1.4 1.5" />
    </>
  ),
  // A strip across the lot that someone else may use.
  easements: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" />
      <path d="M2.5 9.8 9.8 2.5M6.2 13.5l7.3-7.3" strokeDasharray="1.6 1.6" />
    </>
  ),
  // The person with the right to sell.
  sellerAuthority: (
    <>
      <circle cx="8" cy="5.4" r="2.5" />
      <path d="M3.2 13.5c.6-2.6 2.5-4 4.8-4s4.2 1.4 4.8 4" />
    </>
  ),
  // A boundary with its corner pins.
  survey: (
    <>
      <path d="M3.2 12.2 4.6 3.6l8.2 1.8-1.4 7.2Z" strokeDasharray="1.8 1.4" />
      <circle cx="3.2" cy="12.2" r="1.1" />
      <circle cx="4.6" cy="3.6" r="1.1" />
      <circle cx="12.8" cy="5.4" r="1.1" />
      <circle cx="11.4" cy="12.6" r="1.1" />
    </>
  ),
  // A buried tank and its riser.
  septic: (
    <>
      <path d="M1.8 6.6h12.4" strokeDasharray="1.6 1.4" />
      <rect x="3" y="8.6" width="10" height="4.8" rx="2.4" />
      <path d="M6.6 8.6V4.2h2.8v4.4" />
    </>
  ),
  // A block on the chain, like the ledger's nodes.
  closing: (
    <>
      <path d="M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9Z" />
      <path d="M8 8 2.6 4.9M8 8l5.4-3.1M8 8v6.2" />
    </>
  ),
};

/** A check kind's glyph; a kind this build does not know gets a plain dot. */
export function CheckIcon({ kind }: { kind: string }) {
  return (
    <svg
      className="check-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[kind] ?? <circle cx="8" cy="8" r="2.4" />}
    </svg>
  );
}
