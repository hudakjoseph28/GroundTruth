import {
  mercatorLat,
  mercatorLng,
  mercatorX,
  mercatorY,
  outerRing,
  regionUV,
  type GeoJsonMultiPolygon,
  type GeoJsonPolygon,
  type MapLayer,
  type MapLayerId,
  type Parcel,
  type ParcelLayers,
} from "@groundtruth/shared";
import { BUILDABLE } from "../../content/buildable";
import {
  slopePercentAt,
  STEEP_SLOPE_PERCENT,
  type HeightGrid,
} from "../Elevation/elevation";
import type { LandAssets } from "../ParcelScene/landAssets";

// The Buildable area estimate: the lot, minus every constraint the public maps
// give us geometry for. It samples one grid over the land block's region, so
// the 3D block and the flat picture can shade exactly the cells it kept.

export const BUILDABLE_GRID_SIZE = 192;

export type BuildableConstraintId =
  | "flood"
  | "wetlands"
  | "streamSetback"
  | "steepSlope"
  | "zoningYards";

export interface BuildableSource {
  title: string;
  url: string;
}

/** One byte per pixel over `ParcelLayers.bbox`: zero is clear, anything else is mapped. */
export interface BinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface BuildableDeduction {
  id: BuildableConstraintId;
  label: string;
  detail: string;
  /** Acres this constraint took that no earlier constraint had taken. */
  acres: number;
  share: number;
  source: BuildableSource | null;
}

export interface BuildableSkipped {
  id: BuildableConstraintId | "frontYard";
  label: string;
  reason: string;
  source: BuildableSource | null;
}

export interface BuildableAreaEstimate {
  gridSize: number;
  /** One byte per grid cell, row 0 at the north edge: 1 where the lot is still usable. */
  mask: Uint8Array;
  totalAcres: number;
  buildableAcres: number;
  buildableShare: number;
  deductions: BuildableDeduction[];
  skipped: BuildableSkipped[];
}

/** The centre of one grid cell, in degrees and in metres from the region's north-west corner. */
interface Cell {
  u: number;
  v: number;
  lng: number;
  lat: number;
  xM: number;
  yM: number;
}

interface Constraint {
  id: BuildableConstraintId;
  label: string;
  detail: string;
  source: BuildableSource | null;
  contains: (cell: Cell) => boolean;
}

type Point = [number, number];
type Segment = [Point, Point];

const SQUARE_METRES_PER_ACRE = 4046.8564224;
const FOOT = 0.3048;

/**
 * Subtracts each mapped constraint from the lot, in the order they are listed,
 * so land under two constraints is counted once. A constraint whose source
 * did not answer is skipped and named, never treated as "none".
 */
export function estimateBuildableArea({
  parcel,
  layers,
  assets,
  wetlandsMask,
  gridSize = BUILDABLE_GRID_SIZE,
}: {
  parcel: Parcel;
  layers: ParcelLayers;
  assets: HeightGrid;
  wetlandsMask: BinaryMask | null;
  gridSize?: number;
}): BuildableAreaEstimate {
  const cells = gridCells(assets.meta, gridSize);
  const lot = Uint8Array.from(cells, (cell) =>
    insideGeometry([cell.lng, cell.lat], parcel.geometry.geojson) ? 1 : 0,
  );
  const lotCells = lot.reduce((sum, value) => sum + value, 0);
  const cellSquareMetres =
    (assets.meta.groundMeters.width / gridSize) *
    (assets.meta.groundMeters.depth / gridSize);
  const totalAcres =
    parcel.acreage ??
    parcel.mappedAcreage ??
    (lotCells * cellSquareMetres) / SQUARE_METRES_PER_ACRE;

  const constraints: Constraint[] = [];
  const skipped: BuildableSkipped[] = [];
  const keep = (result: Constraint | BuildableSkipped | null) => {
    if (!result) return;
    if ("contains" in result) constraints.push(result);
    else skipped.push(result);
  };
  keep(shapeConstraint(layers, "flood"));
  keep(wetlandsConstraint(layers, wetlandsMask));
  keep(shapeConstraint(layers, "streamSetback"));
  keep(steepSlopeConstraint(assets));
  for (const result of zoningYards(parcel, layers, assets.meta)) keep(result);

  const { remaining, removed } = subtractMasks(
    lot,
    constraints.map((constraint) =>
      Uint8Array.from(cells, (cell) => (constraint.contains(cell) ? 1 : 0)),
    ),
  );
  const shareOfLot = (count: number) => (lotCells > 0 ? count / lotCells : 0);
  const buildableShare = shareOfLot(
    remaining.reduce((sum, value) => sum + value, 0),
  );
  return {
    gridSize,
    mask: remaining,
    totalAcres,
    buildableAcres: totalAcres * buildableShare,
    buildableShare,
    deductions: constraints.map((constraint, index) => {
      const share = shareOfLot(removed[index] ?? 0);
      return {
        id: constraint.id,
        label: constraint.label,
        detail: constraint.detail,
        acres: totalAcres * share,
        share,
        source: constraint.source,
      };
    }),
    skipped,
  };
}

