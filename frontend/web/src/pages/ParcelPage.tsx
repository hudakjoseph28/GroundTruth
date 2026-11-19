import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Parcel } from "@groundtruth/shared";
import { PARCEL_PAGE } from "../content/parcel";
import { PARCEL_LOAD } from "../content/search";
import { parcelIdFromKey, parcelName } from "../data/address";
import {
  getDeal,
  stagedDealIdsFor,
  type DealOutcome,
} from "../data/dealSource";
import { getParcelLedger, summarizeDeal } from "../data/ledger";
import {
  getParcel,
  getParcelReport,
  type FailedOutcome,
  type ParcelOutcome,
  type ReportOutcome,
} from "../data/parcelSource";
import { usePageTitle } from "../layout/usePageTitle";
import { BlockTransition } from "../parcel/BlockTransition/BlockTransition";
import { readBlockOrigin } from "../parcel/BlockTransition/origin";
import { Ledger } from "../parcel/Ledger/Ledger";
import { LandBlock } from "../parcel/ParcelScene/LandBlock";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";
import { useRenderMode } from "../parcel/useRenderMode";
import "../parcel/parcel.css";

export function ParcelPage() {
  const params = useParams();
  const parcelKey = params.parcelKey ? decodeURIComponent(params.parcelKey) : "";
  const { outcome, retry } = useLoaded(parcelKey, getParcel);
  const pendingId = parcelIdFromKey(parcelKey);
  usePageTitle(
    outcome?.status === "found"
      ? pageTitleFor(outcome.parcel)
      : outcome?.status === "missing" || !parcelKey
        ? PARCEL_PAGE.missing.title
        : pendingId
          ? PARCEL_PAGE.title(pendingId)
          : null,
  );

  if (!parcelKey || outcome?.status === "missing") {
    return (
      <section className="sheet">
        <h1>{PARCEL_PAGE.missing.title}</h1>
        <p className="notice" role="status">
          {outcome?.status === "missing"
            ? outcome.message
            : PARCEL_PAGE.missing.body}
        </p>
        <BackLink />
      </section>
    );
  }
  if (outcome === null) {
    return (
      <section className="sheet">
        <h1>{pendingId ? PARCEL_PAGE.title(pendingId) : PARCEL_PAGE.loadingTitle}</h1>
        <p className="notice" role="status">
          {PARCEL_LOAD.loading}
        </p>
        <BackLink />
      </section>
    );
  }
  if (outcome.status === "error") {
    return (
      <section className="sheet">
        <h1>{pendingId ? PARCEL_PAGE.title(pendingId) : PARCEL_PAGE.loadingTitle}</h1>
        <LoadFailure failure={outcome} onRetry={retry} />
        <BackLink />
      </section>
    );
  }

  // Keyed, so moving between parcels starts from a clean slate.
  return <ParcelView key={outcome.parcel.key} parcel={outcome.parcel} />;
}

/**
 * Loads one thing for a parcel key, again on retry. `outcome` is null while
 * the request for the current key and attempt is in flight.
 */
function useLoaded<T extends ParcelOutcome | ReportOutcome>(
  parcelKey: string,
  load: (key: string, signal: AbortSignal) => Promise<T>,
): { outcome: T | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    attempt: number;
    outcome: T;
  } | null>(null);

  useEffect(() => {
    if (!parcelKey) return;
    const controller = new AbortController();
    load(parcelKey, controller.signal).then(
      (outcome) => setSettled({ key: parcelKey, attempt, outcome }),
      () => {
        // Aborted: the key changed or the page closed.
      },
    );
    return () => controller.abort();
  }, [parcelKey, attempt, load]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current =
    settled && settled.key === parcelKey && settled.attempt === attempt;
  return { outcome: current ? settled.outcome : null, retry };
}

/**
 * The staged deals on a parcel, each read from the API. `outcomes` is null
 * while they load, and empty for a parcel with no deal.
 */
function useParcelDeals(parcelKey: string): {
  outcomes: DealOutcome[] | null;
  retry: () => void;
} {
  const ids = useMemo(() => stagedDealIdsFor(parcelKey), [parcelKey]);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    attempt: number;
    outcomes: DealOutcome[];
  } | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    Promise.all(ids.map((id) => getDeal(id, controller.signal))).then(
      (outcomes) => setSettled({ key: parcelKey, attempt, outcomes }),
      () => {
        // Aborted: the key changed or the page closed.
      },
    );
    return () => controller.abort();
  }, [ids, parcelKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (ids.length === 0) return { outcomes: NO_DEALS, retry };
  const current =
    settled && settled.key === parcelKey && settled.attempt === attempt;
  return { outcomes: current ? settled.outcomes : null, retry };
}

const NO_DEALS: DealOutcome[] = [];

function LoadFailure({
  failure,
  onRetry,
}: {
  failure: FailedOutcome;
  onRetry: () => void;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <p>{failure.message}</p>
      {failure.retryable ? (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          {PARCEL_LOAD.retry}
        </button>
      ) : null}
    </div>
  );
}

