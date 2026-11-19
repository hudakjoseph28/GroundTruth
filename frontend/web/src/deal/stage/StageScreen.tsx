import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import type {
  DealState,
  ReviewerRole,
  TimelineEvent,
  Deal,
} from "@groundtruth/shared";
import {
  LIVE,
  ROLE_LABELS,
  STAGE,
  STATE_LABELS,
  TIMELINE,
} from "../../content/deal";
import { dealPath } from "../../data/dealSource";
import { formatClock, viewDeal, type ReviewerView } from "../../data/dealView";
import {
  explorerAddressUrl,
  explorerTxUrl,
  shortAddress,
} from "../../data/ledger";
import { useReducedMotion } from "../../home/useReducedMotion";
import { MoneyFlow } from "../MoneyFlow";
import { QrCode } from "../QrCode";
import type { LiveDeal } from "../useDealFeed";
import { arrivedRoles, payoutOf, type Payout } from "./stageView";
import "./stage.css";

/** How long a badge stays lit after its approval or hold arrives. */
const ARRIVAL_MS = 2600;

/**
 * Stage mode: the deal page for a projector. The same feed as the normal
 * page (one read every 2 s), drawn full screen with large type: the money
 * strip across the top, the three required sign-offs, and the payout once
 * the API reports the deal released.
 */
export function StageScreen({ live }: { live: LiveDeal }) {
  const phoneUrl = `${window.location.origin}${dealPath(live.deal.id)}`;
  useStageDocument();
  return (
    <StageView
      deal={live.deal}
      timeline={live.timeline}
      liveState={live.liveState}
      updatedAt={live.updatedAt}
      stale={live.stale}
      phoneUrl={phoneUrl}
    />
  );
}

export interface StageViewProps {
  deal: Deal;
  timeline: readonly TimelineEvent[];
  /** Set once the deal's state changed while the page was open. */
  liveState: DealState | null;
  updatedAt: Date;
  stale: boolean;
  /** The deal's normal page, for the QR code. */
  phoneUrl: string;
}

export function StageView({
  deal: source,
  timeline,
  liveState,
  updatedAt,
  stale,
  phoneUrl,
}: StageViewProps) {
  const deal = useMemo(() => viewDeal(source), [source]);
  const payout = payoutOf(source, deal.amount, timeline);
  const arrived = useArrivals(deal.reviewers);
  const still = useReducedMotion();
  const changedLive = liveState === deal.state;

  return (
    <div className="stage" data-tone={deal.tone} data-state={deal.state}>
      <header className="stage-top">
        <p className="stage-eyebrow">
          {STAGE.eyebrow} <span className="mono">{deal.id}</span>
        </p>
        <p className="stage-staged">{STAGE.staged}</p>
        <StageLive updatedAt={updatedAt} stale={stale} />
        <StageControls dealId={deal.id} />
      </header>

      <div className="stage-flow">
        <MoneyFlow amount={deal.amount} state={deal.state} live={changedLive} />
      </div>

      <section className="stage-verdict" aria-labelledby="stage-title">
        {payout ? (
          <Paid
            payout={payout}
            escrowAddress={deal.escrowAddress}
            celebrate={liveState === "released" && !still}
          />
        ) : (
          <>
            <p className="stage-state" key={deal.state} data-live={changedLive}>
              {STATE_LABELS[deal.state]}
            </p>
            <h1 id="stage-title" className="stage-headline">
              {deal.headline}
            </h1>
            <p className="stage-message">{deal.message}</p>
          </>
        )}
      </section>

      <StageReviewers
        reviewers={deal.reviewers}
        signed={deal.signed}
        required={deal.required}
        arrived={arrived}
      />

      <aside className="stage-phone" aria-labelledby="stage-phone-title">
        <QrCode value={phoneUrl} label={`QR code for ${phoneUrl}`} />
        <div>
          <h2 id="stage-phone-title">{STAGE.phone}</h2>
          <p>{STAGE.phoneBody}</p>
        </div>
      </aside>
    </div>
  );
}

function Paid({
  payout,
  escrowAddress,
  celebrate,
}: {
  payout: Payout;
  escrowAddress?: string;
  /** The release arrived while the page was open and motion is allowed. */
  celebrate: boolean;
}) {
  return (
    <div className="stage-paid" role="status">
      {celebrate && <Confetti />}
      <h1 id="stage-title" className="stage-paid-line">
        <span className="stage-paid-label">{STAGE.paid}:</span>{" "}
        <span className="stage-paid-amount">
          <span className="mono">{payout.amount}</span> test USDC
        </span>
      </h1>
      <p className="stage-message">{STAGE.paidNote}</p>
      {payout.signature ? (
        <a
          className="stage-explorer"
          href={explorerTxUrl(payout.signature)}
          target="_blank"
          rel="noreferrer"
        >
          {STAGE.explorer}
          <span className="mono"> {shortAddress(payout.signature)}</span>
          <NewTab />
        </a>
      ) : escrowAddress ? (
        <a
          className="stage-explorer"
          href={explorerAddressUrl(escrowAddress)}
          target="_blank"
          rel="noreferrer"
        >
          {STAGE.escrowExplorer}
          <span className="mono"> {shortAddress(escrowAddress)}</span>
          <NewTab />
        </a>
      ) : null}
    </div>
  );
}

