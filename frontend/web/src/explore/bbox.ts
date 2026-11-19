import type { Bbox } from "../data/parcelSource";

/** The API refuses a box wider or taller than this (backend/src/parcels/area.ts). */
export const MAX_SPAN_DEGREES = 0.25;

/** Extra room asked for around the view, so a short pan needs no new request. */
export const VIEW_PADDING = 0.3;

export function contains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[2] >= inner[2] &&
    outer[3] >= inner[3]
  );
}

export function containsPoint(
  box: Bbox,
  point: { latitude: number; longitude: number },
): boolean {
  return (
    point.longitude >= box[0] &&
    point.longitude <= box[2] &&
    point.latitude >= box[1] &&
    point.latitude <= box[3]
  );
}

/**
 * The box to ask for: the view grown by `padding` of its size on each side,
 * then held to the API's limit around the view's center.
 */
export function requestBox(view: Bbox, padding: number): Bbox {
  const [west, south, east, north] = view;
  const width = east - west;
  const height = north - south;
  const halfWidth = Math.min(width * (0.5 + padding), MAX_SPAN_DEGREES / 2 - 1e-4);
  const halfHeight = Math.min(height * (0.5 + padding), MAX_SPAN_DEGREES / 2 - 1e-4);
  const lng = (west + east) / 2;
  const lat = (south + north) / 2;
  return [lng - halfWidth, lat - halfHeight, lng + halfWidth, lat + halfHeight];
}

/** Great-circle distance in kilometers. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
