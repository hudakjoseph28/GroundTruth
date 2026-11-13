import { Link } from "react-router-dom";
import { SAMPLE_REPORT } from "../content/home";
import { sampleParcelPath } from "../data/parcelSource";
import { CHECK_LABELS } from "../labels";
import { StatusPill } from "./StatusPill";

/**
 * The homepage's product preview: one open question, a few check statuses,
 * and a held payout. Sample copy for the staged parcel, labeled as such.
 */
export function SampleReportCard() {
  const { openQuestion, checks, escrow } = SAMPLE_REPORT;
  return (
    <article className="report-card" aria-labelledby="sample-report-title">
      <h2 id="sample-report-title" className="report-meta">
        {SAMPLE_REPORT.eyebrow} · {SAMPLE_REPORT.place} ·{" "}
        <span className="report-parcel">{SAMPLE_REPORT.parcelId}</span>
      </h2>

      <div className="report-question">
        <p className="report-label">{openQuestion.heading}</p>
        <div className="report-question-row">
          <p className="report-title">{openQuestion.title}</p>
          <StatusPill status={openQuestion.status} />
        </div>
        <p className="report-resolver">
          <span className="report-label">{openQuestion.resolverLabel}</span>
          {openQuestion.resolver}
        </p>
      </div>

      <dl className="report-checks" aria-label={SAMPLE_REPORT.checksLabel}>
        {checks.map((check) => (
          <div key={check.kind}>
            <dt>{check.label ?? CHECK_LABELS[check.kind]}</dt>
            <dd>
              <StatusPill status={check.status} />
            </dd>
          </div>
        ))}
      </dl>

      <p className={`report-escrow report-escrow-${escrow.state}`}>
        <strong>{escrow.title}</strong> {escrow.body}
      </p>

      <div className="report-foot">
        <Link className="report-link" to={sampleParcelPath()}>
          {SAMPLE_REPORT.linkLabel}
          <span aria-hidden="true"> →</span>
        </Link>
        <p className="report-disclaimer">{SAMPLE_REPORT.disclaimer}</p>
      </div>
    </article>
  );
}
