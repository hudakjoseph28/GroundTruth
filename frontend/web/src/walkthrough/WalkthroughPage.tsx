import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { WALKTHROUGH } from "../content/walkthrough";
import { ExampleProvider, ExampleTag } from "../example/ExampleContext";
import { useReducedMotion } from "../home/useReducedMotion";
import { usePageTitle } from "../layout/usePageTitle";
import { STEP_MS, stepIndex, WALK_STEPS } from "./steps";
import "../deal/deal.css";
import "../parcel/parcel.css";
import "./walkthrough.css";

/**
 * The example closing, one step per screen, for screen recording: big
 * titles, a progress bar, Back and Next, the arrow keys, and an autoplay that
 * moves on every eight seconds and pauses. The step is in the address
 * (`?step=4`), so a recording can start anywhere.
 */
export default function WalkthroughPage() {
  usePageTitle(WALKTHROUGH.pageTitle);
  const [search, setSearch] = useSearchParams();
  const index = stepIndex(search.get("step"));
  const count = WALK_STEPS.length;
  const step = WALK_STEPS[index]!;
  const copy = WALKTHROUGH.steps[step.id];
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), count - 1);
      setSearch({ step: String(clamped + 1) }, { replace: true });
    },
    [count, setSearch],
  );
  const last = index === count - 1;

  // Autoplay: on to the next step after STEP_MS. A pause keeps what is left
  // of the step, so playing again finishes it instead of starting it over.
  const left = useRef({ index, ms: STEP_MS });
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (last) {
      setPlaying(false);
      return;
    }
    if (left.current.index !== index) left.current = { index, ms: STEP_MS };
    const started = performance.now();
    const timer = window.setTimeout(() => go(index + 1), left.current.ms);
    return () => {
      window.clearTimeout(timer);
      left.current = { index, ms: Math.max(0, left.current.ms - (performance.now() - started)) };
    };
  }, [playing, index, last, go]);
  const toggle = useCallback(() => {
    setEngaged(true);
    setPlaying((value) => !value);
  }, []);

  // Arrow keys move; Space plays and pauses, unless a control has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, dialog[open]")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        go(index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        go(0);
      } else if (event.key === "End") {
        event.preventDefault();
        go(count - 1);
      } else if (event.key === " " && !target?.closest("button, a, [role=button]")) {
        event.preventDefault();
        if (index < count - 1) toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, count, toggle]);

  const { Scene } = step;
  return (
    <ExampleProvider>
      <section
        className="walk"
        data-step={step.id}
        data-bonus={step.bonus || undefined}
        data-playing={playing}
        aria-labelledby="walk-title"
        style={{ "--step-ms": `${STEP_MS}ms` } as CSSProperties}
      >
        <header className="walk-top">
          <ExampleTag kind="walkthrough" />
          <p className="walk-count mono">
            {step.bonus ? `${WALKTHROUGH.bonus} · ` : ""}
            {WALKTHROUGH.step(index + 1, count)}
          </p>
          <ol className="walk-progress" aria-label={WALKTHROUGH.progress}>
            {WALK_STEPS.map((item, n) => (
              <li
                key={item.id}
                data-state={n < index ? "done" : n === index ? "current" : "todo"}
                data-bonus={item.bonus || undefined}
              >
                <button
                  type="button"
                  onClick={() => go(n)}
                  aria-current={n === index ? "step" : undefined}
                  aria-label={WALKTHROUGH.goTo(n + 1, WALKTHROUGH.steps[item.id].title)}
                >
                  {/* Fills over the step while autoplay runs; holds where it is on pause. */}
                  <span
                    key={n === index ? `current-${index}` : n}
                    className="walk-progress-fill"
                    data-run={n === index && engaged && !reduced ? (playing ? "play" : "pause") : undefined}
                  />
                </button>
              </li>
            ))}
          </ol>
        </header>

        <div className="walk-body" key={step.id}>
          <div className="walk-copy">
            <p className="walk-kicker">{copy.kicker}</p>
            <h1 id="walk-title">{copy.title}</h1>
            <p className="walk-lede">{copy.body}</p>
          </div>
          <div className="walk-scene">
            <Scene />
          </div>
        </div>

        <nav className="walk-controls" aria-label={WALKTHROUGH.eyebrow}>
          <button type="button" className="btn" onClick={() => go(index - 1)} disabled={index === 0}>
            <span aria-hidden="true">←</span> {WALKTHROUGH.back}
          </button>
          <button
            type="button"
            className="btn walk-play"
            aria-pressed={playing}
            onClick={toggle}
            disabled={last && !playing}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.5v9M11 3.5v9" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.2v9.6L12.5 8z" />
              </svg>
            )}
            {playing ? WALKTHROUGH.pause : WALKTHROUGH.play}
          </button>
          {last ? (
            <button type="button" className="btn btn-primary" onClick={() => go(0)}>
              {WALKTHROUGH.again}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
              {WALKTHROUGH.next} <span aria-hidden="true">→</span>
            </button>
          )}
          <p className="walk-keys">{WALKTHROUGH.keys}</p>
        </nav>
        <p className="visually-hidden" aria-live="polite">
          {WALKTHROUGH.announce(index + 1, count, copy.title)}
        </p>
      </section>
    </ExampleProvider>
  );
}