/** Back to the results or map view the visitor came from, or to a fresh search. */
function BackLink() {
  const { state } = useLocation();
  const fromExplore =
    typeof state === "object" &&
    state !== null &&
    "fromExplore" in state &&
    typeof state.fromExplore === "string" &&
    state.fromExplore.startsWith("/explore")
      ? state.fromExplore
      : "";
  if (fromExplore) {
    return (
      <Link className="parcel-back" to={fromExplore}>
        <span aria-hidden="true">←</span> {PARCEL_PAGE.backToMap}
      </Link>
    );
  }
  const query =
    typeof state === "object" &&
    state !== null &&
    "fromSearch" in state &&
    typeof state.fromSearch === "string"
      ? state.fromSearch
      : "";
  return (
    <Link
      className="parcel-back"
      to={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
    >
      <span aria-hidden="true">←</span>{" "}
      {query ? PARCEL_PAGE.backToResults : PARCEL_PAGE.back}
    </Link>
  );
}

function pageTitleFor(parcel: Parcel): string {
  const street = parcelName(parcel.siteAddress).street;
  return street
    ? PARCEL_PAGE.titled(street, parcel.sourceParcelId)
    : PARCEL_PAGE.title(parcel.sourceParcelId);
}

function ParcelView({ parcel }: { parcel: Parcel }) {
  const { assets, building } = useLandAssets(parcel);
  const mode = useRenderMode();
  const { outcome: reportOutcome, retry: retryReport } = useLoaded(
    parcel.key,
    getParcelReport,
  );
  const report =
    reportOutcome?.status === "found" ? reportOutcome.report : null;
  // Deal state comes from the API. The first staged deal on the parcel is the
  // one the ledger's reviewer cards and escrow strip describe.
  const { outcomes: dealOutcomes, retry: retryDeals } = useParcelDeals(
    parcel.key,
  );
  const primary = dealOutcomes?.[0];
  const primaryDeal = primary?.status === "found" ? primary.deal : null;
  const ledger = useMemo(
    () => getParcelLedger(parcel.key, report, primaryDeal),
    [parcel.key, report, primaryDeal],
  );
  const deals = useMemo(
    () =>
      (dealOutcomes ?? []).flatMap((outcome) =>
        outcome.status === "found" ? [summarizeDeal(outcome.deal)] : [],
      ),
    [dealOutcomes],
  );
  const dealNotice = useMemo(
    () =>
      primary && primary.status !== "found"
        ? { message: primary.message, onRetry: retryDeals }
        : null,
    [primary, retryDeals],
  );
  // A block carried over from the page the visitor came from, read once.
  const location = useLocation();
  const [origin] = useState(() => readBlockOrigin(location.state));
  const [landReady, setLandReady] = useState(false);
  const markLandReady = useCallback(() => setLandReady(true), []);

  // The transition covers the page until the land is drawn, then hands off to it.
  const [revealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (revealed) heading.current?.focus({ preventScroll: true });
  }, [revealed]);
  // Every catalog parcel draws its published OGRIP boundary, so none is a
  // stand-in. Staged closing data is labeled in the ledger instead.
  const staged = false;
  const named = parcelName(parcel.siteAddress);
  const place = [
    named.locality,
    PARCEL_PAGE.county(parcel.county),
    parcel.township,
    parcel.acreage !== undefined
      ? PARCEL_PAGE.acres(parcel.acreage)
      : parcel.mappedAcreage !== undefined
        ? PARCEL_PAGE.mappedAcres(parcel.mappedAcreage)
        : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {!revealed && (
        <BlockTransition
          mode={mode}
          ready={landReady}
          meta={assets?.meta ?? null}
          origin={origin}
          onDone={reveal}
        />
      )}
      <div className="parcel-page" inert={!revealed}>
        <BackLink />
        <div className="parcel-main">
          <header className="parcel-title">
            {staged && <p className="parcel-staged">{PARCEL_PAGE.stagedLabel}</p>}
            <h1
              ref={heading}
              tabIndex={-1}
              data-kind={named.street ? "street" : "id"}
              title={named.published ?? undefined}
            >
              {named.street ?? PARCEL_PAGE.title(parcel.sourceParcelId)}
              {named.noHouseNumber && (
                <span className="parcel-note"> ({PARCEL_PAGE.noHouseNumber})</span>
              )}
            </h1>
            {named.street ? (
              <p className="parcel-id">{PARCEL_PAGE.title(parcel.sourceParcelId)}</p>
            ) : (
              <p className="parcel-address">{PARCEL_PAGE.noAddress}</p>
            )}
            <p className="parcel-place">{place}</p>
            <p className="parcel-key">
              {PARCEL_PAGE.keyLabel} <span>{parcel.key}</span>
            </p>
          </header>
          <LandBlock parcel={parcel} assets={assets} building={building} mode={mode} staged={staged} revealed={revealed} onReady={markLandReady} />
        </div>
        {reportOutcome?.status === "found" && dealOutcomes !== null ? (
          <Ledger
            ledger={ledger}
            deals={deals}
            dealNotice={dealNotice}
            revealed={revealed}
            animated={mode !== "reduced"}
          />
        ) : (
          <section className="ledger ledger-pending" aria-live="polite">
            {reportOutcome === null || reportOutcome.status === "found" ? (
              <p className="notice" role="status">
                {PARCEL_LOAD.reportLoading}
              </p>
            ) : reportOutcome.status === "error" ? (
              <LoadFailure failure={reportOutcome} onRetry={retryReport} />
            ) : (
              <p className="notice" role="status">
                {reportOutcome.message}
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
