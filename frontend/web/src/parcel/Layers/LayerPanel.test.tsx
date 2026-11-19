import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXAMPLE } from "../../content/example";
import { LAYERS } from "../../content/layers";
import { ExampleProvider } from "../../example/ExampleContext";
import { EXAMPLE_LAYERS } from "../../example/exampleFixture";
import { LAYER_TOGGLES, LayerPanel } from "./LayerPanel";

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
});
