/**
 * The map box asked for by `GET /api/parcels/area?bbox=west,south,east,north`.
 *
 * The explore map asks only from zoom 15 in, where a desktop window spans
 * about 0.06° of longitude over Ohio (a 4K window about 0.17°). A box wider
 * or taller than MAX_AREA_SPAN_DEGREES is refused: it would hold thousands of
 * parcels, and OGRIP sends at most MAX_AREA_PARCELS outlines per answer.
 */
export const MAX_AREA_SPAN_DEGREES = 0.25;

/**
 * Outlines per answer. A 1.5 x 1.1 km box of downtown Columbus already holds
 * more; 500 outlines are about 230 KB from OGRIP and answer in under a second
 * (measured 2026-11-18).
 */
export const MAX_AREA_PARCELS = 500;

/**
 * Ohio's extent with a small margin, `[west, south, east, north]`, Lake Erie
 * waters included. A box entirely outside it is not Ohio's parcel map.
 */
export const OHIO_EXTENT = [-84.83, 38.39, -80.51, 42.33] as const;

export type Bbox = [west: number, south: number, east: number, north: number];

export type BboxProblem = "malformed" | "tooLarge" | "outsideOhio";

export function parseBbox(
  value: unknown,
): { bbox: Bbox } | { problem: BboxProblem } {
  if (typeof value !== "string") return { problem: "malformed" };
  const parts = value.split(",");
  if (parts.length !== 4) return { problem: "malformed" };
  const numbers = parts.map((part) =>
    /^\s*-?\d+(\.\d+)?\s*$/.test(part) ? Number(part) : Number.NaN,
  );
  if (!numbers.every(Number.isFinite)) return { problem: "malformed" };
  const [west, south, east, north] = numbers as Bbox;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    return { problem: "malformed" };
  }
  if (
    east - west > MAX_AREA_SPAN_DEGREES ||
    north - south > MAX_AREA_SPAN_DEGREES
  ) {
    return { problem: "tooLarge" };
  }
  const [ohioWest, ohioSouth, ohioEast, ohioNorth] = OHIO_EXTENT;
  if (
    east < ohioWest ||
    west > ohioEast ||
    north < ohioSouth ||
    south > ohioNorth
  ) {
    return { problem: "outsideOhio" };
  }
  return { bbox: [west, south, east, north] };
}
