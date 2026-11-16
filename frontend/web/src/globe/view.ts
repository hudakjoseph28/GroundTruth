// Opening view shared by the WebGL globe and its static fallback. The camera
// looks north of Puerto Rico, which puts the Ohio hub up and to the left of
// the disc's center: about 0.30 of its radius left and 0.45 up. A page that
// places the globe can use that offset to put the hub where it wants it while
// the disc runs off the right and bottom of the screen.
export const GLOBE_VIEW = { lat: 22.6, lng: -66.8, altitude: 1.66 } as const;

/** The camera's distance from the globe's center, in globe radii. */
export const CAMERA_DISTANCE = GLOBE_VIEW.altitude + 1;
/** The disc's radius as a share of a square canvas, with the camera's 50 degree view. */
export const DISC_SHARE = 0.435;

/**
 * Camera altitude that keeps the globe the same share of its canvas at any size.
 * The camera's 50 degree field of view is vertical, so a canvas narrower than it
 * is tall would crop the sides; pull back in proportion to keep the whole disc.
 */
export function altitudeFor(width: number, height: number): number {
  const narrow = Math.min(1, width / Math.max(1, height));
  return (GLOBE_VIEW.altitude + 1) / narrow - 1;
}

/**
 * How much larger than usual the globe is drawn. Its points are sized in
 * pixels for a globe about 900px across; on a bigger one they grow with it,
 * so a zoomed-in globe looks zoomed in and not thinned out.
 */
export function zoomFor(width: number): number {
  return Math.min(1.8, Math.max(1, width / 900));
}

/** Device pixels per CSS pixel: at most 2, and fewer on huge canvases. */
export function pixelRatioFor(width: number, height: number): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(dpr, 2, 2400 / Math.max(width, height, 1)));
}
