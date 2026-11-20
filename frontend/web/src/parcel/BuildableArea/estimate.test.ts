import {
  LAND_META_VERSION,
  mercatorLat,
  mercatorLng,
  mercatorX,
  mercatorY,
  type LandMeta,
  type MapLayer,
  type Parcel,
  type ParcelLayers,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { BUILDABLE } from "../../content/buildable";
import { EXAMPLE_PARCEL } from "../../example/exampleFixture";
import { slopePercentAt, STEEP_SLOPE_PERCENT } from "../Elevation/elevation";
import {
  estimateBuildableArea,
  insideRings,
  subtractMasks,
  type BuildableAreaEstimate,
} from "./estimate";

// A 200 m square region with a 100 m square lot in the middle (u, v from
// 0.25 to 0.75). Shapes are written in u, v and turned into degrees, so the
// expected areas can be worked out by hand.

const BBOX = { west: -83.25, south: 39.88, east: -83.2477, north: 39.8818 };
const GROUND = 200;
const SIZE = 64;
const FOOT = 0.3048;

const lngLat = (u: number, v: number): number[] => [
  mercatorLng(
    mercatorX(BBOX.west) + u * (mercatorX(BBOX.east) - mercatorX(BBOX.west)),
  ),
  mercatorLat(
    mercatorY(BBOX.north) + v * (mercatorY(BBOX.south) - mercatorY(BBOX.north)),
  ),
];

const box = (u0: number, v0: number, u1: number, v1: number): number[][] => [
  lngLat(u0, v0),
  lngLat(u1, v0),
  lngLat(u1, v1),
  lngLat(u0, v1),
  lngLat(u0, v0),
];

const META: LandMeta = {
  version: LAND_META_VERSION,
  parcelKey: "test",
  sourceParcelId: "TEST",
  retrievedAt: "2026-11-19T00:00:00.000Z",
  bbox: BBOX,
  groundMeters: { width: GROUND, depth: GROUND },
  imagery: {
    file: "imagery.jpg",
    width: 1024,
    height: 1024,
    source: "test",
    attribution: "Test imagery",
    sourceUrl: "https://example.test/imagery",
    metersPerPixel: GROUND / 1024,
  },
  elevation: {
    file: "elevation.png",
    width: SIZE,
    height: SIZE,
    minMeters: 0,
    maxMeters: 40,
    source: "test",
    attribution: "Test elevation",
    sourceUrl: "https://example.test/elevation",
  },
};

/** 100 m × 100 m = 2.471 acres. */
const LOT_ACRES = 10_000 / 4046.8564224;

const PARCEL: Parcel = {
  ...EXAMPLE_PARCEL,
  key: "test",
  acreage: undefined,
  mappedAcreage: LOT_ACRES,
  geometry: {
    ...EXAMPLE_PARCEL.geometry,
    geojson: { type: "Polygon", coordinates: [box(0.25, 0.25, 0.75, 0.75)] },
  },
};

const source = {
  authority: "Test",
  title: "Test layer",
  url: "https://example.test/layer",
  retrievedAt: "2026-11-19T00:00:00.000Z",
};

function layer(partial: Partial<MapLayer> & Pick<MapLayer, "id">): MapLayer {
  return { status: "none", shapes: [], inView: [], source, ...partial };
}

function layersWith(...overrides: MapLayer[]): ParcelLayers {
  const ids = [
    "flood",
    "streamSetback",
    "wetlands",
    "zoning",
    "roadRightOfWay",
  ] as const;
  return {
    parcelKey: "test",
    bbox: BBOX,
    generatedAt: "2026-11-19T00:00:00.000Z",
    layers: ids.map(
      (id) => overrides.find((item) => item.id === id) ?? layer({ id }),
    ),
  };
}

/** Heights 0..1 from a function of u (west to east), at 40 m of relief. */
function terrain(height: (u: number) => number) {
  const heights = new Float32Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      heights[row * SIZE + col] = height((col + 0.5) / SIZE);
    }
  }
  return { meta: META, heights, heightSize: SIZE };
}

const FLAT = terrain(() => 0.5);

function run(
  layers: ParcelLayers,
  assets = FLAT,
  parcel = PARCEL,
): BuildableAreaEstimate {
  return estimateBuildableArea({
    parcel,
    layers,
    assets,
    wetlandsMask: null,
    gridSize: 200,
  });
}

