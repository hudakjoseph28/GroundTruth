import { describe, expect, it } from "vitest";
import type { LandAssets } from "../ParcelScene/landAssets";
import {
  analyzeElevation,
  contourIntervalFeet,
  defaultProfileLine,
  elevationProfile,
  nearestBoundaryPoint,
} from "./elevation";

const boundary = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

function assets(): LandAssets {
  const size = 5;
  const heights = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++)
      heights[row * size + col] = col / (size - 1);
  }
  return {
    meta: {
      version: 1,
      parcelKey: "ohio:39049:test",
      sourceParcelId: "test",
      retrievedAt: "2026-11-19T12:00:00.000Z",
      bbox: { west: -1, south: -1, east: 1, north: 1 },
      groundMeters: { width: 40, depth: 40 },
      imagery: {
        file: "imagery.jpg",
        width: 5,
        height: 5,
        source: "test",
        attribution: "test",
        sourceUrl: "https://example.com/imagery",
        metersPerPixel: 8,
      },
      elevation: {
        file: "height.png",
        width: 5,
        height: 5,
        minMeters: 100,
        maxMeters: 104,
        source: "USGS 3DEP-derived terrain (AWS Terrain Tiles)",
        attribution:
          "Map elevation: USGS 3DEP via AWS Terrain Tiles · not a survey",
        sourceUrl: "https://example.com/elevation",
      },
    },
    imageryUrl: "imagery.jpg",
    imagery: {} as HTMLImageElement,
    heights,
    heightSize: size,
    origin: "baked",
  };
}

describe("parcel elevation", () => {
  it("summarizes only the lot's height grid in feet and percent slope", () => {
    const analysis = analyzeElevation(assets(), boundary);
    expect(analysis).not.toBeNull();
    expect(analysis?.minFeet).toBeCloseTo(328.084, 2);
    expect(analysis?.maxFeet).toBeCloseTo(341.207, 2);
    expect(analysis?.riseFeet).toBeCloseTo(13.123, 2);
    expect(analysis?.averageSlopePercent).toBeGreaterThan(6);
    expect(analysis?.averageSlopePercent).toBeLessThan(11);
    expect(analysis?.steepestSlopePercent).toBeCloseTo(12.5, 1);
    expect(analysis?.contourFeet).toBe(2);
    expect(analysis?.steepShare).toBe(0);
    // Heights rise to the east in this grid.
    expect(analysis?.summary).toBe(
      "The lot drops about 13 ft from its east side to its west side, a moderate slope.",
    );
  });

  it("calls a lot under a foot of relief nearly flat", () => {
    const flat = assets();
    flat.meta.elevation.maxMeters = 100.2;
    expect(analyzeElevation(flat, boundary)?.summary).toBe(
      "The lot is nearly flat: its highest and lowest points are less than a foot apart.",
    );
  });

  it("widens the contour interval on hilly lots", () => {
    expect(contourIntervalFeet(9)).toBe(2);
    expect(contourIntervalFeet(60)).toBe(5);
    expect(contourIntervalFeet(240)).toBe(10);
  });

  it("defaults the profile to the lot's longest boundary-to-boundary line", () => {
    const line = defaultProfileLine(assets(), boundary);
    expect(line).not.toBeNull();
    const samples = elevationProfile(assets(), line!, 5);
    expect(samples).toHaveLength(5);
    expect(samples.at(-1)?.distanceFeet).toBeCloseTo(185.6, 0);
    expect(
      Math.abs(samples.at(-1)!.elevationFeet - samples[0]!.elevationFeet),
    ).toBeCloseTo(13.123, 2);
  });

  it("keeps a dragged profile endpoint on the parcel edge", () => {
    const square = [
      { u: 0.2, v: 0.2 },
      { u: 0.8, v: 0.2 },
      { u: 0.8, v: 0.8 },
      { u: 0.2, v: 0.8 },
    ];
    expect(nearestBoundaryPoint({ u: 0.51, v: 0.49 }, square)).toEqual({
      u: 0.51,
      v: 0.2,
    });
  });
});
