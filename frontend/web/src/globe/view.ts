// Opening view shared by the WebGL globe and its static fallback. The camera
// looks at the western Atlantic so Ohio sits left of center, in the gap between
// the search column and the report card that floats over the hero's right side.
export const GLOBE_VIEW = { lat: 34, lng: -47, altitude: 1.66 } as const;

/**
 * Camera altitude that keeps the globe the same share of its canvas at any size.
 * The camera's 50 degree field of view is vertical, so a canvas narrower than it
 * is tall would crop the sides; pull back in proportion to keep the whole disc.
 */
export function altitudeFor(width: number, height: number): number {
  const narrow = Math.min(1, width / Math.max(1, height));
  return (GLOBE_VIEW.altitude + 1) / narrow - 1;
}

/** Device pixels per CSS pixel: at most 2, and fewer on huge canvases. */
export function pixelRatioFor(width: number, height: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(dpr, 2, 2400 / Math.max(width, height, 1)));
}
