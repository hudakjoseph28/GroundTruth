import { Link } from "react-router-dom";
import { CHECK_STATUSES } from "@groundtruth/shared";
import { QuestionIcon } from "../components/QuestionIcon";
import { SampleReportCard } from "../components/SampleReportCard";
import { SearchForm } from "../components/SearchForm";
import { StatusPill } from "../components/StatusPill";
import {
  ACCOUNT,
  BUYER_QUESTIONS,
  CHECK_COPY,
  CHECKS_SECTION,
  COVERAGE,
  FOOTER,
  HERO,
  HOW_IT_WORKS,
  NOT_THIS,
  OUTCOMES,
  OUTCOMES_SECTION,
  PROOF,
  QUESTIONS,
  START,
  STATUS_MEANING,
  STEPS,
} from "../content/home";
import { sampleParcelPath } from "../data/parcelSource";
import { GlobeSlot } from "../globe/GlobeSlot";
import { CHECK_LABELS, DOCUMENTED_CHECKS } from "../labels";

const notList = new Intl.ListFormat("en", { type: "disjunction" });

export function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        {/* Decorative backdrop: behind the content, never under the search. */}
        <div className="hero-backdrop" aria-hidden="true">
          <GlobeSlot />
        </div>
        <div className="hero-copy">
          <p className="eyebrow-quiet">{HERO.eyebrow}</p>
          <h1 id="hero-title">
            {HERO.headline.map((line) => (
              <span key={line}>{line} </span>
            ))}
          </h1>
          <p className="hero-lede">{HERO.subhead}</p>
          <SearchForm autoFocus showSampleLink={false} />
          <p className="hero-status">
            {HERO.staged.before}
            <Link to={sampleParcelPath()}>{HERO.staged.parcelId}</Link>
            {HERO.staged.after}
          </p>
        </div>
        <div className="hero-report">
          <SampleReportCard />
        </div>
      </section>

      <section className="proof" aria-labelledby="proof-title">
        <h2 id="proof-title" className="visually-hidden">
          {PROOF.title}
        </h2>
        <ul className="proof-list">
          {PROOF.stats.map((stat) => (
            <li key={stat.figure}>
              <p className="proof-stat">
                <span className="proof-figure">{stat.figure}</span>{" "}
                <span className="proof-body">
                  {stat.body.map((part) =>
                    "strong" in part && part.strong ? (
                      <strong key={part.text}>{part.text}</strong>
                    ) : (
                      part.text
                    ),
                  )}
                </span>
              </p>
              <p className="proof-sources">
                {stat.sources.map((source) => (
                  <a
                    key={source.href}
                    href={source.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {source.label}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <p className="proof-note">{PROOF.finePrint}</p>
      </section>

      <section id="why" className="home-section" aria-labelledby="why-title">
        <h2 id="why-title">{QUESTIONS.title}</h2>
        <ol className="question-grid">
          {BUYER_QUESTIONS.map((question, index) => (
            <li key={question.title}>
              <div className="question-top">
                <QuestionIcon name={question.icon} />
                <span className="step-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3>{question.title}</h3>
              <p>{question.body}</p>
              <p className="chip-line">
                {question.checks.map((kind) => CHECK_LABELS[kind]).join(" · ")}
              </p>
              <p className="question-example">
                <span className="example-tag">{QUESTIONS.exampleLabel}</span>
                <span>{question.example.label}</span>
                <StatusPill status={question.example.status} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="outcomes"
        className="home-section"
        aria-labelledby="outcomes-title"
      >
        <h2 id="outcomes-title">{OUTCOMES_SECTION.title}</h2>
        <p className="section-lede">{OUTCOMES_SECTION.lede}</p>
        <div className="outcome-grid">
          {OUTCOMES.map((outcome) => (
            <article
              key={outcome.title}
              className={`outcome outcome-${outcome.tone}`}
            >
              <p className="outcome-label">{outcome.kicker}</p>
              <h3>{outcome.title}</h3>
              <ol className="timeline">
                {outcome.steps.map((step) => (
                  <li key={step.title} className={`tone-${step.tone}`}>
                    <p className="timeline-where">{step.where}</p>
                    <p className="timeline-title">{step.title}</p>
                    <p className="timeline-detail">{step.detail}</p>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        <p className="evidence-note">{OUTCOMES_SECTION.note}</p>
      </section>

      <section
        id="how-it-works"
        className="home-section"
        aria-labelledby="how-title"
      >
        <h2 id="how-title">{HOW_IT_WORKS.title}</h2>
        <p className="section-lede">{HOW_IT_WORKS.lede}</p>
        <ol className="step-grid">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="what-we-check"
        className="home-section"
        aria-labelledby="check-title"
      >
        <h2 id="check-title">{CHECKS_SECTION.title}</h2>
        <p className="section-lede">{CHECKS_SECTION.lede}</p>
        <ul className="check-grid">
          {DOCUMENTED_CHECKS.map((kind) => (
            <li key={kind}>
              <h3>{CHECK_LABELS[kind]}</h3>
              <p className="confirmed-by">
                <span>{CHECKS_SECTION.confirmedByLabel}</span>{" "}
                {CHECK_COPY[kind].confirmedBy}
              </p>
            </li>
          ))}
        </ul>
        <div className="status-line">
          <h3 id="status-title">{CHECKS_SECTION.statusesLabel}</h3>
          <ul className="pill-row" aria-labelledby="status-title">
            {CHECK_STATUSES.map((status) => (
              <li key={status} title={STATUS_MEANING[status]}>
                <StatusPill status={status} />
                <span className="visually-hidden">
                  : {STATUS_MEANING[status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="coverage"
        className="home-section"
        aria-labelledby="coverage-title"
      >
        <h2 id="coverage-title">{COVERAGE.title}</h2>
        <p className="section-lede">{COVERAGE.lede}</p>
      </section>

      <section
        id="start"
        className="home-section start-band"
        aria-labelledby="start-title"
      >
        <h2 id="start-title">{START.title}</h2>
        <SearchForm ariaLabel={START.searchLabel} />
      </section>

      <section
        id="account"
        className="home-section account-note"
        aria-labelledby="account-title"
      >
        <h2 id="account-title">{ACCOUNT.title}</h2>
        <p>{ACCOUNT.body}</p>
      </section>

      <p className="home-footer">
        {FOOTER.position} {FOOTER.notPrefix} {notList.format(NOT_THIS)}.
      </p>
    </>
  );
}
