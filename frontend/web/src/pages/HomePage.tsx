import { Link } from "react-router-dom";
import { GlobeSlot } from "../globe/GlobeSlot";
import { SearchForm } from "../components/SearchForm";
import { sampleParcelPath } from "../data/parcelSource";
import { CHECK_LABELS, DOCUMENTED_CHECKS } from "../labels";

export function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">
            <span>Know the land.</span> <span>Know what comes next.</span>
          </h1>
          <SearchForm autoFocus showSampleLink={false} />
          <p className="hero-status">
            Preview: staged sample parcel. Try{" "}
            <Link to={sampleParcelPath()}>STAGED-DEMO</Link>.
          </p>
        </div>
        <GlobeSlot />
      </section>
      <section id="how-it-works" className="band">
        <h2>How it works</h2>
        <ol>
          <li>Search by address or parcel ID.</li>
          <li>Read what is known and what is still open.</li>
          <li>A reviewer signs before any money moves.</li>
        </ol>
      </section>
      <section id="what-we-check" className="band">
        <h2>What we check</h2>
        <ul className="kind-list">
          {DOCUMENTED_CHECKS.map((kind) => (
            <li key={kind}>{CHECK_LABELS[kind]}</li>
          ))}
        </ul>
        <p className="quiet">
          A status is shown only when a report includes that check. Missing
          evidence stays unknown.
        </p>
      </section>
      <section id="coverage" className="band">
        <h2>Ohio coverage</h2>
        <p>
          Live county coverage is not connected. The staged catalog has one
          Franklin County stand-in. Its parcel ID is STAGED-DEMO.
        </p>
      </section>
      <section id="account" className="band">
        <h2>Sign in</h2>
        <p>Research does not need an account. This demo has no sign-in.</p>
      </section>
    </>
  );
}
