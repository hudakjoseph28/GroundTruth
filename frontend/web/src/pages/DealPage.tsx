import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { stagedReleasedDeal, type Deal, type Parcel } from "@groundtruth/shared";
import { ReceiptLink } from "../components/ReceiptLink";
import {
  DEAL_PAGE,
  HANDOFF,
  LIVE,
  STAGE,
  STATE_LABELS,
  TIMELINE,
} from "../content/deal";
import { DOCUMENTS } from "../content/documents";
import { EXAMPLE } from "../content/example";
import { DealHero, DealHoldCard, DealReviewers, DealRow, NewTab } from "../deal/DealParts";
import { QrCode } from "../deal/QrCode";
import { MoneyFlow } from "../deal/MoneyFlow";
import { SolanaPayFund } from "../deal/SolanaPayFund";
import { StageScreen } from "../deal/stage/StageScreen";
import { wantsStage } from "../deal/stage/stageView";
import { DealDocuments } from "../documents/DealDocuments";
import { useDealDocuments } from "../documents/useDealDocuments";
import { TextAlerts } from "../deal/TextAlerts";
import { useDealFeed, type LiveDeal } from "../deal/useDealFeed";
import { dealPath } from "../data/dealSource";
import { formatClock, viewDeal, viewTimeline } from "../data/dealView";
import { shortAddress } from "../data/ledger";
import { ExampleTag, useIsExample } from "../example/ExampleContext";
import { usePageTitle } from "../layout/usePageTitle";
import { VerifyOnChain } from "../verify/VerifyOnChain";
import { getParcel, sampleParcelPath } from "../data/parcelSource";
import { SceneBoundary } from "../parcel/SceneBoundary";
import "../deal/deal.css";

// Wallet code loads only when a participant asks to upload or open a file.
const DocumentsWithWallet = lazy(
  () => import("../documents/DocumentsWithWallet"),
);
// The parcel's land block, and three.js behind it, load after the deal shows.
const DealLand = lazy(() => import("../deal/DealLand"));

/** One staged deal: where the money is, why it can or cannot move, and what happened. */
export function DealPage() {
  const params = useParams();
  const dealId = params.dealId ?? "";
  const [search] = useSearchParams();
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
  // Stage mode reads the same feed; only the drawing changes.
  return wantsStage(search) ? (
    <StageScreen live={feed} />
  ) : (
    <DealScreen live={feed} />
  );
}

function DealScreen({ live }: { live: LiveDeal }) {
  const parcel = useParcel(live.deal.parcelKey);
  const documents = useDealDocuments(live.deal.id);
  const [participant, setParticipant] = useState(false);

  return (
    <DealLayout
      live={live}
      parcel={parcel}
      documents={
        participant ? (
          <Suspense
            fallback={
              <DealDocuments state={documents.state} timeline={live.timeline} />
            }
          >
            <DocumentsWithWallet
              deal={live.deal}
              state={documents.state}
              timeline={live.timeline}
              onUploaded={documents.refresh}
            />
          </Suspense>
        ) : (
          <DealDocuments
            state={documents.state}
            timeline={live.timeline}
            participant={
              <button
                type="button"
                className="btn docs-participant-open"
                onClick={() => setParticipant(true)}
              >
                {DOCUMENTS.participant.open}
              </button>
            }
          />
        )
      }
    />
  );
}

/**
 * The deal page's drawing, from a deal and its timeline. The live page feeds
 * it from the API; the example deal feeds it from the example fixture, inside
 * an ExampleProvider, and then reads nothing from the API or from devnet.
 */
