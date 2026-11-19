import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MEASURE, ROADMAP, STAGES } from "../content/roadmap";
// The pitch draft's copy of the roadmap; the two must say the same thing.
import devpost from "../../../../docs/phases/04-pitch/Devpost.md?raw";
import { RoadmapPage } from "./RoadmapPage";

const count = (html: string, text: string) => html.split(text).length - 1;

function render() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/roadmap"]}>
      <RoadmapPage />
    </MemoryRouter>,
  );
}

const cards = STAGES.flatMap((stage) => stage.items.map((item) => ({ stage: stage.id, item })));
const planned = cards.filter(({ stage }) => stage !== "now");

describe("RoadmapPage", () => {
  it("shows Now, Next and Later in that order", () => {
    expect(STAGES.map((stage) => stage.name)).toEqual(["Now", "Next", "Later"]);
    const html = render();
    const at = ["now-title", "next-title", "later-title"].map((id) => html.indexOf(`id="${id}"`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("tags every Next and Later card as planned, and no Now card", () => {
    const html = render();
    expect(planned.length).toBe(11);
    expect(count(html, ROADMAP.planned)).toBe(planned.length);
    expect(count(html, ROADMAP.live)).toBe(cards.length - planned.length);
  });

  it("captions every sketch Illustration", () => {
    const html = render();
    expect(count(html, `<span class="rm-art-caption">${ROADMAP.illustration}</span>`)).toBe(cards.length);
  });

  it("links every Now card to the live feature, and no planned card to anything", () => {
    for (const { stage, item } of cards) {
      if (stage === "now") expect(item.links?.length, item.title).toBeGreaterThan(0);
      else expect(item.links, item.title).toBeUndefined();
    }
    const html = render();
    for (const { item } of cards.filter(({ stage }) => stage === "now")) {
      for (const link of item.links ?? []) expect(html).toContain(`href="${link.to}"`);
    }
  });

  it("gives every card two sentences", () => {
    for (const { item } of cards) {
      expect(item.body, item.title).toHaveLength(2);
      for (const sentence of item.body) expect(sentence, item.title).toMatch(/^[A-Z].*\.$/);
    }
  });

  it("makes no numeric claim in a plan or a pilot measure", () => {
    const text = [
      ...planned.flatMap(({ item }) => [item.title, ...item.body]),
      ...MEASURE.metrics.flatMap((metric) => [metric.title, metric.line]),
      MEASURE.note,
    ];
    for (const line of text) expect(line).not.toMatch(/\d|%/);
  });

  it("measures the pilot with the three Problem.md metrics, and says there are no results", () => {
    const html = render();
    expect(MEASURE.metrics.map((metric) => metric.title)).toEqual([
      "Time to the first actionable finding",
      "Findings with traceable evidence",
      "Buyers who can explain a pause",
    ]);
    expect(html).toContain(MEASURE.title.replace("'", "&#x27;"));
    expect(MEASURE.note).toContain("There is no pilot yet");
  });

  it("matches the Devpost draft's What's next section word for word", () => {
    const section = devpost.slice(devpost.indexOf("## What's next for GroundTruth"), devpost.indexOf("## Technologies used"));
    for (const { item } of cards) {
      expect(section, item.title).toContain(`**${item.title}.** ${item.body.join(" ")}`);
    }
    for (const metric of MEASURE.metrics) expect(section.toLowerCase()).toContain(metric.line.toLowerCase());
  });
});
