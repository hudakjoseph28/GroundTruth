import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ESCROW } from "../../content/parcel";
import { dealPath } from "../../data/dealSource";
import { explorerAddressUrl, shortAddress, type EscrowSummary } from "../../data/ledger";
import { CopyButton } from "./CopyButton";

/** First tick, then the gap between ticks, in milliseconds. */
const COUNT_START_MS = 320;
const COUNT_STEP_MS = 260;

/** Counts 0, 1, 2… up to the target once `run` is true. */
function useCountUp(target: number, run: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!run || count >= target) return;
    const timer = window.setTimeout(() => setCount(count + 1), count === 0 ? COUNT_START_MS : COUNT_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [run, count, target]);
  return Math.min(count, target);
}

/** The one escrow behind the deal: how much, what state, and whether money can move. */
export function EscrowStrip({
  escrow,
  counting,
  animated,
}: {
  escrow: EscrowSummary;
  /** True once the page is showing, so the sign-off count can tick up. */
  counting: boolean;
  /** False when the visitor asked for reduced motion: show the final numbers. */
  animated: boolean;
}) {
  const ticked = useCountUp(escrow.signed, counting && animated);
  const signed = animated ? ticked : escrow.signed;

  return (
    <section className="escrow" data-tone={escrow.verdict.tone} aria-labelledby="escrow-title">
      <div className="escrow-head">
        <h3 id="escrow-title">{ESCROW.title}</h3>
        <p>
          <span className="tag">{escrow.staged ? ESCROW.staged : ESCROW.stagedRoles}</span>
          {ESCROW.cluster}
        </p>
      </div>
      <p className="escrow-verdict">{escrow.verdict.text}</p>
      <dl className="escrow-facts">
        <div>
          <dt>{ESCROW.amount}</dt>
          <dd>
            <span className="mono">{escrow.amount}</span> {ESCROW.unit}
          </dd>
        </div>
        <div>
          <dt>{ESCROW.state}</dt>
          <dd>{ESCROW.states[escrow.state]}</dd>
        </div>
        <div>
          <dt>{ESCROW.signOffs}</dt>
          <dd>
            <span className="mono" aria-hidden="true">
              {signed}/{escrow.required}
            </span>
            <span className="visually-hidden">
              {escrow.signed} of {escrow.required}
            </span>
          </dd>
        </div>
      </dl>
      <p className="escrow-open">
        <Link to={dealPath(escrow.dealId)}>
          {ESCROW.open} <span aria-hidden="true">→</span>
        </Link>
      </p>
      {escrow.escrowAddress && !escrow.staged && (
        <p className="escrow-address">
          {ESCROW.address}{" "}
          <a
            className="mono"
            href={explorerAddressUrl(escrow.escrowAddress)}
            target="_blank"
            rel="noreferrer"
            title={escrow.escrowAddress}
          >
            {shortAddress(escrow.escrowAddress)}
          </a>
          <CopyButton value={escrow.escrowAddress} label={`Copy ${ESCROW.address.toLowerCase()}`} />
        </p>
      )}
    </section>
  );
}
