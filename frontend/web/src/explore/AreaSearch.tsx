import type { ParcelOutline, ParcelSearchResult } from "@groundtruth/shared";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { EXPLORE_MAP } from "../content/explore";
import { SEARCH } from "../content/search";
import { formatSiteAddress } from "../data/address";
import { searchParcels, type Bbox, type SearchOutcome } from "../data/parcelSource";
import { containsPoint, distanceKm } from "./bbox";
import type { ParcelSummary } from "./ParcelCard";

const MAX_IN_VIEW = 5;
const MAX_ELSEWHERE = 8;

export interface MapView {
  bbox: Bbox;
  center: { latitude: number; longitude: number };
}

type Results = {
  query: string;
  inView: ParcelSummary[];
  /** Null while Ohio's records answer. */
  elsewhere: SearchOutcome | null;
  center: MapView["center"];
};

/**
 * "Search this area": the parcels already drawn in the view that match, at
 * once, then Ohio's parcel records for the same words, nearest the view
 * first. Picking one moves the map there and opens its card.
 */
export function AreaSearch({
  view,
  drawn,
  onPick,
}: {
  /** The map's current view, read when the search runs. */
  view: () => MapView | null;
  /** The parcels the map holds right now. */
  drawn: () => readonly ParcelOutline[];
  onPick: (parcel: ParcelSummary) => void;
}) {
  const fieldId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    const current = view();
    if (!text || !current) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;

    const wanted = normalize(text);
    const inView = drawn()
      .filter(
        (parcel) =>
          containsPoint(current.bbox, parcel.centroid) &&
          (normalize(parcel.siteAddress ?? "").includes(wanted) ||
            normalize(parcel.sourceParcelId).includes(wanted)),
      )
      .slice(0, MAX_IN_VIEW);
    setResults({ query: text, inView, elsewhere: null, center: current.center });

    searchParcels(text, next.signal).then(
      (outcome) =>
        setResults((was) => (was && was.query === text ? { ...was, elsewhere: outcome } : was)),
      () => {
        // Aborted by a newer search.
      },
    );
  }

  function pick(parcel: ParcelSummary) {
    setResults(null);
    onPick(parcel);
  }

  function clear() {
    controller.current?.abort();
    setQuery("");
    setResults(null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && (results || query)) {
      // Close the list first; the card's Escape waits for the next press.
      event.stopPropagation();
      if (results) setResults(null);
      else clear();
    }
  }

  const shownKeys = new Set(results?.inView.map((parcel) => parcel.key));
  const elsewhere =
    results?.elsewhere?.status === "results"
      ? nearestFirst(results.elsewhere.results, results.center)
          .filter((result) => !shownKeys.has(result.parcel.key))
          .slice(0, MAX_ELSEWHERE)
      : [];

  return (
    <form
      className="explore-search"
      role="search"
      aria-label={EXPLORE_MAP.search.label}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
    >
      <label className="visually-hidden" htmlFor={fieldId}>
        {EXPLORE_MAP.search.label}
      </label>
      <div className="explore-search-row">
        <svg className="search-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" />
          <path d="m10.5 10.5 3.4 3.4" />
        </svg>
        <input
          id={fieldId}
          name="q"
          value={query}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={EXPLORE_MAP.search.placeholder}
          title={EXPLORE_MAP.search.hint}
          aria-controls={results ? listId : undefined}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button type="button" className="explore-search-clear" onClick={clear}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 6 8 8M14 6l-8 8" />
            </svg>
            <span className="visually-hidden">{EXPLORE_MAP.search.clear}</span>
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary btn-small">
          {EXPLORE_MAP.search.submit}
        </button>
      </div>

      {results ? (
        <div className="explore-results" id={listId}>
          {results.inView.length > 0 ? (
            <ResultGroup
              label={EXPLORE_MAP.search.inView}
              items={results.inView.map((parcel) => ({ parcel }))}
              onPick={pick}
            />
          ) : null}
          {results.elsewhere === null ? (
            <p className="explore-results-note" role="status">
              {EXPLORE_MAP.search.searching}
            </p>
          ) : results.elsewhere.status === "results" ? (
            elsewhere.length > 0 ? (
              <ResultGroup
                label={EXPLORE_MAP.search.elsewhere}
                items={elsewhere.map((result) => ({
                  parcel: result.parcel,
                  note: EXPLORE_MAP.search.away(distanceKm(results.center, result.parcel.centroid)),
                }))}
                onPick={pick}
              />
            ) : null
          ) : results.inView.length === 0 || results.elsewhere.status === "error" ? (
            <p
              className={results.elsewhere.status === "error" ? "explore-results-note is-error" : "explore-results-note"}
              role="status"
            >
              {results.elsewhere.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function ResultGroup({
  label,
  items,
  onPick,
}: {
  label: string;
  items: { parcel: ParcelSummary; note?: string }[];
  onPick: (parcel: ParcelSummary) => void;
}) {
  const labelId = useId();
  return (
    <div className="explore-results-group">
      <p className="explore-results-label" id={labelId}>
        {label}
      </p>
      <ul aria-labelledby={labelId}>
        {items.map(({ parcel, note }) => {
          const address = formatSiteAddress(parcel.siteAddress);
          return (
            <li key={parcel.key}>
              <button type="button" onClick={() => onPick(parcel)}>
                <span className="explore-result-address">{address ? address.text : SEARCH.noAddress}</span>
                <span className="explore-result-meta">
                  {SEARCH.county(parcel.county)} · {SEARCH.parcelId(parcel.sourceParcelId)}
                  {note ? ` · ${note}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function nearestFirst(
  results: ParcelSearchResult[],
  center: MapView["center"],
): ParcelSearchResult[] {
  return [...results].sort(
    (a, b) => distanceKm(center, a.parcel.centroid) - distanceKm(center, b.parcel.centroid),
  );
}

/** Capitals and digits only, so "84 w dodridge" finds "84 W DODRIDGE ST". */
function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
