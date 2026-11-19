import { ExploreLink } from "../components/ExploreLink";
import { Link } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { ATTESTATION_COPY } from "../content/attestations";
import { HERO } from "../content/home";
import { Icon } from "./icons";
import { LivingParcel } from "./LivingParcel";

/**
 * The first screen: the headline and a working search on the left, and on the
 * right the demo parcel on a quiet ground sheet, with its record pinned to it.
 */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-backdrop" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">{HERO.eyebrow}</p>
          <h1 id="hero-title">
            {HERO.headline.map((line) => (
              <span key={line} className="hero-line">
                {line}{" "}
              </span>
            ))}
          </h1>
          <p className="hero-lede">{HERO.subhead}</p>
          <SearchForm
            autoFocus
            showSampleLink={false}
            launchEmpty
            ariaLabel={HERO.searchLabel}
          />
          <p className="hero-hint">
            {HERO.hintLead}{" "}
            <Link
              className="hint-chip"
              to={`/search?q=${encodeURIComponent(HERO.hints[0].query)}`}
            >
              {HERO.hints[0].query}
            </Link>{" "}
            {HERO.hintOr}{" "}
            <Link
              className="hint-chip"
              to={`/search?q=${encodeURIComponent(HERO.hints[1].query)}`}
            >
              {HERO.hints[1].query}
            </Link>
          </p>
          <ExploreLink />
          <ul className="hero-trust">
            {HERO.trust.map((item) => (
              <li key={item.label}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <LivingParcel variant="hero" />
      </div>
      <p className="hero-caption">{ATTESTATION_COPY.caption}</p>
    </section>
  );
}
