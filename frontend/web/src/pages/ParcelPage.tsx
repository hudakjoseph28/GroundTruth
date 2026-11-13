import { Link, useParams } from "react-router-dom";
import { CheckList } from "../components/CheckList";
import { ParcelBoundary } from "../components/ParcelBoundary";
import { getParcel, getParcelReport } from "../data/parcelSource";
import { stagedDeal } from "@groundtruth/shared";

export function ParcelPage() {
  const params = useParams();
  const parcelKey = params.parcelKey
    ? decodeURIComponent(params.parcelKey)
    : "";
  const parcel = parcelKey ? getParcel(parcelKey) : null;

  if (!parcel) {
    return (
      <section className="sheet">
        <h1>Parcel not in the staged catalog</h1>
        <p className="notice" role="status">
          That parcel ID is not in the staged fixture. Live Ohio records are not
          connected.
        </p>
        <Link to="/">Back to search</Link>
      </section>
    );
  }

  const report = getParcelReport(parcel.key);
  const linkedDeal = stagedDeal.parcelKey === parcel.key ? stagedDeal : null;

  return (
    <article className="parcel">
      <header className="sheet">
        <p className="eyebrow">Staged on devnet</p>
        <h1>{parcel.sourceParcelId}</h1>
        <p>
          {parcel.county} County
          {parcel.township ? ` · ${parcel.township}` : ""}
          {parcel.acreage !== undefined ? ` · ${parcel.acreage} acres` : ""}
        </p>
        <p className="quiet">Parcel key {parcel.key}</p>
      </header>
      <div className="parcel-grid">
        <ParcelBoundary geometry={parcel.geometry} />
        <CheckList report={report} />
      </div>
      {linkedDeal ? (
        <aside className="sheet">
          <h2>Staged closing</h2>
          <p>
            Deal {linkedDeal.id} is {linkedDeal.state}. The closing screen is
            not part of this pass, and no funds have moved.
          </p>
        </aside>
      ) : null}
    </article>
  );
}
