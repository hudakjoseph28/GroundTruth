import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUILDABLE } from "../../content/buildable";
import { getParcelLedger } from "../../data/ledger";
import {
  EXAMPLE_DEAL,
  EXAMPLE_KEY,
  EXAMPLE_REPORT,
} from "../../example/exampleFixture";
import { ReportSummary } from "./ReportSummary";

const ledger = getParcelLedger(EXAMPLE_KEY, EXAMPLE_REPORT, EXAMPLE_DEAL);
const noop = () => {};
const render = (buildableShare?: number) =>
  renderToStaticMarkup(
    <ReportSummary
      ledger={ledger}
      onOpen={noop}
      buildableShare={buildableShare}
    />,
  );

describe("ReportSummary and the Buildable area", () => {
  it("adds one line when less than half the lot looks buildable", () => {
    const html = render(0.38);
    expect(html).toContain(BUILDABLE.bottomLine("38%"));
    expect(html.match(/summary-buildable/g)).toHaveLength(1);
  });

  it("says nothing more at half or above, or before the estimate exists", () => {
    for (const share of [0.5, 0.82, undefined]) {
      expect(render(share)).not.toContain("summary-buildable");
    }
  });
});
