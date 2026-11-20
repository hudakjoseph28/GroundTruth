import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskThisLot, AskThisLotPanel } from "./AskThisLot";

describe("AskThisLot", () => {
  it("renders nothing until the API says it can answer", () => {
    expect(
      renderToStaticMarkup(<AskThisLot parcelKey="ohio:39049:230-000918" />),
    ).toBe("");
  });

  it("explains the evidence boundary and offers text and voice questions", () => {
    const html = renderToStaticMarkup(
      <AskThisLotPanel parcelKey="ohio:39049:230-000918" voice />,
    );
    expect(html).toContain("Ask this lot");
    expect(html).toContain("Answers use only this parcel report");
    expect(html).toContain("Question about this lot");
    expect(html).toContain("Ask with microphone");
    expect(html).toContain("How much are the annual property taxes?");
  });

  it("hides the microphone when the API has no voice key", () => {
    const html = renderToStaticMarkup(
      <AskThisLotPanel parcelKey="ohio:39049:230-000918" voice={false} />,
    );
    expect(html).toContain("Question about this lot");
    expect(html).not.toContain("Ask with microphone");
  });
});
