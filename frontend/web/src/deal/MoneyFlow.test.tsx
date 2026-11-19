import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DealState } from "@groundtruth/shared";
import { MoneyFlow, moneyLocation } from "./MoneyFlow";

describe("MoneyFlow", () => {
  it.each([
    ["funded", "vault", "The funds are in the escrow vault."],
    ["held", "vault", "The funds are locked in the escrow vault."],
    ["released", "seller", "The seller received 25 test USDC."],
    ["refunded", "buyer", "The buyer received 25 test USDC back."],
  ] satisfies [DealState, ReturnType<typeof moneyLocation>, string][])(
    "places a %s deal's money at the %s",
    (state, location, statement) => {
      const html = renderToStaticMarkup(
        <MoneyFlow amount="25" state={state} live={false} />,
      );

      expect(moneyLocation(state)).toBe(location);
      expect(html).toContain(`data-location="${location}"`);
      expect(html).toContain(statement);
      expect(html).toContain("25");
      expect(html).toContain("test USDC");
    },
  );

  it("shows a lock only while the deal is held", () => {
    const held = renderToStaticMarkup(
      <MoneyFlow amount="25" state="held" live={false} />,
    );
    const funded = renderToStaticMarkup(
      <MoneyFlow amount="25" state="funded" live={false} />,
    );

    expect(held).toContain('data-locked="true"');
    expect(funded).toContain('data-locked="false"');
  });
});
