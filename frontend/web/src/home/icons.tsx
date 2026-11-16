import type { ReactNode } from "react";

// Small line icons for the homepage. All decorative: the words beside each
// one carry the meaning.

export type IconName = "record" | "signature" | "escrow" | "buyer" | "reviewer" | "seller";

/** The wireframe block: the same shape as the brand mark and the ledger's nodes. */
export const BLOCK = "M8 1.2 13.9 4.6v6.8L8 14.8 2.1 11.4V4.6Z";
export const BLOCK_EDGES = "M8 8 2.1 4.6M8 8l5.9-3.4M8 8v6.8";

const SHAPES: Record<IconName, ReactNode> = {
  record: (
    <>
      <path d="M3.6 1.8h5.6l3.2 3.2v9.2H3.6Z" />
      <path d="M9.2 1.8V5h3.2M5.8 8.2h4.4M5.8 10.8h4.4" />
    </>
  ),
  signature: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.3 8.2 7.2 10.1 10.8 6.1" />
    </>
  ),
  escrow: (
    <>
      <path d={BLOCK} />
      <path d={BLOCK_EDGES} />
    </>
  ),
  buyer: (
    <>
      <circle cx="8" cy="5.2" r="2.7" />
      <path d="M2.6 14.2c.5-2.9 2.6-4.5 5.4-4.5s4.9 1.6 5.4 4.5" />
    </>
  ),
  reviewer: (
    <>
      <path d="M5.6 3H3.4v11.2h9.2V3h-2.2" />
      <path d="M5.6 1.8h4.8v2.4H5.6ZM5.7 9.5l1.6 1.6 3.1-3.4" />
    </>
  ),
  seller: (
    <>
      <rect x="1.8" y="4" width="12.4" height="9.4" rx="1.4" />
      <path d="M1.8 6.8h12.4M10.4 10.2h1.6" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      {SHAPES[name]}
    </svg>
  );
}

/** A generic dollar-coin mark beside USDC amounts. Not Circle's logo. */
export function CoinMark() {
  return (
    <svg className="coin" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.6" />
      <path d="M12.4 7.6c-.3-.9-1.2-1.4-2.4-1.4-1.4 0-2.4.7-2.4 1.8 0 2.6 5 1.2 5 3.9 0 1.1-1.1 1.9-2.6 1.9-1.3 0-2.3-.6-2.6-1.6M10 4.6v1.6M10 13.8v1.6" />
    </svg>
  );
}

/** A wallet, for the parties and reviewers in the diagrams. */
export function WalletMark() {
  return (
    <svg className="wallet" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.4 5.2V4.4c0-.8.6-1.4 1.4-1.4h7.4v2.2" />
      <rect x="2.4" y="5.2" width="11.2" height="7.8" rx="1.4" />
      <path d="M13.6 7.8h-2.4a1.3 1.3 0 0 0 0 2.6h2.4" />
    </svg>
  );
}

/** A padlock; `open` swings the shackle clear. */
export function LockMark({ open = false }: { open?: boolean }) {
  return (
    <svg className="lock" viewBox="0 0 16 16" aria-hidden="true" data-open={open || undefined}>
      <rect x="3.4" y="7.2" width="9.2" height="6.6" rx="1.3" />
      <path className="lock-shackle" d="M5.5 7.2V5.3a2.5 2.5 0 0 1 5 0v1.9" />
    </svg>
  );
}

/** One step of the pipeline as a wireframe block. `mark` is drawn inside it. */
export function StepBlock({ mark }: { mark: "parcel" | "checks" | "escrow" | "release" }) {
  return (
    <svg className="step-block" viewBox="0 0 16 16" aria-hidden="true">
      <path className="step-block-shell" d={BLOCK} />
      {mark === "parcel" && <path className="step-block-mark" d="M5.4 6.3 9 5.4l1.8 2.3-.9 3-3.6.4-1.5-2.6Z" />}
      {mark === "checks" && <path className="step-block-mark" d="M5.3 8.2 7.2 10.1 10.8 6.1" />}
      {mark === "escrow" && (
        <>
          <path className="step-block-edges" d={BLOCK_EDGES} />
          <circle className="step-block-point" cx="8" cy="8" r="1.4" />
        </>
      )}
      {mark === "release" && <path className="step-block-mark" d="M5 8h5.6M8.4 5.7 10.7 8l-2.3 2.3" />}
    </svg>
  );
}
