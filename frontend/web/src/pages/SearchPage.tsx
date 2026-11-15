import { Link, useSearchParams } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { parcelPath, searchParcels } from "../data/parcelSource";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";

// The parcel transition shows real devnet slots; asking as the visitor reaches
// for a result gives the answer a head start.
const warmSlot = () => void readDevnetSlot();

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
              <Link to={parcelPath(result.parcel.key)} onPointerDown={warmSlot} onFocus={warmSlot}>
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
