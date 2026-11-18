import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import type { ParcelSearchResult } from "@groundtruth/shared";
import { SEARCH, SEARCH_EXAMPLES } from "../content/search";
import { displayAddress } from "../data/address";
import {
  invalidQuery,
  parcelPath,
  searchParcels,
  type SearchOutcome,
} from "../data/parcelSource";
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

  const invalid = invalidQuery(query);

  useEffect(() => {
    if (invalidQuery(query)) return;
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
      <h1>Search</h1>
      <SearchForm key={query} initialQuery={query} />
      <SearchExamples current={query} />
      {outcome === null ? (
        <SearchLoading />
      ) : outcome.status === "results" ? (
        <ul className="results">
          {outcome.results.map((result) => (
            <li key={result.parcel.key}>
              <Link
                to={parcelPath(result.parcel.key)}
                onPointerDown={warmSlot}
                onFocus={warmSlot}
              >
                <ResultCard result={result} />
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
        <p className="notice" role="status">
          {outcome.message}
        </p>
      )}
    </section>
  );
}

/** Searches known to return a real parcel, one tap away. */
function SearchExamples({ current }: { current: string }) {
  return (
    <div className="search-examples">
      <span className="quiet" id="search-examples-label">
        {SEARCH.examplesLabel}
      </span>
      <ul aria-labelledby="search-examples-label">
        {SEARCH_EXAMPLES.map((example) => (
          <li key={example.query}>
            <Link
              className="example-chip"
              to={`/search?q=${encodeURIComponent(example.query)}`}
              aria-current={example.query === current.trim() ? "page" : undefined}
            >
              <span className="example-kind">{example.kind}</span>
              {example.query}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Address first, then county and acreage, then the parcel ID. */
function ResultCard({ result }: { result: ParcelSearchResult }) {
  const { parcel } = result;
  const address = displayAddress(parcel.siteAddress);
  const acreage =
    parcel.acreage !== undefined
      ? SEARCH.acres(parcel.acreage)
      : parcel.mappedAcreage !== undefined
        ? SEARCH.mappedAcres(parcel.mappedAcreage)
        : SEARCH.noAcreage;
  return (
    <>
      <span className="result-address">
        {address ? address.line : SEARCH.noAddress}
        {address?.noHouseNumber ? (
          <span className="quiet"> ({SEARCH.noHouseNumber})</span>
        ) : null}
      </span>
      <span className="result-facts">
        <span>{SEARCH.county(parcel.county)}</span>
        <span>{acreage}</span>
      </span>
      <span className="result-meta quiet">
        <span className="result-id">{SEARCH.parcelId(parcel.sourceParcelId)}</span>
        <span>
          {result.matchedOn === "siteAddress"
            ? SEARCH.matchedAddress
            : SEARCH.matchedParcelId}
        </span>
      </span>
    </>
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