const removed = (estimate: BuildableAreaEstimate, id: string) =>
  estimate.deductions.find((deduction) => deduction.id === id);

describe("subtractMasks", () => {
  it("subtracts every constraint and counts an overlap once, under the first", () => {
    const lot = new Uint8Array([1, 1, 1, 1, 1, 1]);
    const flood = new Uint8Array([1, 1, 0, 0, 0, 0]);
    const wetland = new Uint8Array([0, 1, 1, 0, 0, 0]);
    const slope = new Uint8Array([0, 0, 0, 0, 1, 0]);
    const result = subtractMasks(lot, [flood, wetland, slope]);

    expect(result.removed).toEqual([2, 1, 1]);
    expect([...result.remaining]).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it("never makes land outside the lot usable, or leaves the lot unchanged", () => {
    const lot = new Uint8Array([0, 1, 1, 0]);
    const result = subtractMasks(lot, [new Uint8Array([1, 1, 0, 1])]);

    expect([...result.remaining]).toEqual([0, 0, 1, 0]);
    expect(result.removed).toEqual([1]);
    expect([...lot]).toEqual([0, 1, 1, 0]);
  });
});

describe("insideRings", () => {
  it("uses even-odd rings, so a hole in a polygon stays out", () => {
    const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const hole = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ];
    expect(insideRings([2, 2], [outer, hole])).toBe(true);
    expect(insideRings([5, 5], [outer, hole])).toBe(false);
    expect(insideRings([12, 5], [outer, hole])).toBe(false);
  });
});

describe("estimateBuildableArea", () => {
  it("keeps the whole lot when nothing is mapped on flat ground", () => {
    const estimate = run(layersWith());

    expect(estimate.totalAcres).toBeCloseTo(LOT_ACRES, 6);
    expect(estimate.buildableShare).toBeCloseTo(1, 6);
    expect(estimate.deductions.every((item) => item.acres === 0)).toBe(true);
  });

  it("subtracts the flood hazard area but not the 0.2% annual-chance zone", () => {
    const estimate = run(
      layersWith(
        layer({
          id: "flood",
          status: "found",
          shapes: [
            // The west half of the lot is in the Special Flood Hazard Area.
            { rings: [box(0, 0, 0.5, 1)], tone: "strong" },
            { rings: [box(0.5, 0, 1, 1)], tone: "light" },
          ],
        }),
      ),
    );

    expect(removed(estimate, "flood")?.share).toBeCloseTo(0.5, 2);
    expect(estimate.buildableShare).toBeCloseTo(0.5, 2);
    expect(estimate.buildableAcres).toBeCloseTo(LOT_ACRES / 2, 1);
  });

  it("charges an overlap to the first constraint, so the parts add up to the lot", () => {
    const estimate = run(
      layersWith(
        layer({
          id: "flood",
          status: "found",
          shapes: [{ rings: [box(0, 0, 0.5, 1)], tone: "strong" }],
        }),
        // Overlaps the flood zone on u 0.25..0.5 of the lot; only the
        // remaining 0.5..0.625 strip is new.
        layer({
          id: "wetlands",
          status: "found",
          shapes: [{ rings: [box(0.25, 0, 0.625, 1)], tone: "strong" }],
        }),
      ),
    );

    expect(removed(estimate, "flood")?.share).toBeCloseTo(0.5, 2);
    expect(removed(estimate, "wetlands")?.share).toBeCloseTo(0.25, 2);
    const parts = estimate.deductions.reduce(
      (sum, item) => sum + item.acres,
      0,
    );
    expect(parts + estimate.buildableAcres).toBeCloseTo(estimate.totalAcres, 6);
  });

  it("skips a source that did not answer instead of calling it clear", () => {
    const estimate = run(
      layersWith(
        layer({ id: "flood", status: "unavailable" }),
        layer({ id: "wetlands", status: "notCovered", source: undefined }),
      ),
    );

    expect(removed(estimate, "flood")).toBeUndefined();
    expect(removed(estimate, "wetlands")).toBeUndefined();
    expect(estimate.skipped.map((item) => item.id)).toEqual(
      expect.arrayContaining(["flood", "wetlands"]),
    );
    expect(estimate.skipped.find((item) => item.id === "flood")?.reason).toBe(
      BUILDABLE.skipped.unavailable,
    );
  });

  it("reads a wetland drawing (NWI's image) as a mask over the region", () => {
    const width = 10;
    const data = new Uint8Array(width * width);
    // Columns 7..9 of 10: u from 0.7 to 1, which is the lot's east 10%.
    for (let row = 0; row < width; row += 1) {
      for (let col = 7; col < width; col += 1) data[row * width + col] = 1;
    }
    const estimate = estimateBuildableArea({
      parcel: PARCEL,
      layers: layersWith(layer({ id: "wetlands", status: "found" })),
      assets: FLAT,
      wetlandsMask: { width, height: width, data },
      gridSize: 200,
    });

    expect(removed(estimate, "wetlands")?.share).toBeCloseTo(0.1, 2);
  });

  it("removes ground steeper than 15% and keeps gentler ground", () => {
    // Heights are 0..1 of 40 m over 200 m of ground, so a slope of k in u
    // is a 5k grade: 10% on the lot's west half, 20% on its east half.
    const grade = (percent: number) => (percent / 100) * (GROUND / 40);
    const assets = terrain((u) =>
      u < 0.5 ? u * grade(10) : 0.5 * grade(10) + (u - 0.5) * grade(20),
    );
    const estimate = run(layersWith(), assets);

    // The steep east half of the lot, give or take the slope window at the seam.
    expect(removed(estimate, "steepSlope")?.share).toBeGreaterThan(0.45);
    expect(removed(estimate, "steepSlope")?.share).toBeLessThan(0.55);
  });

  it("removes exactly the cells the Slope layer shades", () => {
    // Rolling ground whose grade swings across 15%, so both sides are tested.
    const assets = terrain((u) => 0.5 + 0.08 * Math.sin(u * 40));
    const estimate = run(layersWith(), assets);
    const size = estimate.gridSize;
    const ring = box(0.25, 0.25, 0.75, 0.75);
    let steep = 0;
    let gentle = 0;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const u = (col + 0.5) / size;
        const v = (row + 0.5) / size;
        if (!insideRings(lngLat(u, v) as [number, number], [ring])) continue;
        const shaded = slopePercentAt(assets, { u, v }) >= STEEP_SLOPE_PERCENT;
        if (shaded) steep += 1;
        else gentle += 1;
        expect(estimate.mask[row * size + col]).toBe(shaded ? 0 : 1);
      }
    }
    expect(steep).toBeGreaterThan(0);
    expect(gentle).toBeGreaterThan(0);
  });

  it("draws Rural side and rear yards from the lot line nearest the road", () => {
    const estimate = run(
      layersWith(
        layer({
          id: "zoning",
          status: "found",
          shapes: [{ rings: [box(0, 0, 1, 1)], tone: "strong", label: "R" }],
          onLot: [{ name: "R", share: 1 }],
        }),
        // A road along the south of the lot: the south line is the front.
        layer({
          id: "roadRightOfWay",
          status: "found",
          shapes: [{ rings: [box(0, 0.76, 1, 0.8)], tone: "strong" }],
          distanceM: 2,
        }),
      ),
    );

    // §302.044: 20% of the 100 m depth is 20 m, capped at 50 ft (15.24 m).
    const rear = 50 * FOOT;
    // §302.043, drawn as 10 ft on each side, from the front to the rear yard.
    const side = 10 * FOOT;
    const expected = (100 * rear + 2 * side * (100 - rear)) / 10_000;
    expect(removed(estimate, "zoningYards")?.share).toBeCloseTo(expected, 2);
    expect(removed(estimate, "zoningYards")?.detail).toContain("about 50 ft");
    // The front yard needs the road's centerline and width, which no map gives.
    expect(estimate.skipped.map((item) => item.id)).toContain("frontYard");
  });

  it("skips zoning yards when the lot crosses districts", () => {
    const estimate = run(
      layersWith(
        layer({
          id: "zoning",
          status: "found",
          onLot: [
            { name: "R", share: 0.66 },
            { name: "NC", share: 0.34 },
          ],
        }),
      ),
    );

    expect(removed(estimate, "zoningYards")).toBeUndefined();
    expect(
      estimate.skipped.find((item) => item.id === "zoningYards")?.reason,
    ).toBe(BUILDABLE.skipped.zoning.crosses);
  });
});
