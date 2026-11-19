import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type { ReviewerRole } from "@groundtruth/shared";
import { ESCROW } from "../../content/parcel";
import { dealPath } from "../../data/dealSource";
import { ReceiptLink } from "../../components/ReceiptLink";
import { shortAddress, type EscrowSummary, type ReviewerMarkState } from "../../data/ledger";
import { ChainStrip } from "../../deal/ChainStrip";
import { CopyButton } from "./CopyButton";

const ROLE_NAME: Record<ReviewerRole, string> = {
  title: "Title",
  survey: "Survey",
  septic: "Septic",
};

const MARK_WORD: Record<ReviewerMarkState, string> = {
  approved: "signed",
  held: "hold",
  waiting: "waiting",
  missed: "did not sign",
};

/** One closing: a fixed header, then the confirmed chain. */
export function EscrowStrip({
  escrow,
  startOpen,
}: {
  escrow: EscrowSummary;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(startOpen));
  const panelId = useId();
  const meter = escrow.reviewers
    .map((reviewer) => `${ROLE_NAME[reviewer.role]} ${MARK_WORD[reviewer.state]}`)
    .join(", ");

  return (
    <section className="escrow" data-tone={escrow.verdict.tone} data-open={open}>
      <h3 className="visually-hidden">{ESCROW.title}</h3>
      <button
        type="button"
        className="escrow-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="escrow-lead">
          <span className="escrow-chip">
            <i aria-hidden="true" />
            {escrow.chip}
          </span>
          <span className="escrow-line">{escrow.line}</span>
        </span>
        <span className="escrow-amount">
          <span className="escrow-amount-num">{escrow.amount}</span>
          <span className="escrow-amount-unit">{ESCROW.unit}</span>
        </span>
        <span className="escrow-meter" role="img" aria-label={`${ESCROW.meterLabel}: ${meter}`}>
          {escrow.reviewers.map((reviewer) => (
            <span
              key={reviewer.role}
              className="meter-dot"
              data-state={reviewer.state}
              title={`${ROLE_NAME[reviewer.role]} ${MARK_WORD[reviewer.state]}`}
            />
          ))}
        </span>
        <svg className="escrow-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 6 8 10.5 12.5 6" />
        </svg>
      </button>
      <div className="escrow-panel" id={panelId}>
        <div className="escrow-panel-inner" inert={open ? undefined : true}>
          <ChainStrip blocks={escrow.blocks} outlines={escrow.outlines} />
          <div className="escrow-foot">
            {escrow.escrowAddress ? (
              <p className="escrow-account">
                {ESCROW.address}{" "}
                <ReceiptLink className="mono" address={escrow.escrowAddress} title={escrow.escrowAddress}>
                  {shortAddress(escrow.escrowAddress)}
                </ReceiptLink>
                <CopyButton
                  icon
                  value={escrow.escrowAddress}
                  label={`Copy ${ESCROW.address.toLowerCase()} address`}
                />
              </p>
            ) : (
              <span />
            )}
            <Link className="escrow-view" to={`${dealPath(escrow.dealId)}#timeline`}>
              {ESCROW.open} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
