import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Deal } from "@groundtruth/shared";
// The screenshots stay where the docs keep them; Vite copies them into the build.
import elevenlabsShot from "../../../../docs/proof/elevenlabs-owner-callback.png";
import quicknodeShot from "../../../../docs/proof/quicknode-stage-prep.png";
import {
  ELEVENLABS,
  HELD,
  PARCEL,
  PROGRAM,
  PROOF_DOCS,
  PROOF_PAGE,
  PROOF_SECTIONS,
  QUICKNODE,
  RELEASED,
  type BalanceRow,
  type Claim,
  type EvidenceLink,
} from "../content/proof";
import { getDeal, dealPath } from "../data/dealSource";
import {
  explorerAddressUrl,
  explorerTxUrl,
  shortAddress,
} from "../data/ledger";
import { parcelPath } from "../data/parcelSource";
import { usePageTitle } from "../layout/usePageTitle";
import { VerifyOnChain } from "../verify/VerifyOnChain";
import "../deal/deal.css";
import "../proof/proof.css";

/**
 * /proof: every claim the demo makes, each with the public record that checks
 * it. The copy is fixed (content/proof.ts, copied from the proof docs); the
 * only live reads are each deal from the API and, on request, its escrow
 * account from devnet for "Verify on-chain".
 */