/**
 * The boolean subtraction at the heart of the estimate: clears every cell of
 * the lot that a constraint covers. `removed[i]` counts only the cells
 * constraint i cleared, so an overlap is charged to the first constraint.
 */
export function subtractMasks(
  lot: Uint8Array,
  constraints: readonly Uint8Array[],
): { remaining: Uint8Array; removed: number[] } {
  const remaining = lot.slice();
  const removed = constraints.map((constraint) => {
    let count = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      if (remaining[index] && constraint[index]) {
        remaining[index] = 0;
        count += 1;
      }
    }
    return count;
  });
  return { remaining, removed };
}

function gridCells(meta: LandAssets["meta"], size: number): Cell[] {
  const west = mercatorX(meta.bbox.west);
  const east = mercatorX(meta.bbox.east);
  const north = mercatorY(meta.bbox.north);
  const south = mercatorY(meta.bbox.south);
  const cells: Cell[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const u = (col + 0.5) / size;
      const v = (row + 0.5) / size;
      cells.push({
        u,
        v,
        lng: mercatorLng(west + u * (east - west)),
        lat: mercatorLat(north + v * (south - north)),
        xM: u * meta.groundMeters.width,
        yM: v * meta.groundMeters.depth,
      });
    }
  }
  return cells;
}

function findLayer(layers: ParcelLayers, id: MapLayerId): MapLayer {
  return (
    layers.layers.find((layer) => layer.id === id) ?? {
      id,
      status: "unavailable",
      shapes: [],
      inView: [],
    }
  );
}

function sourceOf(layer: MapLayer): BuildableSource | null {
  return layer.source
    ? { title: layer.source.title, url: layer.source.url }
    : null;
}

/** A layer whose strong shapes are the constraint: the flood hazard area, the setback. */
function shapeConstraint(
  layers: ParcelLayers,
  id: "flood" | "streamSetback",
): Constraint | BuildableSkipped {
  const layer = findLayer(layers, id);
  const words = BUILDABLE.constraints[id];
  if (layer.status === "notCovered" || layer.status === "unavailable") {
    return {
      id,
      label: words.label,
      reason: BUILDABLE.skipped[layer.status],
      source: sourceOf(layer),
    };
  }
  // `light` is the 0.2% annual-chance zone, or the creek drawn inside its setback.
  const rings = layer.shapes
    .filter((shape) => shape.tone === "strong")
    .map((shape) => shape.rings);
  return {
    id,
    label: words.label,
    detail: words.detail,
    source: sourceOf(layer),
    contains: ({ lng, lat }) =>
      rings.some((shape) => insideRings([lng, lat], shape)),
  };
}

