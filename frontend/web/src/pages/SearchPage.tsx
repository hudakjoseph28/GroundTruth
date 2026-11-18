import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { SEARCH } from "../content/search";
import { formatSiteAddress } from "../data/address";
import {
  invalidQuery,
  parcelPath,
  searchParcels,
  type SearchOutcome,
} from "../data/parcelSource";
import { usePageTitle } from "../layout/usePageTitle";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";

// The parcel transition shows real devnet slots; asking as the visitor reaches
// for a result gives the answer a head start.
const warmSlot = () => void readDevnetSlot();

type SearchState = { query: string; attempt: number; outcome: SearchOutcome };

export function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SearchState | null>(null);

  // No query yet is the start of a search, not a mistake.
  const blank = query.trim() === "";
  const invalid = blank ? null : invalidQuery(query);
  usePageTitle(blank ? SEARCH.title : `${query} · ${SEARCH.title}`);

  useEffect(() => {
    if (query.trim() === "" || invalidQuery(query)) return;
    const controller = new AbortController();
    searchParcels(query, controller.signal).then(
      (outcome) => setSettled({ query, attempt, outcome }),
      () => {
        // Aborted: a newer search replaced this one.
      },
    );
    return () => controller.abort();
  }, [query, attempt]);

  // A result for an older query or attempt is stale: show loading instead.
  const outcome =
    invalid ??
    (settled && settled.query === query && settled.attempt === attempt
      ? settled.outcome
      : null);

  return (
    <section className="sheet">
      <h1>{SEARCH.title}</h1>
      <SearchForm initialQuery={query} />
      {blank ? (
        <div className="search-start">
          <p>{SEARCH.lede}</p>
          <Examples />
        </div>
      ) : outcome === null ? (
        <SearchLoading />
      ) : outcome.status === "results" ? (
        <ul className="results">
          {outcome.results.map((result) => (
            <li key={result.parcel.key}>
              <Link
                to={parcelPath(result.parcel.key)}
                state={{ fromSearch: query }}
                onPointerDown={warmSlot}
                onFocus={warmSlot}
              >
                <span className="result-id">
                  {result.parcel.sourceParcelId}
                </span>
                <span>{SEARCH.county(result.parcel.county)}</span>
                <ResultAddress published={result.parcel.siteAddress} />
                {result.parcel.township ? (
                  <span>{result.parcel.township}</span>
                ) : null}
                {result.parcel.acreage !== undefined ? (
                  <span>{SEARCH.acres(result.parcel.acreage)}</span>
                ) : null}
                <span className="quiet">
                  {result.matchedOn === "siteAddress"
                    ? SEARCH.matchedAddress
                    : SEARCH.matchedParcelId}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : outcome.status === "error" ? (
        <div className="notice notice-error" role="alert">
          <p>{outcome.message}</p>
          {outcome.retryable ? (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {SEARCH.retry}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="notice" role="status">
            {outcome.message}
          </p>
          {outcome.status === "empty" ? <Examples /> : null}
        </>
      )}
    </section>
  );
}

/** The address as a person would write it, with the county's own text on hover. */
function ResultAddress({ published }: { published: string | undefined }) {
  const address = formatSiteAddress(published);
  if (!address) return null;
  return (
    <span title={address.published}>
      {address.text}
      {address.noHouseNumber ? (
        <span className="quiet"> ({SEARCH.noHouseNumber})</span>
      ) : null}
    </span>
  );
}

/** Searches known to return a parcel, so nobody starts from a blank field. */
function Examples() {
  return (
    <div className="search-examples">
      <p>{SEARCH.examplesLabel}</p>
      <ul>
        {SEARCH.examples.map((example) => (
          <li key={example.query}>
            <Link to={`/search?q=${encodeURIComponent(example.query)}`}>
              {example.query}
            </Link>
            <span className="quiet">{example.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Placeholder rows in the results' shape, while Ohio's records answer. */
function SearchLoading() {
  return (
    <div className="search-loading">
      <p className="notice" role="status">
        {SEARCH.loading}
      </p>
      <ul className="results" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <li key={row}>
            <span className="result-skeleton" />
          </li>
        ))}
      </ul>
    </div>
  );
}
