import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Parcel } from "@groundtruth/shared";
import {
  DEAL_PAGE,
  HANDOFF,
  HOLD,
  LIVE,
  REVIEWERS,
  STATE_LABELS,
  TIMELINE,
} from "../content/deal";
import { QrCode } from "../deal/QrCode";
import { TextAlerts } from "../deal/TextAlerts";
import { useDealFeed, type LiveDeal } from "../deal/useDealFeed";
import { dealPath } from "../data/dealSource";
import {
  formatClock,
  formatMoment,
  viewDeal,
  viewTimeline,
  type DealView,
  type HoldView,
  type ReviewerView,
  type TimelineRow,
} from "../data/dealView";
import {
  explorerAddressUrl,
  explorerTxUrl,
  shortAddress,
} from "../data/ledger";
import { usePageTitle } from "../layout/usePageTitle";
import { getParcel, parcelPath, sampleParcelPath } from "../data/parcelSource";
import "../deal/deal.css";

/** One staged deal: where the money is, why it can or cannot move, and what happened. */
export function DealPage() {
  const params = useParams();
  const dealId = params.dealId ?? "";
  const feed = useDealFeed(dealId);
  usePageTitle(
    feed.status === "ready"
      ? DEAL_PAGE.title(STATE_LABELS[feed.deal.state])
      : feed.status === "missing"
        ? DEAL_PAGE.missing.title
        : null,
  );

  if (feed.status === "loading") {
    return (
      <section className="sheet deal-plain" aria-busy="true">
        <p className="eyebrow">{DEAL_PAGE.eyebrow}</p>
        <h1 className="mono">{dealId}</h1>
        <p className="notice" role="status">
          {DEAL_PAGE.loading}
        </p>
        <span className="result-skeleton" aria-hidden="true" />
        <span className="result-skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (feed.status === "missing") {
    return (
      <section className="sheet deal-plain">
        <p className="eyebrow">{DEAL_PAGE.eyebrow}</p>
        <h1>{DEAL_PAGE.missing.title}</h1>
        <p className="notice" role="status">
          {feed.message || DEAL_PAGE.missing.body}{" "}
          <span className="mono">{dealId}</span>
        </p>
        <p className="plain-actions">
          <Link className="btn btn-primary" to={sampleParcelPath()}>
            {DEAL_PAGE.missing.parcel}
          </Link>
          <Link className="btn" to="/">
            {DEAL_PAGE.missing.home}
          </Link>
        </p>
      </section>
    );
  }
  if (feed.status === "error") {
    return (
      <section className="sheet deal-plain">
        <p className="eyebrow">{DEAL_PAGE.eyebrow}</p>
        <h1 className="mono">{dealId}</h1>
        <div className="notice notice-error" role="alert">
          <p>{feed.message}</p>
          {feed.retryable ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={feed.retry}
            >
              {DEAL_PAGE.retry}
            </button>
          ) : null}
        </div>
      </section>
    );
  }
  return <DealScreen live={feed} />;
}

function DealScreen({ live }: { live: LiveDeal }) {
  const deal = useMemo(() => viewDeal(live.deal), [live.deal]);
  const rows = useMemo(() => viewTimeline(live.timeline), [live.timeline]);
  const parcel = useParcel(deal.parcelKey);
  // The newest row that arrived live, read out once for screen readers.
  const announced = rows.find((row) => live.freshIds.has(row.id));

  return (
    <div className="deal-page" data-tone={deal.tone}>
      <header className="deal-top">
        <p className="eyebrow">
          {DEAL_PAGE.eyebrow} <span className="mono deal-id">{deal.id}</span>
        </p>
        <LiveLine updatedAt={live.updatedAt} stale={live.stale} />
      </header>

      <div className="deal-summary">
        <Hero
          deal={deal}
          live={live.liveState === deal.state}
          parcel={parcel}
        />
        <Reviewers deal={deal} />
        {deal.hold && <HoldCard hold={deal.hold} />}
        {/* A closed deal has no more events to text about. */}
        {deal.state !== "released" && deal.state !== "refunded" && (
          <TextAlerts dealId={deal.id} />
        )}
      </div>

      <section
        className="deal-timeline"
        id="timeline"
        aria-labelledby="deal-timeline-title"
      >
        <header className="deal-section-head">
          <h2 id="deal-timeline-title">{TIMELINE.title}</h2>
          <p>{TIMELINE.order}</p>
        </header>
        {rows.length > 0 ? (
          <ol className="deal-rows">
            {rows.map((row) => (
              <Row key={row.id} row={row} fresh={live.freshIds.has(row.id)} />
            ))}
          </ol>
        ) : (
          <p className="notice" role="status">
            {TIMELINE.empty}
          </p>
        )}
        <p className="visually-hidden" aria-live="polite">
          {announced ? TIMELINE.announce(announced.message) : ""}
        </p>
      </section>

      <aside className="deal-aside">
        <Handoff dealId={deal.id} />
        {deal.escrowAddress && (
          <p className="deal-account">
            {DEAL_PAGE.escrowAddress}{" "}
            <a
              className="mono"
              href={explorerAddressUrl(deal.escrowAddress)}
              target="_blank"
              rel="noreferrer"
              title={deal.escrowAddress}
            >
              {shortAddress(deal.escrowAddress)}
              <NewTab />
            </a>
          </p>
        )}
      </aside>
    </div>
  );
}

