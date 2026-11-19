import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExploreLink } from "../components/ExploreLink";
import { SearchForm } from "../components/SearchForm";
import { goldenParcel, type ParcelSearchResult } from "@groundtruth/shared";
import { SAVED_DEMO, SEARCH, SEARCH_EXAMPLES } from "../content/search";
import { parcelName } from "../data/address";
import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
} from "../data/recentSearches";
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
  const [recent, setRecent] = useState<string[]>(() => readRecentSearches());

  // No query yet is the start of a search, not a mistake.
  const blank = query.trim() === "";
  const invalid = blank ? null : invalidQuery(query);
  usePageTitle(blank ? SEARCH.title : `${query} · ${SEARCH.title}`);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || invalidQuery(trimmed)) return;
    setRecent(rememberSearch(trimmed));
  }, [query]);

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
    <section className="sheet search-page">
      <h1>{SEARCH.title}</h1>
      <SearchForm
        key={query}
        initialQuery={query}
        autoFocus
        showSampleLink={false}
      />
      {!blank && <SearchExamples current={query} />}
      <ExploreLink />
      {blank ? (
        <SearchStart
          recent={recent}
          onClear={() => {
            clearRecentSearches();
            setRecent([]);
          }}
        />
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
                data-featured={
                  result.parcel.key === goldenParcel.key || undefined
                }
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

/** The same name the parcel page uses, then place and the county parcel ID. */
function ResultCard({ result }: { result: ParcelSearchResult }) {
  const { parcel } = result;
  const named = parcelName(parcel.siteAddress);
  const acreage =
    parcel.acreage !== undefined
      ? SEARCH.acres(parcel.acreage)
      : parcel.mappedAcreage !== undefined
        ? SEARCH.mappedAcres(parcel.mappedAcreage)
        : SEARCH.noAcreage;
  return (
    <>
      {/* The county's own text on hover. */}
      <span className="result-address" title={named.published ?? undefined}>
        {named.street ?? SEARCH.parcelId(parcel.sourceParcelId)}
        {named.noHouseNumber ? (
          <span className="quiet"> ({SEARCH.noHouseNumber})</span>
        ) : null}
      </span>
      <span className="result-facts">
        {named.locality ? <span>{named.locality}</span> : null}
        <span>{SEARCH.county(parcel.county)}</span>
        <span>{acreage}</span>
      </span>
      <span className="result-meta quiet">
        {named.street ? (
          <span className="result-id">
            {SEARCH.parcelId(parcel.sourceParcelId)}
          </span>
        ) : (
          <span>{SEARCH.noAddress}</span>
        )}
        <span>
          {result.parcel.key === goldenParcel.key
            ? SAVED_DEMO.why
            : result.matchedOn === "siteAddress"
              ? SEARCH.matchedAddress
              : SEARCH.matchedParcelId}
        </span>
      </span>
    </>
  );
}

/** Coverage, the demo parcel, then searches this browser has already run. */
function SearchStart({
  recent,
  onClear,
}: {
  recent: readonly string[];
  onClear: () => void;
}) {
  const rest = recent.filter((item) => item !== SAVED_DEMO.query);
  return (
    <div className="search-start">
      <p className="search-coverage">{SEARCH.coverage}</p>
      <div className="search-saved">
        <p>{SEARCH.saved}</p>
        <Link
          className="saved-demo"
          to={`/search?q=${encodeURIComponent(SAVED_DEMO.query)}`}
        >
          <span className="saved-demo-flag">{SAVED_DEMO.why}</span>
          <span className="result-address">
            {SAVED_DEMO.name}{" "}
            <span className="quiet">({SEARCH.noHouseNumber})</span>
          </span>
          <span className="result-facts">
            <span>{SEARCH.county(SAVED_DEMO.county)}</span>
          </span>
          <span className="result-meta quiet">
            <span className="result-id">
              {SEARCH.parcelId(SAVED_DEMO.parcelId)}
            </span>
          </span>
        </Link>
      </div>
      {rest.length > 0 && (
        <div className="search-recent">
          <p>
            {SEARCH.recent}
            <button type="button" onClick={onClear}>
              {SEARCH.clearRecent}
            </button>
          </p>
          <ul>
            {rest.map((item, index) => (
              <li
                key={item}
                style={{ animationDelay: `${160 + index * 50}ms` }}
              >
                <Link to={`/search?q=${encodeURIComponent(item)}`}>{item}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
              aria-current={
                example.query === current.trim() ? "page" : undefined
              }
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
