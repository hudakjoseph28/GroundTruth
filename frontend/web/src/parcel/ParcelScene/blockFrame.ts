// How the land block is sized and framed. The three.js scene and the 2D
// transition both read this, so the last block in the chain can land exactly
// where the land block is drawn.
import type { LandMeta } from "./landMeta";

/** Ohio is flat; the terrain is drawn this many times taller than it is. */
export const EXAGGERATION = 3;

/** The block is 2 units wide. Everything else is in the same units. */
const WIDTH = 2;
/** Soil shown below the lowest point of the surface. */
export const SOIL_DEPTH = 0.58;
/** The same, where the block rests on a table: a slab, not a core sample. */
export const TABLE_SOIL_DEPTH = 0.2;
/** Share of the container the block may fill; the rest is room to float and tilt. */
const FILL = 0.96;

export const VIEW = {
  fov: 30,
  /** Opening angle around the block, radians from south toward west. */
  azimuth: -0.62,
  /** Opening angle down from straight overhead, radians. */
  polar: 1.08,
  minPolar: 0.72,
  maxPolar: 1.38,
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

export function blockDims(meta: LandMeta | null, soilDepth: number = SOIL_DEPTH): BlockDims {
  if (!meta) return { width: WIDTH, depth: WIDTH, top: 0.2, base: -soilDepth, unitsPerMeter: 0 };
  const unitsPerMeter = WIDTH / meta.groundMeters.width;
  const relief = meta.elevation.maxMeters - meta.elevation.minMeters;
  return {
    width: WIDTH,
    depth: meta.groundMeters.depth * unitsPerMeter,
    top: relief * unitsPerMeter * EXAGGERATION,
    base: -soilDepth,
    unitsPerMeter,
  };
}

/** The point the camera looks at: the middle of the block's bounding box. */
export function blockCenter(dims: BlockDims): Vec3 {
  return [0, (dims.top + dims.base) / 2, 0];
}

/**
 * Camera distance at which the block just fills a container of this aspect
 * ratio, seen from this angle above. It is worked out from the block's
 * bounding box, turned through every angle around the vertical axis, so the
 * block stays in frame as it rotates. `fillX` and `fillY` are the shares of
 * the container's width and height the block may take.
 */
export function fitDistance(
  aspect: number,
  dims: BlockDims,
  polar: number = VIEW.polar,
  fillX: number = FILL,
  fillY: number = FILL,
): number {
  const tan = Math.tan((VIEW.fov * Math.PI) / 360);
  const tanV = tan * fillY;
  const tanH = tan * aspect * fillX;
  const radius = Math.hypot(dims.width, dims.depth) / 2;
  const half = (dims.top - dims.base) / 2;
  const sin = Math.sin(polar);
  const cos = Math.cos(polar);
  let distance = 0;
  const steps = 48;
  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    // A point on the box's turning circle: `along` is toward the camera, `across` is sideways.
    const along = radius * Math.cos(angle);
    const across = Math.abs(radius * Math.sin(angle));
    for (const height of [half, -half]) {
      const up = Math.abs(height * sin - along * cos);
      const near = along * sin + height * cos;
      distance = Math.max(distance, across / tanH + near, up / tanV + near);
    }
  }
  return distance;
}

/** Where the camera sits, for an angle around the block and an angle down from overhead. */
export function cameraPosition(
  azimuth: number,
  polar: number,
  distance: number,
  target: Vec3,
): Vec3 {
  return [
    target[0] + distance * Math.sin(polar) * Math.sin(azimuth),
    target[1] + distance * Math.cos(polar),
    target[2] + distance * Math.sin(polar) * Math.cos(azimuth),
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
export function stageProjector(
  width: number,
  height: number,
  dims: BlockDims,
): (point: Vec3) => { x: number; y: number } {
  const aspect = width / Math.max(1, height);
  const target = blockCenter(dims);
  const eye = cameraPosition(VIEW.azimuth, VIEW.polar, fitDistance(aspect, dims), target);
  const forward = normalize(sub(target, eye));
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
