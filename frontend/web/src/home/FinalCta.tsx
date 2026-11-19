import { Link } from "react-router-dom";
import { SearchForm } from "../components/SearchForm";
import { CTA } from "../content/home";
import { PROOF_LINK } from "../content/proof";
import { DEMO } from "../content/site";
import { sampleParcelPath } from "../data/parcelSource";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";
import { LivingParcel } from "./LivingParcel";
import { Reveal } from "./Reveal";

const warmSlot = () => void readDevnetSlot();

/** Last push: search again or open the demo, beside a smaller copy of the hero's parcel. */
export function FinalCta() {
  return (
    <Reveal className="section final-cta">
      <section aria-labelledby="cta-title">
        <div className="cta-land">
          <LivingParcel variant="compact" />
        </div>
        <div className="cta-copy">
          <h2 id="cta-title">{CTA.title}</h2>
          <SearchForm ariaLabel={CTA.searchLabel} showSampleLink={false} launchEmpty />
          <div className="cta-actions">
            <Link
              className="btn"
              to={sampleParcelPath()}
              onPointerDown={warmSlot}
              onFocus={warmSlot}
            >
              {DEMO.label}
            </Link>
            <Link className="btn" to="/proof">
              {PROOF_LINK.home}
            </Link>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
