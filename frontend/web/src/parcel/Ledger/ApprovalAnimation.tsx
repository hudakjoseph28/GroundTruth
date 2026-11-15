import { INSPECTOR } from "../../content/parcel";

export type Outcome = "signedOff" | "held" | "pending";

const MARKS: Record<Outcome, string> = {
  signedOff: "M-6 0.5 L-1.8 4.6 L6.4 -4.4",
  held: "M-5 -5 L5 5 M5 -5 L-5 5",
  // An hourglass: still waiting.
  pending: "M-4.5 -6 H4.5 L-4.5 6 H4.5 Z",
};

/**
 * A decision travelling from the reviewer's wallet to the escrow program and
 * the answer coming back. The drawn state is the end state; CSS animates up
 * to it, so reduced motion simply shows the result.
 */
export function ApprovalAnimation({
  outcome,
  from,
  confirmed,
}: {
  outcome: Outcome;
  /** Short wallet, or a plain role when no wallet is bound. */
  from: string;
  /** True only when a real signature backs this record. */
  confirmed: boolean;
}) {
  return (
    <figure className="approval" data-outcome={outcome}>
      <svg viewBox="0 0 320 64" aria-hidden="true">
        <line className="approval-line" x1="34" y1="32" x2="286" y2="32" pathLength="1" />
        <circle className="approval-halo" cx="34" cy="32" r="9" />
        <circle className="approval-node" cx="34" cy="32" r="3.2" />
        <circle className="approval-pulse" cx="286" cy="32" r="9" />
        <circle className="approval-halo" cx="286" cy="32" r="9" />
        <circle className="approval-node" cx="286" cy="32" r="3.2" />
        <circle className="approval-packet approval-out" cx="34" cy="32" r="2.6" />
        <circle className="approval-packet approval-back" cx="286" cy="32" r="2.2" />
        <g className="approval-mark" transform="translate(160 32)">
          <circle className="approval-mark-disc" r="14" />
          <circle className="approval-mark-ring" r="14" pathLength="1" />
          <path className="approval-mark-glyph" d={MARKS[outcome]} pathLength="1" />
        </g>
      </svg>
      <div className="approval-labels">
        <p>
          <span>{INSPECTOR.wallet}</span>
          <span className="mono">{from}</span>
        </p>
        <p className="approval-outcome">{INSPECTOR.outcome[outcome]}</p>
        <p>
          <span>{INSPECTOR.program}</span>
          <span className="mono">Solana devnet</span>
        </p>
      </div>
      <figcaption>{confirmed ? INSPECTOR.confirmed : INSPECTOR.illustration}</figcaption>
    </figure>
  );
}
