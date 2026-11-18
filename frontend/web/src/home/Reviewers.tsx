import { REVIEWERS } from "../content/home";
import { Reveal } from "./Reveal";
import { ReviewerChain } from "./ReviewerChain";
import { useReducedMotion } from "./useReducedMotion";

/** For reviewers: the living chain on one side, what signing means on the other. */
export function Reviewers() {
  const still = useReducedMotion();

  return (
    <Reveal className="section reviewers">
      <section id="reviewers" tabIndex={-1} aria-labelledby="reviewers-title">
        <div className="rv-visual">
          <ReviewerChain still={still} />
          <p className="visually-hidden">{REVIEWERS.description}</p>
          <p className="how-note">{REVIEWERS.note}</p>
        </div>
        <div className="rv-copy">
          <p className="eyebrow">{REVIEWERS.eyebrow}</p>
          <h2 id="reviewers-title">{REVIEWERS.title}</h2>
          <ul className="ticks">
            {REVIEWERS.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p className="rv-note">{REVIEWERS.demoNote}</p>
        </div>
      </section>
    </Reveal>
  );
}
