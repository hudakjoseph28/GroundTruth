// Small geo helpers shared by the WebGL globe and the static fallback.
import type { CountryFeature } from "./useCountries";

type Ring = number[][]; // [lng, lat][]
type Shape = { rings: Ring[]; minLng: number; maxLng: number; minLat: number; maxLat: number };

const DEG = Math.PI / 180;

/** Seeded PRNG, so the network looks the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit vector for a lat/lng (math convention, only used for distances). */
export function unit(lat: number, lng: number): [number, number, number] {
  const c = Math.cos(lat * DEG);
  return [c * Math.cos(lng * DEG), c * Math.sin(lng * DEG), Math.sin(lat * DEG)];
}

/** Great-circle distance in degrees. */
export function arcDegrees(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const a = unit(aLat, aLng);
  const b = unit(bLat, bLng);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / DEG;
}

/** Point on the great circle from a to b at fraction t, as [lat, lng]. */
export function slerp(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  t: number,
): [number, number] {
  const a = unit(aLat, aLng);
  const b = unit(bLat, bLng);
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  const z = a[2] + (b[2] - a[2]) * t;
  const len = Math.hypot(x, y, z) || 1;
  return [Math.asin(z / len) / DEG, Math.atan2(y, x) / DEG];
}

/** Land test against country polygons, with a coarse grid so each lookup checks few shapes. */
export function landTester(countries: CountryFeature[]): (lat: number, lng: number) => boolean {
  const shapes: Shape[] = [];
  for (const feature of countries) {
    const geometry = feature.geometry as { type: string; coordinates: unknown };
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates as Ring[]]
        : geometry.type === "MultiPolygon"
          ? (geometry.coordinates as Ring[][])
          : [];
    for (const rings of polygons) {
      const outer = rings[0];
      if (!outer) continue;
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      for (const [x, y] of outer as [number, number][]) {
        if (x < minLng) minLng = x;
        if (x > maxLng) maxLng = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
      shapes.push({ rings, minLng, maxLng, minLat, maxLat });
    }
  }

  const CELL = 10;
  const cols = 360 / CELL;
  const grid: number[][] = Array.from({ length: cols * (180 / CELL) }, () => []);
  shapes.forEach((shape, index) => {
    const c0 = Math.floor((shape.minLng + 180) / CELL);
    const c1 = Math.min(cols - 1, Math.floor((shape.maxLng + 180) / CELL));
    const r0 = Math.floor((shape.minLat + 90) / CELL);
    const r1 = Math.min(180 / CELL - 1, Math.floor((shape.maxLat + 90) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * cols + c]!.push(index);
  });

  return (lat, lng) => {
    const c = Math.min(cols - 1, Math.floor((lng + 180) / CELL));
    const r = Math.min(180 / CELL - 1, Math.floor((lat + 90) / CELL));
    for (const index of grid[r * cols + c] ?? []) {
      const shape = shapes[index]!;
      if (lng < shape.minLng || lng > shape.maxLng || lat < shape.minLat || lat > shape.maxLat) continue;
      let inside = false;
      for (const ring of shape.rings) if (inRing(ring, lng, lat)) inside = !inside;
      if (inside) return true;
    }
    return false;
  };
}

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
