import { GlobeSlot } from "../components/GlobeSlot";
import { SearchForm } from "../components/SearchForm";
import { CHECK_LABELS, DOCUMENTED_CHECKS } from "../labels";

export function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="live">
            <span className="live-dot" aria-hidden="true" />
            Live on Solana devnet
          </p>
          <h1>Know the land. Know what comes next.</h1>
          <SearchForm autoFocus />
          <p className="quiet">
            This preview searches one staged parcel. Live Ohio records are not
            connected.
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