/** NWI returns a drawing of the view (decoded into `mask`), or outlines for the example. */
function wetlandsConstraint(
  layers: ParcelLayers,
  mask: BinaryMask | null,
): Constraint | BuildableSkipped {
  const layer = findLayer(layers, "wetlands");
  const words = BUILDABLE.constraints.wetlands;
  const source = sourceOf(layer) ?? BUILDABLE.sources.wetlands;
  if (layer.status === "notCovered" || layer.status === "unavailable") {
    return {
      id: "wetlands",
      label: words.label,
      reason:
        layer.status === "notCovered"
          ? BUILDABLE.skipped.wetlandsNotCovered
          : BUILDABLE.skipped.unavailable,
      source,
    };
  }
  if (layer.status === "found" && layer.shapes.length === 0 && !mask) {
    return {
      id: "wetlands",
      label: words.label,
      reason: BUILDABLE.skipped.wetlandsUnreadable,
      source,
    };
  }
  const rings = layer.shapes.map((shape) => shape.rings);
  return {
    id: "wetlands",
    label: words.label,
    detail: words.detail,
    source,
    contains: ({ lng, lat }) => {
      if (rings.some((shape) => insideRings([lng, lat], shape))) return true;
      if (!mask) return false;
      const { u, v } = regionUV(layers.bbox, lng, lat);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
      const col = Math.floor(u * mask.width);
      const row = Math.floor(v * mask.height);
      return mask.data[row * mask.width + col] !== 0;
    },
  };
}

/**
 * Slope from the land block's own height map, with the same reading and
 * threshold the Slope layer shades (`slopePercentAt`, at or over 15%), so the
 * shading and this deduction always agree at any point.
 */
function steepSlopeConstraint(assets: HeightGrid): Constraint {
  const { meta } = assets;
  return {
    id: "steepSlope",
    label: BUILDABLE.constraints.steepSlope.label,
    detail: BUILDABLE.constraints.steepSlope.detail,
    source: {
      title: meta.elevation.attribution,
      url: meta.elevation.sourceUrl,
    },
    contains: ({ u, v }) =>
      slopePercentAt(assets, { u, v }) >= STEEP_SLOPE_PERCENT,
  };
}

/**
 * The Rural (R) district's side and rear yards, Franklin County Zoning
 * Resolution §302.043–302.044. The front yard (§302.045, §504.01) is named
 * and skipped: the maps give no road centerline or planned right-of-way width.
 */
function zoningYards(
  parcel: Parcel,
  layers: ParcelLayers,
  meta: LandAssets["meta"],
): (Constraint | BuildableSkipped)[] {
  const zoning = findLayer(layers, "zoning");
  const words = BUILDABLE.skipped.zoning;
  const skip = (reason: string, source = sourceOf(zoning)) => [
    { id: "zoningYards" as const, label: words.label, reason, source },
  ];
  if (zoning.status === "notCovered") return skip(BUILDABLE.skipped.notCovered);
  if (zoning.status === "unavailable") return skip(words.unavailable);
  const districts = zoning.onLot ?? [];
  if (zoning.status === "none" || districts.length === 0) {
    return skip(words.none);
  }
  const main = districts[0]!;
  if (main.share < 0.95) return skip(words.crosses);
  if (main.name !== "R") return skip(words.other(main.name));

  const toLocal = ([lng = 0, lat = 0]: number[]): Point => {
    const { u, v } = regionUV(meta.bbox, lng, lat);
    return [u * meta.groundMeters.width, v * meta.groundMeters.depth];
  };
  const ring = outerRing(parcel.geometry.geojson).map(toLocal);
  const road = findLayer(layers, "roadRightOfWay");
  const roadEdges = road.shapes
    .flatMap((shape) => shape.rings)
    .flatMap((roadRing) => segments(roadRing.map(toLocal)));
  if (ring.length < 4 || roadEdges.length === 0) {
    return skip(words.noRoad, BUILDABLE.sources.zoningYards);
  }

  const yards = ruralYards(ring, roadEdges);
  return [
    {
      id: "zoningYards",
      label: BUILDABLE.constraints.zoningYards.label,
      detail: BUILDABLE.constraints.zoningYards.detail(
        String(Math.round(yards.rearM / FOOT)),
      ),
      source: BUILDABLE.sources.zoningYards,
      contains: ({ xM, yM }) => yards.contains([xM, yM]),
    },
    {
      id: "frontYard",
      label: BUILDABLE.skipped.frontYard.label,
      reason: BUILDABLE.skipped.frontYard.reason,
      source: BUILDABLE.sources.frontYard,
    },
  ];
}

