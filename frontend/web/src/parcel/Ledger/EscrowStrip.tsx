import { ESCROW } from "../../content/parcel";
import { explorerAddressUrl, shortAddress, type EscrowSummary } from "../../data/ledger";
import { CopyButton } from "./CopyButton";

/** The one escrow behind the deal: how much, what state, and whether money can move. */
export function EscrowStrip({ escrow }: { escrow: EscrowSummary }) {
  return (
    <section className="escrow" data-tone={escrow.verdict.tone} aria-labelledby="escrow-title">
      <div className="escrow-head">
        <h3 id="escrow-title">{ESCROW.title}</h3>
        <p>
          {escrow.staged && <span className="tag">{ESCROW.staged}</span>}
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
              {escrow.signed}/{escrow.required}
            </span>
            <span className="visually-hidden">
              {escrow.signed} of {escrow.required}
            </span>
          </dd>
        </div>
      </dl>
      {escrow.escrowAddress && (
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
