import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { stagedParcel, type Parcel } from "@groundtruth/shared";
import { PARCEL_PAGE } from "../content/parcel";
import { getParcelLedger } from "../data/ledger";
import { getParcel } from "../data/parcelSource";
import { BlockTransition } from "../parcel/BlockTransition/BlockTransition";
import { Ledger } from "../parcel/Ledger/Ledger";
import { LandBlock } from "../parcel/ParcelScene/LandBlock";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";
import { useRenderMode } from "../parcel/useRenderMode";
import "../parcel/parcel.css";

export function ParcelPage() {
  const params = useParams();
  const parcelKey = params.parcelKey ? decodeURIComponent(params.parcelKey) : "";
  const parcel = parcelKey ? getParcel(parcelKey) : null;

  if (!parcel) {
    return (
      <section className="sheet">
        <h1>{PARCEL_PAGE.missing.title}</h1>
        <p className="notice" role="status">
          {PARCEL_PAGE.missing.body}
        </p>
        <BackLink />
      </section>
    );
  }

  // Keyed, so moving between parcels starts from a clean slate.
  return <ParcelView key={parcel.key} parcel={parcel} />;
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
  const ledger = useMemo(() => getParcelLedger(parcel.key), [parcel.key]);
  const [landReady, setLandReady] = useState(false);
  const markLandReady = useCallback(() => setLandReady(true), []);

  // The transition covers the page until the land is drawn, then hands off to it.
  const [revealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (revealed) heading.current?.focus({ preventScroll: true });
  }, [revealed]);
  // Only the shared fixture's parcel is a stand-in; real parcels carry no such label.
  const staged = parcel.key === stagedParcel.key;
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
        <BlockTransition mode={mode} ready={landReady} meta={assets?.meta ?? null} onDone={reveal} />
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
        <Ledger ledger={ledger} />
      </div>
    </>
  );
}
