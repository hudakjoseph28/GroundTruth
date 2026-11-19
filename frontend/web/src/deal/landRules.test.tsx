import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DealState } from "@groundtruth/shared";
import { FlatLand } from "../parcel/ParcelScene/FlatLand";
import type { LandAssets } from "../parcel/ParcelScene/landAssets";
import { landTone, ringCentroid, shouldRipple } from "./landRules";

describe("landTone", () => {
  it.each([
    ["draft", "gold"],
    ["funded", "gold"],
    ["held", "held"],
    ["released", "released"],
    ["refunded", "gold"],
  ] satisfies [DealState, ReturnType<typeof landTone>][])(
    "draws a %s deal's boundary %s",
    (state, tone) => {
      expect(landTone(state)).toBe(tone);
    },
  );
});

describe("shouldRipple", () => {
  it("plays only when the deal turned released while the page was open", () => {
    expect(
      shouldRipple({ liveState: "released", ready: true, animated: true }),
    ).toBe(true);
    // Already released on arrival: the boundary is green and still.
    expect(shouldRipple({ liveState: null, ready: true, animated: true })).toBe(
      false,
    );
    expect(
      shouldRipple({ liveState: "held", ready: true, animated: true }),
    ).toBe(false);
  });

  it("waits for the scene and respects reduced motion", () => {
    expect(
      shouldRipple({ liveState: "released", ready: false, animated: true }),
    ).toBe(false);
    expect(
      shouldRipple({ liveState: "released", ready: true, animated: false }),
    ).toBe(false);
  });
});

describe("ringCentroid", () => {
  it("finds the middle of a closed square", () => {
    const square = [
      { u: 0.2, v: 0.2 },
      { u: 0.6, v: 0.2 },
      { u: 0.6, v: 0.6 },
      { u: 0.2, v: 0.6 },
      { u: 0.2, v: 0.2 },
    ];
    const center = ringCentroid(square);
    expect(center.u).toBeCloseTo(0.4);
    expect(center.v).toBeCloseTo(0.4);
  });

  it("weights by area, not by how many points a side has", () => {
    // An L: most of its area is in the lower-left.
    const ell = [
      { u: 0, v: 0 },
      { u: 0.2, v: 0 },
      { u: 0.2, v: 0.8 },
      { u: 1, v: 0.8 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
    ];
    const center = ringCentroid(ell);
    // 0.16 of area centred at (0.1, 0.4) and 0.2 centred at (0.5, 0.9).
    expect(center.u).toBeCloseTo(0.116 / 0.36);
    expect(center.v).toBeCloseTo(0.244 / 0.36);
  });

  it("falls back to the mean for a ring with no area", () => {
    expect(ringCentroid([])).toEqual({ u: 0.5, v: 0.5 });
    const line = ringCentroid([
      { u: 0, v: 0 },
      { u: 1, v: 1 },
    ]);
    expect(line.u).toBeCloseTo(0.5);
    expect(line.v).toBeCloseTo(0.5);
  });
});

describe("FlatLand", () => {
  const assets = {
    meta: { bbox: { west: -83, south: 40, east: -82.9, north: 40.1 } },
    imageryUrl: "/imagery.jpg",
  } as unknown as LandAssets;
  const ring = [
    [-82.99, 40.01],
    [-82.91, 40.01],
    [-82.91, 40.09],
    [-82.99, 40.01],
  ];

  it("outlines the boundary in the deal's tone", () => {
    expect(
      renderToStaticMarkup(
        <FlatLand assets={assets} ring={ring} tone="held" />,
      ),
    ).toContain('data-tone="held"');
    expect(
      renderToStaticMarkup(
        <FlatLand assets={assets} ring={ring} tone="released" />,
      ),
    ).toContain('data-tone="released"');
  });

  it("stays gold by default, as on the parcel page", () => {
    expect(
      renderToStaticMarkup(<FlatLand assets={assets} ring={ring} />),
    ).toContain('data-tone="gold"');
  });
});
