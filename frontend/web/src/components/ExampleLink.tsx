import { Link } from "react-router-dom";
import { EXAMPLE, EXAMPLE_PATHS } from "../content/example";
import "../example/example.css";

/** The way from a search box to the example parcel. */
export function ExampleLink() {
  return (
    <Link className="example-link" to={EXAMPLE_PATHS.parcel}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" />
        <path d="M2 5l6 3.5L14 5M8 8.5v6" />
      </svg>
      <span>{EXAMPLE.link}</span>
      <span className="example-link-note">{EXAMPLE.linkNote}</span>
    </Link>
  );
}
