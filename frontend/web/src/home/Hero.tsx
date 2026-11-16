import { Link } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { ATTESTATION_COPY } from "../content/attestations";
import { HERO } from "../content/home";
import { sampleParcelPath } from "../data/parcelSource";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";
import { Icon } from "./icons";
import { LivingParcel } from "./LivingParcel";

const warmSlot = () => void readDevnetSlot();

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
          <SearchForm autoFocus showSampleLink={false} ariaLabel={HERO.searchLabel} />
          <p className="hero-demo">
            {HERO.demo.before}{" "}
            <Link
              className="hero-demo-chip"
              to={sampleParcelPath()}
              onPointerDown={warmSlot}
              onFocus={warmSlot}
            >
              {HERO.demo.parcelId}
            </Link>
          </p>
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
