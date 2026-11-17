import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Parcel } from "@groundtruth/shared";
import { PARCEL_PAGE } from "../content/parcel";
import { PARCEL_LOAD } from "../content/search";
import { getParcelLedger } from "../data/ledger";
import {
  getParcel,
  getParcelReport,
  type FailedOutcome,
  type ParcelOutcome,
  type ReportOutcome,
} from "../data/parcelSource";
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
        <h1>{parcelKey}</h1>
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
        <h1>{parcelKey}</h1>
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

function BackLink() {
  return (
    <Link className="parcel-back" to="/search">
      <span aria-hidden="true">←</span> {PARCEL_PAGE.back}
    </Link>
  );
}

function ParcelView({ parcel }: { parcel: Parcel }) {
  const assets = useLandAssets(parcel.sourceParcelId);
  const mode = useRenderMode();
  const { outcome: reportOutcome, retry: retryReport } = useLoaded(
    parcel.key,
    getParcelReport,
  );
  const report =
    reportOutcome?.status === "found" ? reportOutcome.report : null;
  const ledger = useMemo(
    () => getParcelLedger(parcel.key, report),
    [parcel.key, report],
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
  const place = [
    PARCEL_PAGE.county(parcel.county),
    parcel.township,
    parcel.acreage === undefined ? undefined : PARCEL_PAGE.acres(parcel.acreage),
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
            <h1 ref={heading} tabIndex={-1}>{parcel.sourceParcelId}</h1>
            <p className="parcel-place">{place}</p>
            <p className="parcel-key">
              {PARCEL_PAGE.keyLabel} <span>{parcel.key}</span>
            </p>
          </header>
          <LandBlock parcel={parcel} assets={assets} mode={mode} staged={staged} revealed={revealed} onReady={markLandReady} />
        </div>
        {reportOutcome?.status === "found" ? (
          <Ledger
            ledger={ledger}
            revealed={revealed}
            animated={mode !== "reduced"}
          />
        ) : (
          <section className="ledger ledger-pending" aria-live="polite">
            {reportOutcome === null ? (
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
