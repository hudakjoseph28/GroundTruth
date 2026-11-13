import { Link, useSearchParams } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { parcelPath, searchParcels } from "../data/parcelSource";

export function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q") ?? "";
  const outcome = searchParcels(query);

  return (
    <section className="sheet">
      <h1>Search</h1>
      <SearchForm initialQuery={query} />
      {outcome.status === "results" ? (
        <ul className="results">
          {outcome.results.map((result) => (
            <li key={result.parcel.key}>
              <Link to={parcelPath(result.parcel.key)}>
                <span className="result-id">
                  {result.parcel.sourceParcelId}
                </span>
                <span>{result.parcel.county} County</span>
                {result.parcel.township ? (
                  <span>{result.parcel.township}</span>
                ) : null}
                {result.parcel.acreage !== undefined ? (
                  <span>{result.parcel.acreage} acres</span>
                ) : null}
                <span className="quiet">
                  {result.matchedOn === "siteAddress"
                    ? "Matched address"
                    : "Matched parcel ID"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice" role="status">
          {outcome.message}
        </p>
      )}
    </section>
  );
}