const MARKS: Record<ReviewerView["status"], string> = {
  signed: "✓",
  held: "!",
  waiting: "",
  notSigned: "–",
};

export function StageReviewers({
  reviewers,
  signed,
  required,
  arrived,
}: {
  reviewers: readonly ReviewerView[];
  signed: number;
  required: number;
  /** Badges whose approval or hold arrived in the last few seconds. */
  arrived: ReadonlySet<ReviewerRole>;
}) {
  const announced = reviewers.filter((reviewer) => arrived.has(reviewer.role));
  return (
    <section
      className="stage-reviewers"
      aria-labelledby="stage-reviewers-title"
    >
      <header>
        <h2 id="stage-reviewers-title">{STAGE.reviewers}</h2>
        <p className="mono">{STAGE.count(signed, required)}</p>
      </header>
      <ul>
        {reviewers.map((reviewer) => (
          <li
            key={reviewer.role}
            className="stage-badge"
            data-status={reviewer.status}
            data-arrived={arrived.has(reviewer.role)}
          >
            <span className="stage-badge-mark" aria-hidden="true">
              {MARKS[reviewer.status]}
            </span>
            <strong className="stage-badge-role">
              {ROLE_LABELS[reviewer.role]}
            </strong>
            <span className="stage-badge-status">
              {STAGE.status[reviewer.status]}
            </span>
            <span className="stage-badge-wallet mono" title={reviewer.wallet}>
              {STAGE.stagedWallet} {shortAddress(reviewer.wallet)}
            </span>
          </li>
        ))}
      </ul>
      <p className="visually-hidden" aria-live="polite">
        {announced
          .map((reviewer) =>
            STAGE.arrived(
              ROLE_LABELS[reviewer.role],
              STAGE.status[reviewer.status],
            ),
          )
          .join(" ")}
      </p>
    </section>
  );
}

/** A short, light burst over the payout line. Purely decorative. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => {
        // Spread evenly around a half circle, with a fixed jitter per piece.
        const angle = Math.PI * (0.08 + (0.84 * index) / 27);
        const reach = 9 + ((index * 7) % 11);
        return {
          "--dx": `${(Math.cos(angle) * reach * 1.6).toFixed(2)}rem`,
          "--dy": `${(-Math.sin(angle) * reach * 0.7).toFixed(2)}rem`,
          "--spin": `${((index * 67) % 300) + 160}deg`,
          "--delay": `${(index % 5) * 45}ms`,
          "--hue": ["var(--green)", "var(--gold)", "#f5f5f7"][index % 3],
        } as CSSProperties;
      }),
    [],
  );
  return (
    <span className="stage-confetti" aria-hidden="true">
      {pieces.map((style, index) => (
        <span key={index} style={style} />
      ))}
    </span>
  );
}

function StageLive({ updatedAt, stale }: { updatedAt: Date; stale: boolean }) {
  return (
    <p className="stage-live mono" data-stale={stale} title={LIVE.detail}>
      <span className="deal-live-dot" aria-hidden="true" />
      {stale
        ? LIVE.stale
        : `${LIVE.on} · ${LIVE.updated(formatClock(updatedAt))}`}
    </p>
  );
}

function StageControls({ dealId }: { dealId: string }) {
  const fullScreen = useFullScreen();
  return (
    <p className="stage-controls">
      {fullScreen === false && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            document.documentElement.requestFullscreen().catch(() => {
              // The browser refused (for example, inside a frame). F11 still works.
            });
          }}
        >
          {STAGE.fullScreen}
        </button>
      )}
      <Link className="btn btn-small" to={dealPath(dealId)}>
        {STAGE.exit}
      </Link>
    </p>
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

/**
 * Roles whose approval or hold arrived since the previous read, for a few
 * seconds. The first read only records what is already there.
 */
function useArrivals(
  reviewers: readonly ReviewerView[],
): ReadonlySet<ReviewerRole> {
  const [previous, setPrevious] = useState<readonly ReviewerView[] | null>(
    null,
  );
  const [arrived, setArrived] = useState<ReadonlySet<ReviewerRole>>(
    () => new Set(),
  );
  if (previous !== reviewers) {
    // Adjusting state while rendering: React re-renders before painting.
    const fresh = arrivedRoles(previous, reviewers);
    setPrevious(reviewers);
    if (fresh.length > 0) setArrived(new Set([...arrived, ...fresh]));
  }
  useEffect(() => {
    if (arrived.size === 0) return;
    const timer = window.setTimeout(() => setArrived(new Set()), ARRIVAL_MS);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  return arrived;
}

const subscribeFullScreen = (notify: () => void) => {
  document.addEventListener("fullscreenchange", notify);
  return () => document.removeEventListener("fullscreenchange", notify);
};

/** True in full screen, false when it can be entered, null when it cannot. */
function useFullScreen(): boolean | null {
  return useSyncExternalStore(
    subscribeFullScreen,
    () =>
      document.fullscreenEnabled ? Boolean(document.fullscreenElement) : null,
    () => null,
  );
}

/** While stage mode is open, the page under it does not scroll. */
function useStageDocument() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.stage = "";
    return () => {
      delete root.dataset.stage;
    };
  }, []);
}
