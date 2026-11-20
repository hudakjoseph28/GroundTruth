import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXAMPLE } from "../../content/example";
import { LAYERS } from "../../content/layers";
import { ELEVATION } from "../../content/parcel";
import { ExampleProvider } from "../../example/ExampleContext";
import { EXAMPLE_LAYERS } from "../../example/exampleFixture";
import { initialLayers, LAYER_TOGGLES, LayerPanel } from "./LayerPanel";

const noop = () => {};

describe("LayerPanel", () => {
  it("offers to show every layer while some are off", () => {
    const html = renderToStaticMarkup(
      <LayerPanel layers={EXAMPLE_LAYERS} enabled={new Set(["boundary"])} allOn={false} onToggle={noop} onToggleAll={noop} onRetry={noop} />,
    );
    expect(html).toContain(LAYERS.showAll);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("goes back to the boundary alone once every layer is on", () => {
    const html = renderToStaticMarkup(
      <LayerPanel layers={EXAMPLE_LAYERS} enabled={new Set(LAYER_TOGGLES)} allOn onToggle={noop} onToggleAll={noop} onRetry={noop} />,
    );
    expect(html).toContain(LAYERS.hideAll);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(LAYER_TOGGLES.length);
    // Every layer's legend line, with what its source says here.
    expect(html).toContain("Zone AE on about 6.7%");
    expect(html).toContain("Touches the lot");
  });

  it("says the example's boundary is drawn for the demo, not published", () => {
    const html = renderToStaticMarkup(
      <ExampleProvider>
        <LayerPanel layers={EXAMPLE_LAYERS} enabled={new Set(["boundary"])} allOn={false} onToggle={noop} onToggleAll={noop} onRetry={noop} />
      </ExampleProvider>,
    );
    expect(html).toContain(EXAMPLE.boundary);
    expect(html).not.toContain(LAYERS.boundary);
  });

  it("labels the elevation legend in feet as map elevation, not a survey", () => {
    const analysis = {
      minFeet: 929.4,
      maxFeet: 940.2,
      riseFeet: 10.8,
      averageSlopePercent: 1.7,
      steepestSlopePercent: 7.9,
      steepShare: 0,
      contourFeet: 2,
      summary: "",
    };
    const html = renderToStaticMarkup(
      <LayerPanel
        layers={EXAMPLE_LAYERS}
        enabled={new Set(["elevation", "slope"])}
        allOn={false}
        onToggle={noop}
        onToggleAll={noop}
        onRetry={noop}
        elevation={{ analysis, sourceUrl: "https://example.com/terrain" }}
      />,
    );
    expect(html).toContain(LAYERS.elevation(2));
    expect(html).toContain("929 ft");
    expect(html).toContain("940 ft");
    expect(html).toContain(ELEVATION.notSurvey);
    expect(html).toContain("No part of the lot reads steeper than 15%");
    // Terrain toggles come from the height grid, so they never offer a retry.
    expect(html).not.toContain(LAYERS.retry);
  });

  it("opens a parcel on the aerial photo, with elevation as a toggle", () => {
    expect([...initialLayers(false, false)]).toEqual(["boundary"]);
    const example = initialLayers(true, false);
    expect(example.has("elevation")).toBe(false);
    expect(example.has("slope")).toBe(false);
    expect(example.has("flood")).toBe(true);
  });

  it("starts the elevation coloring on only when asked (the walkthrough)", () => {
    expect(initialLayers(true, true).has("elevation")).toBe(true);
    expect(initialLayers(true, true).has("slope")).toBe(false);
    expect(initialLayers(false, true).has("elevation")).toBe(true);
  });
});