export function DealLayout({
  live,
  parcel,
  documents,
}: {
  live: LiveDeal;
  /** Undefined while loading; null when it cannot be had. */
  parcel: Parcel | null | undefined;
  documents: ReactNode;
}) {
  const example = useIsExample();
  const deal = useMemo(() => viewDeal(live.deal), [live.deal]);
  const rows = useMemo(() => {
    const newestFirst = viewTimeline(live.timeline);
    // The example tells a story, so it reads first to last.
    return example ? [...newestFirst].reverse() : newestFirst;
  }, [live.timeline, example]);
  // The newest row that arrived live, read out once for screen readers.
  const announced = rows.find((row) => live.freshIds.has(row.id));

  return (
    <div className="deal-page" data-tone={deal.tone} data-example={example || undefined}>
      <header className="deal-top">
        {example ? (
          <>
            <p className="eyebrow">{DEAL_PAGE.eyebrow}</p>
            <ExampleTag kind="deal" />
          </>
        ) : (
          <>
            <p className="eyebrow">
              {DEAL_PAGE.eyebrow} <span className="mono deal-id">{deal.id}</span>
            </p>
            <LiveLine updatedAt={live.updatedAt} stale={live.stale} />
          </>
        )}
      </header>

      <MoneyFlow
        amount={deal.amount}
        state={deal.state}
        live={live.liveState === deal.state}
      />

      {/* Reads the escrow account on devnet; an example has none. */}
      {!example && <VerifyOnChain deal={live.deal} />}

      <div className="deal-summary">
        <DealHero
          deal={deal}
          live={live.liveState === deal.state}
          parcel={parcel ?? null}
        />
        <DealLandSlot
          parcel={parcel}
          state={deal.state}
          liveState={live.liveState}
        />
        {/* Only a draft can be funded; the API refuses every other state. */}
        {deal.state === "draft" && !example && (
          <SolanaPayFund
            dealId={deal.id}
            amount={deal.amount}
            buyerWallet={live.deal.buyerWallet}
          />
        )}
        <DealReviewers deal={deal} />
        {deal.hold && <DealHoldCard hold={deal.hold} />}
        {/* A closed deal has no more events to text about. */}
        {deal.state !== "released" && deal.state !== "refunded" && !example && (
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
          <p>{example ? EXAMPLE.deal.timelineOrder : TIMELINE.order}</p>
        </header>
        {rows.length > 0 ? (
          <ol className="deal-rows">
            {rows.map((row) => (
              <DealRow key={row.id} row={row} fresh={live.freshIds.has(row.id)} />
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

      <div className="deal-documents" id="documents">
        {documents}
      </div>

      <aside className="deal-aside">
        <Handoff dealId={deal.id} example={example} />
        {example ? (
          <p className="example-real">
            {EXAMPLE.real.lead}{" "}
            <Link to={dealPath(stagedReleasedDeal.id)}>
              {EXAMPLE.real.link}
              <span aria-hidden="true"> →</span>
            </Link>
          </p>
        ) : (
          <p className="deal-stage-link">
            <Link to={`${dealPath(deal.id)}?stage=1`}>
              {STAGE.open}
              <span aria-hidden="true"> →</span>
            </Link>
          </p>
        )}
        {deal.escrowAddress && (
          <p className="deal-account">
            {DEAL_PAGE.escrowAddress}{" "}
            <ReceiptLink
              className="mono"
              address={deal.escrowAddress}
              title={deal.escrowAddress}
            >
              {shortAddress(deal.escrowAddress)}
              {!example && <NewTab />}
            </ReceiptLink>
          </p>
        )}
      </aside>
    </div>
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
function Handoff({ dealId, example = false }: { dealId: string; example?: boolean }) {
  const url = `${window.location.origin}${dealPath(dealId)}`;
  return (
    <section className="deal-handoff" aria-labelledby="deal-handoff-title">
      <QrCode value={url} label={HANDOFF.alt(url)} />
      <div>
        <h2 id="deal-handoff-title">{HANDOFF.title}</h2>
        <p>{example ? EXAMPLE.deal.handoff : HANDOFF.body}</p>
        {!example && (
          <p className="mono deal-handoff-url">
            {/* A narrow column breaks the address after a slash, not mid-word. */}
            {url
              .replace(/^https?:\/\//, "")
              .split("/")
              .map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && (
                    <>
                      /<wbr />
                    </>
                  )}
                  {part}
                </Fragment>
              ))}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Room for the parcel's land block. The block loads once the slot is near the
 * screen; until then, and while it loads, the slot keeps its place so the
 * reviewers below do not jump. It closes up if the parcel cannot be had.
 */
function DealLandSlot({
  parcel,
  state,
  liveState,
}: {
  parcel: Parcel | null | undefined;
  state: Deal["state"];
  liveState: Deal["state"] | null;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = slot.current;
    if (!node || near) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: "200px 0px" },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [near]);

  if (parcel === null) return null;
  const placeholder = <div className="deal-land" aria-hidden="true" />;
  return (
    <div ref={slot} className="deal-land-slot">
      {parcel && near ? (
        <SceneBoundary fallback={null}>
          <Suspense fallback={placeholder}>
            <DealLand parcel={parcel} state={state} liveState={liveState} />
          </Suspense>
        </SceneBoundary>
      ) : (
        placeholder
      )}
    </div>
  );
}

/**
 * The deal's parcel, for its county and its land block. The page does not
 * wait for it. Undefined while loading; null when it cannot be had.
 */
function useParcel(parcelKey: string): Parcel | null | undefined {
  const [loaded, setLoaded] = useState<{
    key: string;
    parcel: Parcel | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getParcel(parcelKey, controller.signal).then(
      (outcome) => {
        setLoaded({
          key: parcelKey,
          parcel: outcome.status === "found" ? outcome.parcel : null,
        });
      },
      () => {
        // Aborted: the page closed or moved to another deal.
      },
    );
    return () => controller.abort();
  }, [parcelKey]);
  return loaded?.key === parcelKey ? loaded.parcel : undefined;
}