/**
 * Side and rear yards for a lot whose front is the lot line whose middle is
 * nearest the road (a corner touches two lines; the middle picks one). Rear
 * lot lines face away from the front (or, failing that, the farthest line);
 * every other line but the front is a side.
 */
function ruralYards(ring: Point[], roadEdges: Segment[]) {
  const edges = segments(ring);
  const toRoad = (edge: Segment) => distanceTo(mid(edge), roadEdges);
  const front = edges.reduce((best, edge) =>
    toRoad(edge) < toRoad(best) ? edge : best,
  );
  const [a, b] = front;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const along: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const center = centroid(ring);
  // The inward normal of the front line: depth is measured along it.
  let inward: Point = [-along[1], along[0]];
  if (dot(sub(center, middle), inward) < 0) inward = [-inward[0], -inward[1]];
  const depthOf = (point: Point) => dot(sub(point, middle), inward);
  const depth = Math.max(...ring.map(depthOf));

  const others = edges.filter((edge) => edge !== front);
  const midDepth = (edge: Segment) => depthOf(mid(edge));
  // Within 45° of parallel to the front, in the back third of the lot. A
  // line that runs from front to back is a side, however far back it ends.
  const facesFront = (edge: Segment) => {
    const run = sub(edge[1], edge[0]);
    return Math.abs(dot(run, along)) / (Math.hypot(...run) || 1) > Math.SQRT1_2;
  };
  let rear = others.filter(
    (edge) => midDepth(edge) > depth * 0.67 && facesFront(edge),
  );
  if (rear.length === 0 && others.length > 0) {
    rear = [
      others.reduce((far, edge) =>
        midDepth(edge) > midDepth(far) ? edge : far,
      ),
    ];
  }
  const sides = others.filter((edge) => !rear.includes(edge));
  const rearM = Math.min(depth * 0.2, 50 * FOOT);
  const sideM = 10 * FOOT;
  return {
    rearM,
    sideM,
    contains: (point: Point) =>
      distanceTo(point, rear) < rearM || distanceTo(point, sides) < sideM,
  };
}

function insideGeometry(
  point: Point,
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): boolean {
  return geometry.type === "Polygon"
    ? insideRings(point, geometry.coordinates)
    : geometry.coordinates.some((polygon) => insideRings(point, polygon));
}

/** Even-odd point-in-polygon over every ring, so holes stay holes. */
export function insideRings(point: Point, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1 = 0, y1 = 0] = ring[j] ?? [];
      const [x2 = 0, y2 = 0] = ring[i] ?? [];
      if (
        y1 > point[1] !== y2 > point[1] &&
        point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function segments(ring: Point[]): Segment[] {
  const result: Segment[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    result.push([ring[index]!, ring[index + 1]!]);
  }
  return result;
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const mid = ([a, b]: Segment): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function centroid(ring: Point[]): Point {
  const points = ring.slice(0, -1);
  const n = Math.max(points.length, 1);
  return [
    points.reduce((sum, point) => sum + point[0], 0) / n,
    points.reduce((sum, point) => sum + point[1], 0) / n,
  ];
}

function distanceTo(point: Point, edges: Segment[]): number {
  let best = Infinity;
  for (const edge of edges) best = Math.min(best, pointToSegment(point, edge));
  return best;
}

function pointToSegment(point: Point, [a, b]: Segment): number {
  const run = sub(b, a);
  const t = Math.max(
    0,
    Math.min(1, dot(sub(point, a), run) / (dot(run, run) || 1)),
  );
  return Math.hypot(
    point[0] - (a[0] + t * run[0]),
    point[1] - (a[1] + t * run[1]),
  );
}
