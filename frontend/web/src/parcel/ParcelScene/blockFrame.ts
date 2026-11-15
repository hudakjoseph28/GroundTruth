// How the land block is sized and framed. The three.js scene and the 2D
// transition both read this, so the last block in the chain can land exactly
// where the land block is drawn.
import type { LandMeta } from "./landMeta";

/** Ohio is flat; the terrain is drawn this many times taller than it is. */
export const EXAGGERATION = 3;

/** The block is 2 units wide. Everything else is in the same units. */
const WIDTH = 2;
/** Soil shown below the lowest point of the surface. */
const SOIL_DEPTH = 0.42;

export const VIEW = {
  fov: 30,
  /** Opening angle around the block, radians from south toward west. */
  azimuth: -0.62,
  /** Opening angle down from straight overhead, radians. */
  polar: 1.08,
  minPolar: 0.72,
  maxPolar: 1.38,
  targetY: -0.06,
} as const;

export type Vec3 = [number, number, number];

export interface BlockDims {
  /** East to west, along x. */
  width: number;
  /** North to south, along z. */
  depth: number;
  /** Highest point of the surface, y. */
  top: number;
  /** The flat underside, y. */
  base: number;
  unitsPerMeter: number;
}

export function blockDims(meta: LandMeta | null): BlockDims {
  if (!meta) return { width: WIDTH, depth: WIDTH, top: 0.2, base: -SOIL_DEPTH, unitsPerMeter: 0 };
  const unitsPerMeter = WIDTH / meta.groundMeters.width;
  const relief = meta.elevation.maxMeters - meta.elevation.minMeters;
  return {
    width: WIDTH,
    depth: meta.groundMeters.depth * unitsPerMeter,
    top: relief * unitsPerMeter * EXAGGERATION,
    base: -SOIL_DEPTH,
    unitsPerMeter,
  };
}

/** Camera distance that keeps the whole block in frame at any aspect ratio. */
export function fitDistance(aspect: number): number {
  const vertical = (VIEW.fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return 1.58 / Math.sin(Math.min(vertical, horizontal) / 2);
}

export function cameraPosition(azimuth: number, polar: number, distance: number): Vec3 {
  return [
    distance * Math.sin(polar) * Math.sin(azimuth),
    VIEW.targetY + distance * Math.cos(polar),
    distance * Math.sin(polar) * Math.cos(azimuth),
  ];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * Projects block-space points to pixels in a stage of the given size, with the
 * opening camera. Matches the three.js camera in LandBlockScene.
 */
export function stageProjector(width: number, height: number): (point: Vec3) => { x: number; y: number } {
  const aspect = width / Math.max(1, height);
  const eye = cameraPosition(VIEW.azimuth, VIEW.polar, fitDistance(aspect));
  const forward = normalize(sub([0, VIEW.targetY, 0], eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tan = Math.tan((VIEW.fov * Math.PI) / 360);
  return (point) => {
    const d = sub(point, eye);
    const z = dot(d, forward);
    const x = dot(d, right) / (z * tan * aspect);
    const y = dot(d, up) / (z * tan);
    return { x: (x * 0.5 + 0.5) * width, y: (0.5 - y * 0.5) * height };
  };
}

/** The eight corners of the block's bounding box, bottom ring then top ring. */
export function boxCorners(dims: BlockDims): Vec3[] {
  const x = dims.width / 2;
  const z = dims.depth / 2;
  const ring = (y: number): Vec3[] => [
    [-x, y, z],
    [x, y, z],
    [x, y, -z],
    [-x, y, -z],
  ];
  return [...ring(dims.base), ...ring(dims.top)];
}

/** Corner index pairs for the twelve edges of boxCorners. */
export const BOX_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
