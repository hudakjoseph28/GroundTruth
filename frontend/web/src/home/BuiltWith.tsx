import { BUILT, BUILT_TOOLS, type BuiltLogo } from "../content/built";
import { SITE } from "../content/site";
import { Reveal } from "./Reveal";

/** The tools the product runs on, above the footer. */
export function BuiltWith() {
  return (
    <Reveal className="section built">
      <section id="built-with" aria-labelledby="built-title">
        <p className="eyebrow">{BUILT.eyebrow}</p>
        <h2 id="built-title">{BUILT.title}</h2>
        <p className="built-lede">{BUILT.lede}</p>
        <ul className="built-grid">
          {BUILT_TOOLS.map((tool, index) => (
            <li key={tool.name} style={{ transitionDelay: `${index * 50}ms` }}>
              <article className="built-tile">
                <a className="built-main" href={tool.href} target="_blank" rel="noreferrer">
                  <Mark tool={tool} />
                  <span className="built-name">{tool.name}</span>
                  <span className="built-line">{tool.line}</span>
                  <span className="visually-hidden"> ({SITE.newTab})</span>
                </a>
                {tool.program ? (
                  <a className="built-extra" href={BUILT.programHref} target="_blank" rel="noreferrer">
                    {BUILT.program}
                    <span className="visually-hidden"> ({SITE.newTab})</span>
                  </a>
                ) : null}
                {tool.also ? (
                  <a className="built-extra" href={tool.also.href} target="_blank" rel="noreferrer">
                    {tool.also.label}
                    <span className="visually-hidden"> ({SITE.newTab})</span>
                  </a>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      </section>
    </Reveal>
  );
}

function Mark({ tool }: { tool: (typeof BUILT_TOOLS)[number] }) {
  if (tool.colorLogo) {
    return (
      <span className="built-mark">
        <img className="built-color" src={tool.colorLogo} alt="" />
      </span>
    );
  }
  if (tool.logos && tool.logos.length > 0) {
    return (
      <span className="built-mark">
        {tool.logos.map((logo) => (
          <Glyph key={logo.src} logo={logo} />
        ))}
      </span>
    );
  }
  return null;
}

function Glyph({ logo }: { logo: BuiltLogo }) {
  return (
    <span
      className="built-glyph"
      style={{ ["--logo" as string]: `url(${logo.src})`, ["--brand" as string]: logo.color }}
    />
  );
}
