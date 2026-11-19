import type { Parcel } from "@groundtruth/shared";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { EXPLORE_MAP } from "../content/explore";
import { SEARCH } from "../content/search";
import { formatSiteAddress } from "../data/address";
import { parcelPath } from "../data/parcelSource";

export type ParcelSummary = Omit<Parcel, "geometry">;

/**
 * The parcel the visitor tapped: its published address, county, and acreage,
 * and the way into its report. On a phone it sits at the bottom like a sheet.
 */
export function ParcelCard({
  parcel,
  backTo,
  takeFocus,
  onClose,
}: {
  parcel: ParcelSummary;
  /** Where the report's back link returns: this map, at this view. */
  backTo: string;
  /** Move focus to the card: true when it was picked from search, not tapped on the map. */
  takeFocus: boolean;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const address = formatSiteAddress(parcel.siteAddress);
  const acreage =
    parcel.acreage !== undefined
      ? SEARCH.acres(parcel.acreage)
      : parcel.mappedAcreage !== undefined
        ? SEARCH.mappedAcres(parcel.mappedAcreage)
        : SEARCH.noAcreage;

  // A parcel picked from search takes focus, so the keyboard lands on it; a
  // tap on the map leaves focus where it was.
  useEffect(() => {
    if (takeFocus) heading.current?.focus({ preventScroll: true });
  }, [parcel.key, takeFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="explore-card" aria-label={EXPLORE_MAP.card.label} aria-live="polite">
      <button type="button" className="explore-card-close" onClick={onClose}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
        <span className="visually-hidden">{EXPLORE_MAP.card.close}</span>
      </button>
      <h2 ref={heading} tabIndex={-1} title={address?.published}>
        {address ? address.text : SEARCH.noAddress}
        {address?.noHouseNumber ? <span className="quiet"> ({SEARCH.noHouseNumber})</span> : null}
      </h2>
      <ul className="explore-card-facts">
        <li>{SEARCH.county(parcel.county)}</li>
        <li>{acreage}</li>
        <li className="explore-card-id">{SEARCH.parcelId(parcel.sourceParcelId)}</li>
      </ul>
      <Link
        className="btn btn-primary explore-card-open"
        to={parcelPath(parcel.key)}
        state={{ fromExplore: backTo }}
      >
        {EXPLORE_MAP.card.open}
      </Link>
      <p className="explore-card-note quiet">{EXPLORE_MAP.card.source}</p>
    </section>
  );
}