/** Amount first and always in the same place, then the state and why. */
function Hero({
  deal,
  live,
  parcel,
}: {
  deal: DealView;
  /** The state changed while the page was open: draw the eye to it once. */
  live: boolean;
  parcel: Parcel | null;
}) {
  return (
    <section className="deal-hero" aria-labelledby="deal-title">
      <h1 id="deal-title" className="visually-hidden">
        {DEAL_PAGE.dealId} {deal.id}
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
          {DEAL_PAGE.parcel.open(deal.parcelId)}
          {parcel ? ` · ${DEAL_PAGE.parcel.county(parcel.county)}` : ""}
          <span aria-hidden="true"> →</span>
        </Link>
      </p>
      <p className="tag deal-staged">{DEAL_PAGE.staged}</p>
    </section>
  );
}

const REVIEWER_MARKS: Record<ReviewerView["status"], string> = {
  signed: "✓",
  held: "!",
  waiting: "",
  notSigned: "–",
};

function Reviewers({ deal }: { deal: DealView }) {
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
              <span
                className="mono"
                title={`${REVIEWERS.wallet} ${reviewer.wallet}`}
              >
                {shortAddress(reviewer.wallet)}
              </span>
            </p>
            <p className="deal-reviewer-status">
              <strong>{REVIEWERS.status[reviewer.status]}</strong>
              {reviewer.signature && (
                <a
                  href={explorerTxUrl(reviewer.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {REVIEWERS.receipt}
                  <NewTab />
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HoldCard({ hold }: { hold: HoldView }) {
  return (
    <section
      className="deal-hold"
      data-active={hold.active}
      aria-labelledby="deal-hold-title"
    >
      <h2 id="deal-hold-title">
        {hold.active ? HOLD.active : HOLD.ended}
        <span>{hold.reason}</span>
      </h2>
      <p className="deal-hold-message">{hold.message}</p>
      <p className="deal-hold-foot">
        {HOLD.placedBy(hold.role)} ·{" "}
        <time dateTime={hold.at}>{formatMoment(hold.at)}</time> ·{" "}
        <a
          href={explorerTxUrl(hold.signature)}
          target="_blank"
          rel="noreferrer"
        >
          {HOLD.receipt}
          <NewTab />
        </a>
      </p>
      {!hold.active && <p className="deal-hold-foot">{HOLD.endedNote}</p>}
    </section>
  );
}

function Row({ row, fresh }: { row: TimelineRow; fresh: boolean }) {
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
          {row.blocked && (
            <span className="deal-row-blocked">{TIMELINE.blocked}</span>
          )}
          {fresh && <span className="deal-row-new">{TIMELINE.fresh}</span>}
          <time dateTime={row.at}>{formatMoment(row.at)}</time>
        </p>
        <p className="deal-row-message">{row.message}</p>
        <p className="deal-row-foot">
          {row.actor && <span>{row.actor}</span>}
          <span>{row.confirmed ? TIMELINE.confirmed : TIMELINE.offChain}</span>
        </p>
        {row.signature && (
          <a
            className="deal-row-link"
            href={explorerTxUrl(row.signature)}
            target="_blank"
            rel="noreferrer"
          >
            {TIMELINE.explorer}
            <span className="mono">{shortAddress(row.signature)}</span>
            <NewTab />
          </a>
        )}
      </div>
    </li>
  );
}

function LiveLine({ updatedAt, stale }: { updatedAt: Date; stale: boolean }) {
  return (
    <p className="deal-live mono" data-stale={stale} title={LIVE.detail}>
      <span className="deal-live-dot" aria-hidden="true" />
      {stale ? (
        LIVE.stale
      ) : (
        <>
          {LIVE.on} <span>· {LIVE.updated(formatClock(updatedAt))}</span>
        </>
      )}
    </p>
  );
}

/** Desktop only: the same public page, for a phone. The stylesheet hides it on narrow screens. */
function Handoff({ dealId }: { dealId: string }) {
  const url = `${window.location.origin}${dealPath(dealId)}`;
  return (
    <section className="deal-handoff" aria-labelledby="deal-handoff-title">
      <QrCode value={url} label={HANDOFF.alt(url)} />
      <div>
        <h2 id="deal-handoff-title">{HANDOFF.title}</h2>
        <p>{HANDOFF.body}</p>
        <p className="mono deal-handoff-url">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </section>
  );
}

function NewTab() {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> ({TIMELINE.newTab})</span>
    </>
  );
}

/** The deal's parcel, for its county. The page does not wait for it. */
function useParcel(parcelKey: string): Parcel | null {
  const [loaded, setLoaded] = useState<Parcel | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getParcel(parcelKey, controller.signal).then(
      (outcome) => {
        if (outcome.status === "found") setLoaded(outcome.parcel);
      },
      () => {
        // Aborted: the page closed or moved to another deal.
      },
    );
    return () => controller.abort();
  }, [parcelKey]);
  return loaded?.key === parcelKey ? loaded : null;
}