export function ProofPage() {
  usePageTitle(PROOF_PAGE.title);
  return (
    <div className="proof-page">
      <header className="proof-intro">
        <p className="eyebrow">{PROOF_PAGE.eyebrow}</p>
        <h1>{PROOF_PAGE.heading}</h1>
        <p className="proof-lede">{PROOF_PAGE.lede}</p>
        <p className="proof-staged">{PROOF_PAGE.staged}</p>
        <p className="proof-docs">
          <span>{PROOF_PAGE.sourcesLabel}:</span>{" "}
          {[PROOF_DOCS.devpost, PROOF_DOCS.qa, PROOF_DOCS.folder].map(
            (doc, index) => (
              <span key={doc.href}>
                {index > 0 ? " · " : ""}
                <External href={doc.href}>{doc.label}</External>
              </span>
            ),
          )}
        </p>
      </header>

      <nav className="proof-toc" aria-label={PROOF_PAGE.toc}>
        <ol>
          {PROOF_SECTIONS.map((section) => (
            <li key={section.id}>
              <Link to={{ hash: `#${section.id}` }}>{section.label}</Link>
            </li>
          ))}
        </ol>
      </nav>

      <Section id={PROGRAM.id} title={PROGRAM.title}>
        <Claims claims={PROGRAM.claims} />
      </Section>

      <Section
        id={HELD.id}
        title={HELD.title}
        summary={HELD.summary}
        tone="held"
        account={{ label: HELD.account, address: HELD.escrowAddress }}
      >
        <Claims claims={HELD.claims} />
        <figure className="proof-log">
          <figcaption>{HELD.logLabel}</figcaption>
          <blockquote className="mono">{HELD.log}</blockquote>
        </figure>
        <Balances
          caption={PROOF_PAGE.balances.caption(HELD.dealId)}
          rows={HELD.balances}
        />
        <DealCheck dealId={HELD.dealId} sectionId={HELD.id} />
      </Section>

      <Section
        id={RELEASED.id}
        title={RELEASED.title}
        summary={RELEASED.summary}
        tone="released"
        account={{ label: RELEASED.account, address: RELEASED.escrowAddress }}
      >
        <Claims claims={RELEASED.claims} />
        <Balances
          caption={PROOF_PAGE.balances.caption(RELEASED.dealId)}
          rows={RELEASED.balances}
        />
        <p className="proof-note">{RELEASED.notShown}</p>
        <DealCheck dealId={RELEASED.dealId} sectionId={RELEASED.id} />
      </Section>

      <Section
        id={QUICKNODE.id}
        title={QUICKNODE.title}
        summary={QUICKNODE.summary}
        account={{ label: QUICKNODE.account, address: QUICKNODE.escrowAddress }}
      >
        <Claims claims={QUICKNODE.claims} />
        <Screenshot
          src={quicknodeShot}
          alt={QUICKNODE.screenshotAlt}
          caption={QUICKNODE.screenshotCaption}
          full={PROOF_DOCS.quicknodeShot.href}
        />
        <p className="proof-note">{QUICKNODE.notStream}</p>
        <p className="proof-note proof-pending">{QUICKNODE.pending}</p>
        <DealCheck dealId={QUICKNODE.dealId} sectionId={QUICKNODE.id} />
      </Section>

      <Section
        id={ELEVENLABS.id}
        title={ELEVENLABS.title}
        summary={ELEVENLABS.summary}
      >
        <Claims claims={ELEVENLABS.claims} />
        <p className="proof-note proof-after">{ELEVENLABS.after}</p>
        <Screenshot
          src={elevenlabsShot}
          alt={ELEVENLABS.screenshotAlt}
          caption={ELEVENLABS.screenshotCaption}
          full={PROOF_DOCS.elevenlabsShot.href}
        />
      </Section>

      <Section id={PARCEL.id} title={PARCEL.title} summary={PARCEL.summary}>
        <p className="proof-note">
          {PARCEL.checked}{" "}
          <External href={PROOF_DOCS.qa.href}>{PROOF_DOCS.qa.label}</External>
        </p>
        <Claims claims={PARCEL.claims} />
        <p className="plain-actions">
          <Link className="btn" to={parcelPath(PARCEL.parcelKey)}>
            {PARCEL.open}
          </Link>
        </p>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  summary,
  tone,
  account,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  tone?: "held" | "released";
  account?: { label: string; address: string };
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      className="proof-section"
      id={id}
      tabIndex={-1}
      data-tone={tone}
      aria-labelledby={headingId}
    >
      <header className="proof-section-head">
        <h2 id={headingId}>{title}</h2>
        {summary ? <p>{summary}</p> : null}
        {account ? (
          <p className="proof-account">
            {account.label}{" "}
            <External
              href={explorerAddressUrl(account.address)}
              title={account.address}
            >
              <span className="mono">{shortAddress(account.address)}</span>
            </External>
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Claims({ claims }: { claims: readonly Claim[] }) {
  return (
    <ul className="proof-claims">
      {claims.map((claim) => (
        <li key={claim.text}>
          <p className="proof-claim">{claim.text}</p>
          {claim.limit ? <p className="proof-limit">{claim.limit}</p> : null}
          <p className="proof-evidence">
            {claim.evidence.map((link) => (
              <Evidence key={link.href} link={link} />
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Evidence({ link }: { link: EvidenceLink }) {
  if (link.href.startsWith("/")) {
    return <Link to={link.href}>{link.label}</Link>;
  }
  return <External href={link.href}>{link.label}</External>;
}

function Balances({
  caption,
  rows,
}: {
  caption: string;
  rows: readonly BalanceRow[];
}) {
  const labels = PROOF_PAGE.balances;
  return (
    <div className="proof-balances">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labels.step}</th>
            <th scope="col">{labels.tx}</th>
            <th scope="col">{labels.buyer}</th>
            <th scope="col">{labels.vault}</th>
            <th scope="col">{labels.seller}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.step}
              data-rejected={row.rejected ? "true" : undefined}
            >
              <th scope="row">{row.step}</th>
              <td data-label={labels.tx}>
                {row.signatures.map((signature, index) => (
                  <span key={signature}>
                    {index > 0 ? " · " : ""}
                    <External href={explorerTxUrl(signature)} title={signature}>
                      <span className="mono">{shortAddress(signature)}</span>
                    </External>
                  </span>
                ))}
              </td>
              <td data-label={labels.buyer} className="mono">
                {row.buyer}
              </td>
              <td data-label={labels.vault} className="mono">
                {row.vault}
              </td>
              <td data-label={labels.seller} className="mono">
                {row.seller}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="proof-note">{labels.note}</p>
    </div>
  );
}

function Screenshot({
  src,
  alt,
  caption,
  full,
}: {
  src: string;
  alt: string;
  caption: string;
  full: string;
}) {
  return (
    <figure className="proof-shot">
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={alt} loading="lazy" />
        <span className="visually-hidden"> ({PROOF_PAGE.newTab})</span>
      </a>
      <figcaption>
        {caption} <External href={full}>{PROOF_PAGE.screenshot}</External>
      </figcaption>
    </figure>
  );
}

type DealRead =
  | { status: "loading" }
  | { status: "found"; deal: Deal }
  | { status: "unavailable"; message: string };

/**
 * The deal as the API reports it, so "Verify on-chain" has something to
 * compare. A failed read is said plainly; nothing falls back to a fixture.
 */
function DealCheck({
  dealId,
  sectionId,
}: {
  dealId: string;
  sectionId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ key: string; value: DealRead } | null>(
    null,
  );
  const key = `${dealId}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    void getDeal(dealId, controller.signal)
      .then((outcome) => {
        setRead({
          key,
          value:
            outcome.status === "found"
              ? { status: "found", deal: outcome.deal }
              : { status: "unavailable", message: outcome.message },
        });
      })
      .catch(() => {
        // Aborted on unmount: nothing to show.
      });
    return () => controller.abort();
  }, [dealId, key]);

  const value: DealRead =
    read?.key === key ? read.value : { status: "loading" };

  return (
    <div className="proof-check">
      <p className="plain-actions">
        <Link className="btn" to={dealPath(dealId)}>
          {PROOF_PAGE.dealPage}
        </Link>
      </p>
      {value.status === "found" ? (
        <VerifyOnChain
          deal={value.deal}
          id={`${sectionId}-verify`}
          intro={PROOF_PAGE.verifyIntro}
        />
      ) : value.status === "loading" ? (
        <p className="notice" role="status">
          {PROOF_PAGE.dealLoading}
        </p>
      ) : (
        <div className="notice" role="status">
          <p>
            {value.message} {PROOF_PAGE.dealUnavailable}
          </p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {PROOF_PAGE.dealRetry}
          </button>
        </div>
      )}
    </div>
  );
}

function External({
  href,
  title,
  children,
}: {
  href: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> ({PROOF_PAGE.newTab})</span>
    </a>
  );
}
