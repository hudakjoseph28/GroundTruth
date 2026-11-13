import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sampleParcelPath } from "../data/parcelSource";

export function SearchForm({
  initialQuery = "",
  autoFocus = false,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const fieldId = useId();
  const [query, setQuery] = useState(initialQuery);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = query.trim();
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  }

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <label htmlFor={fieldId}>Address or parcel ID</label>
      <div className="search-row">
        <input
          id={fieldId}
          name="q"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder="123 Main St or STAGED-DEMO"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Find parcel</button>
      </div>
      <Link className="sample-link" to={sampleParcelPath()}>
        Explore a sample parcel
      </Link>
    </form>
  );
}
