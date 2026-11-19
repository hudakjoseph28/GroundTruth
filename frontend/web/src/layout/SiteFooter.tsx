import { Link } from "react-router-dom";
import { FOOTER, NAV, ROADMAP_LINK, SITE } from "../content/site";
import { shortAddress } from "../data/ledger";
import { sampleParcelPath } from "../data/parcelSource";
import { CopyButton } from "../parcel/Ledger/CopyButton";
import { BrandMark } from "./BrandMark";

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden"> ({SITE.newTab})</span>
    </a>
  );
}

/** Quiet but complete. A link we do not have yet is left out, not guessed. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <nav aria-labelledby="footer-product">
          <h2 id="footer-product">{FOOTER.columns.product}</h2>
          <ul>
            {NAV.map((item) => (
              <li key={item.hash}>
                <Link to={{ pathname: "/", hash: `#${item.hash}` }}>{item.label}</Link>
              </li>
            ))}
            <li>
              <Link to={ROADMAP_LINK.to}>{ROADMAP_LINK.label}</Link>
            </li>
            <li>
              <Link to={sampleParcelPath()}>{FOOTER.demoParcel}</Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-developers">
          <h2 id="footer-developers">{FOOTER.columns.developers}</h2>
          <ul>
            <li>
              <External href={FOOTER.github.href}>{FOOTER.github.label}</External>
            </li>
            <li>
              <External href={FOOTER.dataContract.href}>{FOOTER.dataContract.label}</External>
            </li>
            <li className="footer-mint">
              <span>{FOOTER.mint.label}</span>
              <span>
                <span className="mono" title={FOOTER.mint.address}>
                  {shortAddress(FOOTER.mint.address)}
                </span>
                <CopyButton value={FOOTER.mint.address} label={FOOTER.mint.copy} />
              </span>
            </li>
          </ul>
        </nav>

        <div>
          <h2>{FOOTER.columns.project}</h2>
          <ul>
            <li>
              <External href={FOOTER.hackathon.href}>{FOOTER.hackathon.label}</External>
            </li>
            <li>
              <External href={FOOTER.team.href}>{FOOTER.team.label}</External>
            </li>
          </ul>
        </div>

        <div className="footer-legal">
          <h2>{FOOTER.columns.legal}</h2>
          <p>{FOOTER.legal}</p>
        </div>
      </div>

      <div className="footer-base">
        <p className="footer-brand">
          <BrandMark />
          <span>
            {SITE.name} · {year}
          </span>
        </p>
        <p>{FOOTER.built}</p>
        <p className="footer-disclaimer">{FOOTER.disclaimer}</p>
      </div>
    </footer>
  );
}
