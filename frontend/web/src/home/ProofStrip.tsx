import { PROOF } from "../content/home";
import { SITE } from "../content/site";
import { Reveal } from "./Reveal";

/** Sourced numbers from Problem.md: the figure large, its sentence and sources small. */
export function ProofStrip() {
  return (
    <Reveal className="section proof">
      <section aria-labelledby="proof-title">
        <h2 id="proof-title" className="visually-hidden">
          {PROOF.title}
        </h2>
        <ul className="proof-list">
          {PROOF.stats.map((stat) => (
            <li key={stat.figure}>
              <p className="proof-stat">
                <span className="proof-figure mono">{stat.figure}</span>
                <span className="proof-body">
                  {stat.body.map((part) =>
                    "strong" in part && part.strong ? (
                      <strong key={part.text}>{part.text}</strong>
                    ) : (
                      <span key={part.text}>{part.text}</span>
                    ),
                  )}
                </span>
              </p>
              <p className="proof-sources">
                {stat.sources.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                    {source.label}
                    <span className="visually-hidden"> ({SITE.newTab})</span>
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <p className="proof-fine">{PROOF.finePrint}</p>
      </section>
    </Reveal>
  );
}
