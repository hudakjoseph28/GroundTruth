import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WALKTHROUGH } from "../content/walkthrough";
import { STEP_MS, stepIndex, WALK_STEPS } from "./steps";
import WalkthroughPage from "./WalkthroughPage";

describe("the walkthrough's steps", () => {
  it("covers every step in the copy, in story order, and ends on the bonus", () => {
    expect(WALK_STEPS.map((step) => step.id)).toEqual([
      "find",
      "land",
      "report",
      "fund",
      "call",
      "title",
      "survey",
      "septic",
      "zoning",
      "release",
      "receipts",
      "held",
    ]);
    expect(Object.keys(WALKTHROUGH.steps).sort()).toEqual(WALK_STEPS.map((step) => step.id).sort());
    expect(WALK_STEPS.filter((step) => step.bonus).map((step) => step.id)).toEqual(["held"]);
    expect(STEP_MS).toBe(8000);
  });

  it("reads the step from the address, 1-based and clamped", () => {
    expect(stepIndex(null)).toBe(0);
    expect(stepIndex("4")).toBe(3);
    expect(stepIndex("0")).toBe(0);
    expect(stepIndex("99")).toBe(WALK_STEPS.length - 1);
    expect(stepIndex("nope")).toBe(0);
  });
});

describe("WalkthroughPage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "https://groundtruth.test" } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const render = (step: number) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/walkthrough?step=${step}`]}>
        <WalkthroughPage />
      </MemoryRouter>,
    ).replaceAll("&#x27;", "'");

  it.each([
    [1, "Find the lot"],
    [3, "Read the report"],
    [5, "A voice agent calls the owner"],
    [6, "Title: uploaded, hashed, approved"],
    [12, "What if the seller isn't real?"],
  ])("shows step %i with its title, count, controls, and the example tag", (step, title) => {
    const html = render(step);
    expect(html).toContain(title);
    expect(html).toContain(`Step ${step} of 12`);
    expect(html).toContain("Example closing");
    expect(html).toContain("Illustrative data");
    expect(html).toContain(WALKTHROUGH.play);
    expect(html).not.toContain("explorer.solana.com");
  });

  it("marks the steps before this one done and this one current", () => {
    const html = render(4);
    expect(html.match(/data-state="done"/g)).toHaveLength(3);
    expect(html.match(/data-state="current"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="step"');
  });

  it("keeps the call to evidence and the bonus to a refused release", () => {
    expect(render(5)).toContain("Never approves, holds, or releases anything");
    const bonus = render(12);
    expect(bonus).toContain("Seller identity disputed");
    expect(bonus).toContain("DealHeld (6019)");
    expect(bonus).toContain("Start over");
  });
});
