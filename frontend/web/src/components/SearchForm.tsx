import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sampleParcelPath } from "../data/parcelSource";

const FIELD_LABEL = "Parcel ID or address";

export function SearchForm({
  initialQuery = "",
  autoFocus = false,
  showSampleLink = true,
  ariaLabel,
}: {
  initialQuery?: string;
  /** Put the cursor in the field when the page opens, where there is a keyboard. */
  autoFocus?: boolean;
  showSampleLink?: boolean;
  /** Names this search landmark when a page has more than one. */
  ariaLabel?: string;
}) {
  const navigate = useNavigate();
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);

  // Not the autofocus attribute: that would scroll the page, and on a phone it
  // would open the keyboard over the content.
  useEffect(() => {
    if (!autoFocus || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    field.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = query.trim();
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  }

  return (
    <form className="search" role="search" aria-label={ariaLabel} onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor={fieldId}>
        {FIELD_LABEL}
      </label>
      <div className="search-row">
        <svg className="search-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" />
          <path d="m10.5 10.5 3.4 3.4" />
        </svg>
        <input
          ref={field}
          id={fieldId}
          name="q"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder={FIELD_LABEL}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Find parcel
        </button>
      </div>
      {showSampleLink ? (
        <Link className="sample-link" to={sampleParcelPath()}>
          Explore a sample parcel
        </Link>
      ) : null}
    </form>
  );
}
