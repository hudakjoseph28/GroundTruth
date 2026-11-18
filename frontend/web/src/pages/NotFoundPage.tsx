import { Link, useLocation } from "react-router-dom";
import { NOT_FOUND } from "../content/deal";
import { sampleParcelPath } from "../data/parcelSource";
import "../deal/deal.css";

/** Any address the app has no page for. */
export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <section className="sheet deal-plain">
      <p className="eyebrow">404</p>
      <h1>{NOT_FOUND.title}</h1>
      <p className="notice" role="status">
        {NOT_FOUND.body} <span className="mono">{pathname}</span>
      </p>
      <p className="plain-actions">
        <Link className="btn btn-primary" to="/">
          {NOT_FOUND.home}
        </Link>
        <Link className="btn" to="/search">
          {NOT_FOUND.search}
        </Link>
        <Link className="btn" to={sampleParcelPath()}>
          {NOT_FOUND.parcel}
        </Link>
      </p>
    </section>
  );
}
