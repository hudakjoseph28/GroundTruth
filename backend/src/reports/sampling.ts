import type { GeoJsonMultiPolygon, GeoJsonPolygon } from "@groundtruth/shared";

/**
 * Point-sampling geometry shared by the checks that measure how much of a
 * parcel a mapped area covers (Franklin zoning districts, Franklin stream
 * setbacks). Exact polygon clipping fails on real county data (see
 * `measure` in franklinZoning.ts); an even-odd point test cannot.
 */

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** The parcel's rings, outer and holes alike, as GeoJSON positions. */
export function parcelRings(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): number[][][] {
  return geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

/**
 * An equirectangular projection centred on the parcel's first vertex: metres
 * east and north. Over a parcel's few hundred metres the distortion is far
 * below the 7-decimal precision OGRIP publishes.
 */
export function localProjection(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
) {
  const first =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]?.[0]
      : geometry.coordinates[0]?.[0]?.[0];
  const [lon0 = 0, lat0 = 0] = first ?? [];
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLon =
    metresPerDegreeLat * Math.cos((lat0 * Math.PI) / 180);
  return {
    /** A ring in metres east and north of the parcel's first vertex. */
    ring: (coords: number[][]): [number, number][] =>
      coords.map(([lon = 0, lat = 0]) => [
        (lon - lon0) * metresPerDegreeLon,
        (lat - lat0) * metresPerDegreeLat,
      ]),
  };
}

/**
 * The edges of some rings that can matter for points inside `box`, as flat
 * [x1, y1, x2, y2, ...]. A ray cast east from a point in the box can only
 * cross an edge whose vertical span overlaps the box's, so an outline
 * thousands of vertices long shrinks to the few edges near the lot.
 */
export function edgesInBand(
  rings: [number, number][][],
  box: Box,
): Float64Array {
  const kept: number[] = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[j] ?? [0, 0];
      const [x2, y2] = ring[i] ?? [0, 0];
      if (Math.max(y1, y2) < box.minY || Math.min(y1, y2) > box.maxY) continue;
      kept.push(x1, y1, x2, y2);
    }
  }
  return Float64Array.from(kept);
}

/** Even-odd rule: inside when a ray east crosses an odd number of edges. */
export function inside(x: number, y: number, edges: Float64Array): boolean {
  let odd = false;
  for (let k = 0; k < edges.length; k += 4) {
    const x1 = edges[k] ?? 0;
    const y1 = edges[k + 1] ?? 0;
    const x2 = edges[k + 2] ?? 0;
    const y2 = edges[k + 3] ?? 0;
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      odd = !odd;
    }
  }
  return odd;
}

export function bounds(points: number[][]): Box {
  const box = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const [x = 0, y = 0] of points) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}

/** `12%`, `4.7%`, `99.6%`: one decimal under 10% and from 99%. */
export function percent(share: number): string {
  const value = share * 100;
  const rounded =
    value >= 99 || value < 10 ? value.toFixed(1) : value.toFixed(0);
  return `${rounded.replace(/\.0$/, "")}%`;
}
