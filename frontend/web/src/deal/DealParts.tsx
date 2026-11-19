import { Link } from "react-router-dom";
import type { Parcel } from "@groundtruth/shared";
import { ReceiptLink } from "../components/ReceiptLink";
import { DEAL_PAGE, HOLD, REVIEWERS, STATE_LABELS, TIMELINE } from "../content/deal";
import { TIMELINE_DOCUMENT } from "../content/documents";
import { EXAMPLE } from "../content/example";
import { parcelName } from "../data/address";
import { formatMoment, type DealView, type HoldView, type ReviewerView, type TimelineRow } from "../data/dealView";
import { shortAddress } from "../data/ledger";
import { parcelPath } from "../data/parcelSource";
import { shortHash } from "../documents/fileCheck";
import { ExampleTag, useIsExample } from "../example/ExampleContext";

// The deal page's parts: the hero, the reviewer badges, the hold, and one
// timeline row. The deal page, the example deal, and the walkthrough all draw
// with these. On an example page a receipt is shown, never linked.

function parcelLinkName(parcelId: string, parcel: Parcel | null): string {
  const street = parcel ? parcelName(parcel.siteAddress).street : null;
  const id = parcel?.sourceParcelId ?? parcelId;
  return street ? `${street} · ${id}` : DEAL_PAGE.parcel.open(id);
}

/** Amount first and always in the same place, then the state and why. */
export function DealHero({
  deal,
  live,
  parcel,
}: {
  deal: DealView;
  /** The state changed while the page was open: draw the eye to it once. */
  live: boolean;
  parcel: Parcel | null;
}) {
  const example = useIsExample();
  return (
    <section className="deal-hero" aria-labelledby="deal-title">
      <h1 id="deal-title" className="visually-hidden">
        {example ? EXAMPLE.tag.deal : `${DEAL_PAGE.dealId} ${deal.id}`}
      </h1>
      <div className="deal-hero-row">
        <p className="deal-amount">
          <span className="visually-hidden">{DEAL_PAGE.amount}: </span>
          <span className="mono">{deal.amount}</span> {DEAL_PAGE.unit}
        </p>
        <p className="deal-state" key={deal.state} data-live={live}>
          <span className="visually-hidden">{DEAL_PAGE.status}: </span>
          {STATE_LABELS[deal.state]}
        </p>
      </div>
      <p className="deal-headline">{deal.headline}</p>
      <p className="deal-message">{deal.message}</p>
      <p className="deal-next">
        <span>{DEAL_PAGE.next}</span> {deal.next}
      </p>
      <p className="deal-parcel">
        <span>{DEAL_PAGE.parcel.label}</span>{" "}
        <Link to={parcelPath(deal.parcelKey)}>
          {parcelLinkName(deal.parcelId, parcel)}
          {parcel ? ` · ${DEAL_PAGE.parcel.county(parcel.county)}` : ""}
          <span aria-hidden="true"> →</span>
        </Link>
      </p>
      {example ? (
        <ExampleTag kind="deal" className="deal-staged" />
      ) : (
        <p className="tag deal-staged">{DEAL_PAGE.staged}</p>
      )}
    </section>
  );
}

const REVIEWER_MARKS: Record<ReviewerView["status"], string> = {
  signed: "✓",
  held: "!",
  waiting: "",
  notSigned: "–",
};

/** The required reviewers, each with their status and, once they act, the receipt. */
export function DealReviewers({ deal }: { deal: DealView }) {
  const example = useIsExample();
  return (
    <section className="deal-reviewers" aria-labelledby="deal-reviewers-title">
      <header className="deal-section-head">
        <h2 id="deal-reviewers-title">{REVIEWERS.title}</h2>
        <p className="mono">{REVIEWERS.count(deal.signed, deal.required)}</p>
      </header>
      <ul>
        {deal.reviewers.map((reviewer) => (
          <li key={reviewer.wallet} data-status={reviewer.status}>
            <span className="deal-reviewer-mark" aria-hidden="true">
              {REVIEWER_MARKS[reviewer.status]}
            </span>
            <p className="deal-reviewer-who">
              {REVIEWERS.role(reviewer.role)}
              <span className="mono" title={`${REVIEWERS.wallet} ${reviewer.wallet}`}>
                {shortAddress(reviewer.wallet)}
              </span>
            </p>
            <p className="deal-reviewer-status">
              <strong>{REVIEWERS.status[reviewer.status]}</strong>
              {reviewer.signature && (
                <ReceiptLink signature={reviewer.signature}>
                  {example ? EXAMPLE.receipt : REVIEWERS.receipt}
                  {!example && <NewTab />}
                </ReceiptLink>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DealHoldCard({ hold }: { hold: HoldView }) {
  const example = useIsExample();
  return (
    <section className="deal-hold" data-active={hold.active} aria-labelledby="deal-hold-title">
      <h2 id="deal-hold-title">
        {hold.active ? HOLD.active : HOLD.ended}
        <span>{hold.reason}</span>
      </h2>
      <p className="deal-hold-message">{hold.message}</p>
      <p className="deal-hold-foot">
        {HOLD.placedBy(hold.role)} · <time dateTime={hold.at}>{formatMoment(hold.at)}</time> ·{" "}
        <ReceiptLink signature={hold.signature}>
          {example ? EXAMPLE.receipt : HOLD.receipt}
          {!example && <NewTab />}
        </ReceiptLink>
      </p>
      {!hold.active && <p className="deal-hold-foot">{HOLD.endedNote}</p>}
    </section>
  );
}

/** One event on the deal's timeline. */
export function DealRow({ row, fresh = false }: { row: TimelineRow; fresh?: boolean }) {
  const example = useIsExample();
  return (
    <li
      className="deal-row"
      data-tone={row.tone}
      data-blocked={row.blocked}
      data-confirmed={row.confirmed}
      data-fresh={fresh}
    >
      <span className="deal-row-mark" aria-hidden="true">
        {row.blocked ? "✕" : ""}
      </span>
      <div className="deal-row-body">
        <p className="deal-row-head">
          <strong>{row.label}</strong>
          {row.blocked && <span className="deal-row-blocked">{TIMELINE.blocked}</span>}
          {fresh && <span className="deal-row-new">{TIMELINE.fresh}</span>}
          <time dateTime={row.at}>{formatMoment(row.at)}</time>
        </p>
        <p className="deal-row-message">{row.message}</p>
        <p className="deal-row-foot">
          {row.actor && <span>{row.actor}</span>}
          <span>
            {row.confirmed ? (example ? TIMELINE.onChain : TIMELINE.confirmed) : TIMELINE.offChain}
          </span>
        </p>
        {row.citation && (
          <p className="deal-row-doc">
            {row.citation.filename && row.citation.documentId ? (
              <>
                {TIMELINE_DOCUMENT.relying}{" "}
                <a href={`#document-${row.citation.documentId}`}>{row.citation.filename}</a>
              </>
            ) : (
              TIMELINE_DOCUMENT.unmatched
            )}
            <span className="mono" title={row.citation.sha256}>
              {" · "}
              {TIMELINE_DOCUMENT.hash} {shortHash(row.citation.sha256)}
            </span>
          </p>
        )}
        {row.signature && (
          <ReceiptLink className="deal-row-link" signature={row.signature}>
            {example ? EXAMPLE.receipt : TIMELINE.explorer}
            <span className="mono">{shortAddress(row.signature)}</span>
            {!example && <NewTab />}
          </ReceiptLink>
        )}
      </div>
    </li>
  );
}

export function NewTab() {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> ({TIMELINE.newTab})</span>
    </>
  );
}
