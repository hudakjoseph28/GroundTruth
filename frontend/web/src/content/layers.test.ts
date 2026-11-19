import type { MapLayer } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { LAYERS, layerStatus, percent } from "./layers";

const source = {
  authority: "Franklin County",
  title: "Franklin County Stream Buffers",
  url: "https://example.test/layer",
  retrievedAt: "2026-11-19T03:20:17.682Z",
};

describe("layerStatus", () => {
  it("states the golden parcel's setback share as the report does", () => {
    const layer: MapLayer = {
      id: "streamSetback",
      status: "found",
      shapes: [],
      inView: ["Big Darby Creek Watershed Riparian Setbacks"],
      onLot: [
        { name: "Big Darby Creek Watershed Riparian Setbacks", share: 0.04654 },
      ],
      source,
    };
    expect(layerStatus(layer)).toBe(
      "About 4.7% of the lot is inside the Big Darby Creek Watershed Riparian Setbacks.",
    );
  });

  it("never turns an unavailable source into none", () => {
    for (const id of [
      "flood",
      "wetlands",
      "streamSetback",
      "zoning",
      "roadRightOfWay",
    ] as const) {
      const text = layerStatus({
        id,
        status: "unavailable",
        shapes: [],
        inView: [],
      });
      expect(text).toBe(LAYERS.unavailable);
      expect(text).not.toMatch(/\bno\b|\bnone\b/i);
    }
  });

  it("says where a Franklin-only layer has no source", () => {
    expect(
      layerStatus({
        id: "zoning",
        status: "notCovered",
        shapes: [],
        inView: [],
      }),
    ).toBe(LAYERS.notCovered.zoning);
  });

  it("names minimal-hazard Zone X without shading it", () => {
    expect(
      layerStatus({
        id: "flood",
        status: "none",
        shapes: [],
        inView: ["Zone X (area of minimal flood hazard)"],
        source,
      }),
    ).toBe(
      "Only Zone X (area of minimal flood hazard) in view, so nothing is shaded.",
    );
  });

  it("reads a whole-lot district and a touching or distant right-of-way plainly", () => {
    expect(
      layerStatus({
        id: "zoning",
        status: "found",
        shapes: [],
        inView: ["R · Rural District"],
        onLot: [{ name: "R", share: 1 }],
        source,
      }),
    ).toBe(
      "District lines in view: R · Rural District. The lot: R on all of it.",
    );
    expect(
      layerStatus({
        id: "roadRightOfWay",
        status: "found",
        shapes: [],
        inView: ["Road Record"],
        distanceM: 0,
        source,
      }),
    ).toBe("Touches the lot (Road Record).");
    expect(
      layerStatus({
        id: "roadRightOfWay",
        status: "found",
        shapes: [],
        inView: ["Road Record"],
        distanceM: 98.6,
        source,
      }),
    ).toBe(
      "The nearest is about 99 m from the lot and does not touch it (Road Record).",
    );
  });
});

describe("percent", () => {
  it("keeps one decimal under 10%", () => {
    expect(percent(0.04654)).toBe("4.7%");
    expect(percent(0.40948)).toBe("41%");
    expect(percent(0.996)).toBe("99.6%");
  });
});
