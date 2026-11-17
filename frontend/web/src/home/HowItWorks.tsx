import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { goldenParcel } from "@groundtruth/shared";
import { Segmented } from "../components/Segmented";
import { HOW, type CalloutId, type Outcome, type StepId } from "../content/home";
import { SITE } from "../content/site";
import { googleEarthUrl } from "../parcel/Explore/links";
import { usePageHidden } from "../parcel/usePageHidden";
import { ChecksStack } from "./ChecksStack";
import { EscrowDiagram } from "./EscrowDiagram";
import { StepBlock } from "./icons";
import { ParcelTile } from "./ParcelTile";
import { Reveal } from "./Reveal";
import { useOnScreen } from "./useOnScreen";
import { useReducedMotion } from "./useReducedMotion";

const ADVANCE_MS = 6000;
/** How long the release step shows a held payout before it shows a cleared one. */
const HELD_FIRST_MS = 2900;
const CALLOUT_MS = 2400;
/** The parcel picture's layers, in the order it lights them on its own. */
const LAYERS: readonly CalloutId[] = ["imagery", "elevation", "boundary"];
const STEPS = HOW.steps;

/**
 * The four steps as one horizontal stepper. Choosing a step (click, hover, or
 * the arrow keys) crossfades the panel under it; until someone does, the
 * steps advance on their own. Nothing here is tied to scrolling.
 */
