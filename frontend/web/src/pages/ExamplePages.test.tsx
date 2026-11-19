import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_DOCUMENTS } from "../example/exampleFixture";
import { ExampleDealPage } from "./ExamplePages";

describe("the example deal page", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "https://groundtruth.test" } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function render() {
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={["/deals/sample"]}>
        <ExampleDealPage />
      </MemoryRouter>,
    );
  }

  it("is released, paid to the seller, with every reviewer signed", () => {
    const html = render();
    expect(html).toContain("Example deal");
    expect(html).toContain("Illustrative data");
    expect(html).toContain('data-location="seller"');
    expect(html).toContain("The seller received 25 test USDC.");
    expect(html).toContain("3 of 3 signed");
  });

  it("never links a made-up receipt to Solana Explorer, and says sample nowhere", () => {
    const html = render();
    expect(html).not.toContain("explorer.solana.com");
    expect(html).toContain("Example receipt");
    expect(html).not.toContain("Confirmed on Solana devnet");
    expect(html.replace(/\/(deals|parcels)\/sample/g, "")).not.toMatch(/\bsample\b/i);
    // It points to the real released closing instead.
    expect(html).toContain('href="/deals/staged-devnet-deal-released"');
  });

  it("tells the timeline first to last and lists every document's short hash", () => {
    const all = render();
    const html = all.slice(all.indexOf('id="timeline"'), all.indexOf('id="documents"'));
    const order = ["Escrow opened", "Deposit", "Owner callback", "title commitment", "survey plat", "soil evaluation", "Zoning letter attached", "Payment released"];
    const at = order.map((text) => html.indexOf(text));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const doc of EXAMPLE_DOCUMENTS) {
      expect(all).toContain(doc.filename);
      expect(all).toContain(doc.sha256.slice(0, 8));
    }
  });
});
