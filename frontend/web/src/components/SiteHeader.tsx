import { Link } from "react-router-dom";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" to="/">
        GroundTruth
      </Link>
      <nav aria-label="Page">
        <a href="/#how-it-works">How it works</a>
        <a href="/#coverage">Coverage</a>
        <a href="/#account">Sign in</a>
      </nav>
    </header>
  );
}
