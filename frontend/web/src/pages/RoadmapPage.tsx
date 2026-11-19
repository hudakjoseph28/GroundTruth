import { Link } from "react-router-dom";
import { MEASURE, ROADMAP, STAGES, type RoadmapItem, type RoadmapStage } from "../content/roadmap";
import { Reveal } from "../home/Reveal";
import { usePageTitle } from "../layout/usePageTitle";
import { RoadmapGlyph, RoadmapSketch } from "../roadmap/RoadmapArt";
import "../roadmap/roadmap.css";

/**
 * What's built, what a pilot would add, and what comes after. Only "Now" is
 * live, and each of its cards links to the feature; every other card carries
 * a "Planned · not built yet" tag. Every sketch is captioned "Illustration".
 */
export function RoadmapPage() {
  usePageTitle(ROADMAP.pageTitle);
  const [now, next, later] = STAGES;

  return (
    <div className="roadmap">
      <header className="rm-head">
        <p className="eyebrow">{ROADMAP.eyebrow}</p>
        <h1>{ROADMAP.title}</h1>
        <p className="rm-lede">{ROADMAP.lede}</p>
        <nav className="rm-jump" aria-label={ROADMAP.jump}>
          {STAGES.map((stage) => (
            <Link key={stage.id} to={{ hash: `#${stage.id}` }} data-stage={stage.id}>
              <span className="rm-jump-dot" aria-hidden="true" />
              {stage.name}
              <span className="rm-jump-label">{stage.label}</span>
            </Link>
          ))}
        </nav>
      </header>

      {now && <Stage stage={now} />}
      {next && <Stage stage={next} />}
      <Measure />
      {later && <Stage stage={later} />}
    </div>
  );
}

function Stage({ stage }: { stage: RoadmapStage }) {
  const live = stage.id === "now";
  return (
    <Reveal className="rm-stage">
      <section id={stage.id} tabIndex={-1} aria-labelledby={`${stage.id}-title`} data-stage={stage.id}>
        <div className="rm-stage-head">
          <h2 id={`${stage.id}-title`}>
            {stage.name}
            <span className="rm-stage-label">{stage.label}</span>
          </h2>
          <p>{stage.line}</p>
        </div>
        <ul className="rm-cards">
          {stage.items.map((item) => (
            <Card key={item.id} item={item} live={live} />
          ))}
        </ul>
      </section>
    </Reveal>
  );
}

function Card({ item, live }: { item: RoadmapItem; live: boolean }) {
  return (
    <li className="rm-card" data-live={live}>
      <p className="rm-status" data-live={live}>
        <span className="rm-status-dot" aria-hidden="true" />
        {live ? ROADMAP.live : ROADMAP.planned}
      </p>
      <RoadmapSketch name={item.id} caption={ROADMAP.illustration} />
      <h3>
        <RoadmapGlyph name={item.id} />
        {item.title}
      </h3>
      <p className="rm-body">{item.body.join(" ")}</p>
      {item.links && item.links.length > 0 && (
        <ul className="rm-links">
          {item.links.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>
                {link.label}
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 6h7M6.5 3l3 3-3 3" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Measure() {
  return (
    <Reveal className="rm-measure">
      <section aria-labelledby="measure-title">
        <p className="eyebrow">{MEASURE.eyebrow}</p>
        <h2 id="measure-title">{MEASURE.title}</h2>
        <ol className="rm-metrics">
          {MEASURE.metrics.map((metric) => (
            <li key={metric.title}>
              <h3>{metric.title}</h3>
              <p>{metric.line}</p>
            </li>
          ))}
        </ol>
        <p className="rm-measure-note">{MEASURE.note}</p>
      </section>
    </Reveal>
  );
}
