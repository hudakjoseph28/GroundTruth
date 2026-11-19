import { Link } from "react-router-dom";
import { EXPLORE_MAP } from "../content/explore";

/** The way from a search box to the map of Ohio's parcels. */
export function ExploreLink() {
  return (
    <Link className="explore-link" to="/explore">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5z" />
        <path d="M5.5 2v10.5M10.5 3.5V14" />
      </svg>
      <span>{EXPLORE_MAP.link}</span>
      <span className="explore-link-note">{EXPLORE_MAP.linkNote}</span>
    </Link>
  );
}