export function HowItWorks() {
  const ids = useId();
  const still = useReducedMotion();
  const hidden = usePageHidden();
  const [flow, onScreen] = useOnScreen<HTMLDivElement>();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const [active, setActive] = useState<StepId>("parcel");
  /** False once someone has chosen a step themselves. */
  const [auto, setAuto] = useState(true);
  /** True while the pointer or the keyboard is in the stepper: it waits. */
  const [engaged, setEngaged] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("held");
  const [outcomeChosen, setOutcomeChosen] = useState(false);
  const [hovered, setHovered] = useState<CalloutId | null>(null);
  const [layer, setLayer] = useState(0);

  const live = onScreen && !hidden;

  const show = (id: StepId) => {
    setActive(id);
    if (!outcomeChosen) setOutcome("held");
  };
  const choose = (id: StepId) => {
    setAuto(false);
    show(id);
  };

  // The header's "Escrow" link lands on that step.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (hash !== "#escrow") return;
    setAuto(false);
    setActive("escrow");
  }, [hash, key]);

  useEffect(() => {
    if (!auto || engaged || still || !live) return;
    const timer = window.setTimeout(() => {
      const at = STEPS.findIndex((step) => step.id === active);
      setActive(STEPS[(at + 1) % STEPS.length]?.id ?? "parcel");
      if (!outcomeChosen) setOutcome("held");
    }, ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [auto, engaged, still, live, active, outcomeChosen]);

  // Release tells both endings, held first, until someone picks one.
  useEffect(() => {
    if (active !== "release" || outcomeChosen || still || !live) return;
    const timer = window.setTimeout(() => setOutcome("cleared"), HELD_FIRST_MS);
    return () => window.clearTimeout(timer);
  }, [active, outcomeChosen, still, live]);

  // The parcel picture lights its layers in turn while nobody is pointing at one.
  const cycling = active === "parcel" && live && !still && hovered === null;
  useEffect(() => {
    if (!cycling) return;
    const timer = window.setInterval(() => setLayer((at) => (at + 1) % LAYERS.length), CALLOUT_MS);
    return () => window.clearInterval(timer);
  }, [cycling]);
  const focus: CalloutId | null = hovered ?? (still ? null : (LAYERS[layer] ?? null));

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STEPS.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % STEPS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + last) % STEPS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    const step = to === null ? undefined : STEPS[to];
    if (to === null || !step) return;
    event.preventDefault();
    choose(step.id);
    tabs.current[to]?.focus();
  };

  return (
    <Reveal className="section how">
      <section id="how-it-works" tabIndex={-1} aria-labelledby="how-title">
        <p className="eyebrow">{HOW.eyebrow}</p>
        <h2 id="how-title">{HOW.title}</h2>

        <div
          ref={flow}
          id="escrow"
          tabIndex={-1}
          className="how-flow"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setEngaged(true);
          }}
          onPointerLeave={() => setEngaged(false)}
          onFocus={() => setEngaged(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setEngaged(false);
          }}
        >
          <div className="stepper" role="tablist" aria-label={HOW.tabsLabel} data-live={live && !still}>
            <span className="stepper-track" aria-hidden="true">
              <span className="stepper-packet" />
            </span>
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${step.id}`}
                aria-selected={step.id === active}
                aria-controls={`${ids}-panel-${step.id}`}
                tabIndex={step.id === active ? 0 : -1}
                className="stepper-node"
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") choose(step.id);
                }}
                onClick={() => choose(step.id)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                <StepBlock mark={step.id} />
                <span className="stepper-title">{step.title}</span>
                <span className="stepper-line">{step.line}</span>
              </button>
            ))}
          </div>

          <div className="how-panels">
            {STEPS.map((step) => {
              const on = step.id === active;
              const running = on && live;
              return (
                <div
                  key={step.id}
                  role="tabpanel"
                  id={`${ids}-panel-${step.id}`}
                  aria-labelledby={`${ids}-tab-${step.id}`}
                  className="how-panel"
                  data-step={step.id}
                  data-active={on}
                  inert={!on}
                >
                  <div className="how-copy">
                    <h3 className="how-lead">{step.headline}</h3>
                    {step.body && <p className="how-body">{step.body}</p>}
                    {step.bullets.length > 0 && (
                      <ul className="ticks">
                        {step.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {step.id === "parcel" && (
                      <ul className="callouts" onPointerLeave={() => setHovered(null)}>
                        {HOW.parcel.callouts.map((callout) => (
                          <li
                            key={callout.id}
                            data-on={focus === callout.id || undefined}
                            onPointerEnter={() => setHovered(callout.id)}
                          >
                            {callout.id === "earth" ? (
                              <a
                                href={googleEarthUrl(goldenParcel.centroid)}
                                target="_blank"
                                rel="noreferrer"
                                onFocus={() => setHovered("earth")}
                                onBlur={() => setHovered(null)}
                              >
                                {callout.label}
                                <span className="visually-hidden"> ({SITE.newTab})</span>
                              </a>
                            ) : (
                              callout.label
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {step.id === "release" && (
                      <div className="how-outcome">
                        <Segmented
                          label={HOW.diagram.outcomeLabel}
                          value={outcome}
                          options={HOW.diagram.outcomes}
                          onChange={(value) => {
                            setOutcomeChosen(true);
                            setOutcome(value);
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="how-visual">
                    <div className="how-art" aria-hidden="true">
                      {step.id === "parcel" && <ParcelTile focus={on ? focus : null} />}
                      {step.id === "checks" && <ChecksStack running={running} still={still} />}
                      {step.id === "escrow" && (
                        <EscrowDiagram key={`lock-${running}`} mode="lock" running={running} still={still} />
                      )}
                      {step.id === "release" && (
                        <EscrowDiagram
                          key={`${outcome}-${running}`}
                          mode={outcome}
                          running={running}
                          still={still}
                        />
                      )}
                    </div>
                    <p className="visually-hidden">
                      {step.id === "parcel" && HOW.parcel.description}
                      {step.id === "checks" && HOW.checks.description}
                      {step.id === "escrow" && HOW.diagram.description.lock}
                      {step.id === "release" && HOW.diagram.description[outcome]}
                    </p>
                    <p className="how-note">
                      {step.id === "parcel" && HOW.parcel.note}
                      {step.id === "checks" && HOW.checks.note}
                      {(step.id === "escrow" || step.id === "release") && HOW.diagram.note}
                    </p>
                    {step.id === "release" && (
                      <p className="visually-hidden" role="status">
                        {on ? HOW.diagram.result[outcome] : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </Reveal>
  );
}
