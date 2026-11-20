import type { LandAssets } from "../ParcelScene/landAssets";
import { heightAt } from "../ParcelScene/landAssets";
import { regionUV } from "../ParcelScene/landMeta";

export const METERS_TO_FEET = 3.28084;
export const STEEP_SLOPE_PERCENT = 15;

/** 2 ft contours, wider on hilly lots so the lines stay readable. */
export function contourIntervalFeet(riseFeet: number): number {
  if (riseFeet <= 40) return 2;
  if (riseFeet <= 100) return 5;
  return 10;
}

export interface ProfilePoint {
  u: number;
  v: number;
}

export interface ProfileLine {
  start: ProfilePoint;
  end: ProfilePoint;
}

export interface ElevationSample {
  distanceFeet: number;
  elevationFeet: number;
}

export interface ElevationAnalysis {
  minFeet: number;
  maxFeet: number;
  riseFeet: number;
  averageSlopePercent: number;
  steepestSlopePercent: number;
  /** Share of the lot's grid cells at or over STEEP_SLOPE_PERCENT, 0..1. */
  steepShare: number;
  contourFeet: number;
  summary: string;
}

const COMPASS = [
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
  "south",
  "south-east",
] as const;

/** Where a point sits on the lot, in words: "north-east side" or "middle". */
function sideOf(
  point: ProfilePoint,
  center: ProfilePoint,
  radiusMeters: number,
  ground: { width: number; depth: number },
): string {
  const east = (point.u - center.u) * ground.width;
  const north = (center.v - point.v) * ground.depth;
  if (Math.hypot(east, north) < radiusMeters * 0.25) return "middle";
  const turn =
    Math.round((Math.atan2(north, east) / (Math.PI / 4) + 8) % 8) % 8;
  return `${COMPASS[turn]} side`;
}

function slopeWords(averageSlopePercent: number): string {
  if (averageSlopePercent < 2) return "a very gentle slope";
  if (averageSlopePercent < 5) return "a gentle slope";
  if (averageSlopePercent < 10) return "a moderate slope";
  if (averageSlopePercent < STEEP_SLOPE_PERCENT) return "a noticeable slope";
  return "steep ground";
}

export function ringInRegion(
  assets: LandAssets,
  ring: number[][],
): ProfilePoint[] {
  return ring.map(([lng = 0, lat = 0]) => regionUV(assets.meta.bbox, lng, lat));
}

export function elevationFeetAt(
  assets: LandAssets,
  point: ProfilePoint,
): number {
  const { minMeters, maxMeters } = assets.meta.elevation;
  return (
    (minMeters + heightAt(assets, point.u, point.v) * (maxMeters - minMeters)) *
    METERS_TO_FEET
  );
}

function inside(point: ProfilePoint, ring: readonly ProfilePoint[]): boolean {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    if (
      a.v > point.v !== b.v > point.v &&
      point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u
    ) {
      odd = !odd;
    }
  }
  return odd;
}

/**
 * Half the distance the slope is measured over. The terrain tiles are about
 * 3.7 m a pixel in Ohio (zoom 15), so a shorter baseline would measure the
 * seams of the upsampled grid, not the ground.
 */
const SLOPE_HALF_BASELINE_METERS = 4;

export function slopePercentAt(
  assets: LandAssets,
  point: ProfilePoint,
): number {
  const { width, depth } = assets.meta.groundMeters;
  const cell = Math.max(width, depth) / Math.max(2, assets.heightSize - 1);
  const half = Math.max(cell, SLOPE_HALF_BASELINE_METERS);
  const stepU = half / width;
  const stepV = half / depth;
  const west = elevationFeetAt(assets, { u: point.u - stepU, v: point.v });
  const east = elevationFeetAt(assets, { u: point.u + stepU, v: point.v });
  const north = elevationFeetAt(assets, { u: point.u, v: point.v - stepV });
  const south = elevationFeetAt(assets, { u: point.u, v: point.v + stepV });
  const run = half * 2 * METERS_TO_FEET;
  return Math.hypot((east - west) / run, (south - north) / run) * 100;
}

export function analyzeElevation(
  assets: LandAssets,
  boundary: number[][],
): ElevationAnalysis | null {
  const ring = ringInRegion(assets, boundary);
  if (ring.length < 3) return null;
  const size = assets.heightSize;
  let minFeet = Infinity;
  let maxFeet = -Infinity;
  const cells: { point: ProfilePoint; feet: number }[] = [];
  let slopeTotal = 0;
  let steepestSlopePercent = 0;
  let steep = 0;
  let count = 0;
  let sumU = 0;
  let sumV = 0;

  // Only the cells under the lot's bounding box can be inside it.
  const cellRange = (values: number[]) => [
    Math.max(0, Math.floor(Math.min(...values) * size)),
    Math.min(size - 1, Math.ceil(Math.max(...values) * size)),
  ];
  const [colFrom, colTo] = cellRange(ring.map((p) => p.u));
  const [rowFrom, rowTo] = cellRange(ring.map((p) => p.v));
  for (let row = rowFrom!; row <= rowTo!; row++) {
    for (let col = colFrom!; col <= colTo!; col++) {
      const point = { u: (col + 0.5) / size, v: (row + 0.5) / size };
      if (!inside(point, ring)) continue;
      const feet = elevationFeetAt(assets, point);
      const slope = slopePercentAt(assets, point);
      minFeet = Math.min(minFeet, feet);
      maxFeet = Math.max(maxFeet, feet);
      cells.push({ point, feet });
      slopeTotal += slope;
      steepestSlopePercent = Math.max(steepestSlopePercent, slope);
      if (slope >= STEEP_SLOPE_PERCENT) steep++;
      sumU += point.u;
      sumV += point.v;
      count++;
    }
  }
  if (count === 0) return null;

  const riseFeet = maxFeet - minFeet;
  const averageSlopePercent = slopeTotal / count;
  const ground = assets.meta.groundMeters;
  const center = { u: sumU / count, v: sumV / count };
  // Radius of a circle with the lot's area, so "middle" scales with the lot.
  const cellMeters = (ground.width / size) * (ground.depth / size);
  const radiusMeters = Math.sqrt((count * cellMeters) / Math.PI);
  // Where the high and low ground sit: the middle of the top and bottom tenth
  // of the lot's range, so one stray grid cell does not pick the direction.
  const zone = (near: (feet: number) => boolean): ProfilePoint => {
    let u = 0;
    let v = 0;
    let n = 0;
    for (const cell of cells) {
      if (!near(cell.feet)) continue;
      u += cell.point.u;
      v += cell.point.v;
      n++;
    }
    return n ? { u: u / n, v: v / n } : center;
  };
  const band = riseFeet * 0.1;
  const from = sideOf(
    zone((feet) => feet >= maxFeet - band),
    center,
    radiusMeters,
    ground,
  );
  const to = sideOf(
    zone((feet) => feet <= minFeet + band),
    center,
    radiusMeters,
    ground,
  );
  const character = slopeWords(averageSlopePercent);
  const summary =
    riseFeet < 1
      ? `The lot is nearly flat: its highest and lowest points are less than a foot apart.`
      : from === to
        ? `The lot varies about ${Math.round(riseFeet)} ft from its highest to its lowest point, ${character}.`
        : `The lot drops about ${Math.round(riseFeet)} ft from its ${from} to its ${to}, ${character}.`;
  return {
    minFeet,
    maxFeet,
    riseFeet,
    averageSlopePercent,
    steepestSlopePercent,
    steepShare: steep / count,
    contourFeet: contourIntervalFeet(riseFeet),
    summary,
  };
}

export function defaultProfileLine(
  assets: LandAssets,
  boundary: number[][],
): ProfileLine | null {
  const ring = ringInRegion(assets, boundary);
  if (ring.length < 2) return null;
  let best: ProfileLine = { start: ring[0]!, end: ring[1]! };
  let bestDistance = -1;
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const a = ring[i]!;
      const b = ring[j]!;
      const distance = Math.hypot(
        (b.u - a.u) * assets.meta.groundMeters.width,
        (b.v - a.v) * assets.meta.groundMeters.depth,
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = { start: a, end: b };
      }
    }
  }
  return best;
}

export function nearestBoundaryPoint(
  point: ProfilePoint,
  ring: readonly ProfilePoint[],
): ProfilePoint {
  let nearest = ring[0] ?? point;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const along = Math.max(
      0,
      Math.min(
        1,
        ((point.u - a.u) * dx + (point.v - a.v) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const candidate = { u: a.u + dx * along, v: a.v + dy * along };
    const distance = Math.hypot(candidate.u - point.u, candidate.v - point.v);
    if (distance < best) {
      best = distance;
      nearest = candidate;
    }
  }
  return nearest;
}

export function elevationProfile(
  assets: LandAssets,
  line: ProfileLine,
  count = 72,
): ElevationSample[] {
  const distanceFeet =
    Math.hypot(
      (line.end.u - line.start.u) * assets.meta.groundMeters.width,
      (line.end.v - line.start.v) * assets.meta.groundMeters.depth,
    ) * METERS_TO_FEET;
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    return {
      distanceFeet: distanceFeet * t,
      elevationFeet: elevationFeetAt(assets, {
        u: line.start.u + (line.end.u - line.start.u) * t,
        v: line.start.v + (line.end.v - line.start.v) * t,
      }),
    };
  });
}

/** Low to high. Lightness rises steadily, and no stop reads as flood blue or wetland teal. */
export const ELEVATION_RAMP = [
  "#1f3a2e",
  "#4f6b2f",
  "#a8963c",
  "#e0b85a",
  "#fbeccb",
] as const;
export const ELEVATION_GRADIENT = (angle: string) =>
  `linear-gradient(${angle}, ${ELEVATION_RAMP.join(", ")})`;

const RAMP_RGB = ELEVATION_RAMP.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

const ramp = (value: number): [number, number, number] => {
  const scaled = Math.max(0, Math.min(0.9999, value)) * (RAMP_RGB.length - 1);
  const index = Math.floor(scaled);
  const amount = scaled - index;
  const a = RAMP_RGB[index]!;
  const b = RAMP_RGB[index + 1]!;
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * amount)) as [
    number,
    number,
    number,
  ];
};

function clipBoundary(
  context: CanvasRenderingContext2D,
  ring: readonly ProfilePoint[],
  width: number,
  height: number,
) {
  context.beginPath();
  ring.forEach((point, index) => {
    const x = point.u * width;
    const y = point.v * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.clip();
}

type Edge = "top" | "right" | "bottom" | "left";
const CASES: Record<number, readonly (readonly [Edge, Edge])[]> = {
  1: [["left", "bottom"]],
  2: [["bottom", "right"]],
  3: [["left", "right"]],
  4: [["top", "right"]],
  5: [
    ["top", "left"],
    ["bottom", "right"],
  ],
  6: [["top", "bottom"]],
  7: [["top", "left"]],
  8: [["top", "left"]],
  9: [["top", "bottom"]],
  10: [
    ["top", "right"],
    ["left", "bottom"],
  ],
  11: [["top", "right"]],
  12: [["left", "right"]],
  13: [["bottom", "right"]],
  14: [["left", "bottom"]],
};

function drawContours(
  context: CanvasRenderingContext2D,
  assets: LandAssets,
  width: number,
  height: number,
  interval: number,
) {
  const size = assets.heightSize;
  const min = assets.meta.elevation.minMeters * METERS_TO_FEET;
  const max = assets.meta.elevation.maxMeters * METERS_TO_FEET;
  const first = Math.ceil(min / interval) * interval;
  const value = (x: number, y: number) =>
    min + assets.heights[y * size + x]! * (max - min);
  const point = (
    edge: Edge,
    x: number,
    y: number,
    level: number,
    corners: readonly number[],
  ): [number, number] => {
    const pairs: Record<Edge, readonly [number, number, number, number]> = {
      top: [0, 1, 0, 0],
      right: [1, 2, 1, 0],
      bottom: [3, 2, 0, 1],
      left: [0, 3, 0, 0],
    };
    const [from, to, ox, oy] = pairs[edge];
    const amount = Math.max(
      0,
      Math.min(
        1,
        (level - corners[from]!) / (corners[to]! - corners[from]! || 1),
      ),
    );
    const dx = edge === "top" || edge === "bottom" ? amount : ox;
    const dy = edge === "left" || edge === "right" ? amount : oy;
    // Grid values sit at pixel centres, as heightAt reads them.
    return [((x + dx + 0.5) / size) * width, ((y + dy + 0.5) / size) * height];
  };

  for (let level = first; level <= max; level += interval) {
    context.beginPath();
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const corners = [
          value(x, y),
          value(x + 1, y),
          value(x + 1, y + 1),
          value(x, y + 1),
        ];
        const code =
          (corners[0]! >= level ? 8 : 0) |
          (corners[1]! >= level ? 4 : 0) |
          (corners[2]! >= level ? 2 : 0) |
          (corners[3]! >= level ? 1 : 0);
        for (const [a, b] of CASES[code] ?? []) {
          const from = point(a, x, y, level, corners);
          const to = point(b, x, y, level, corners);
          context.moveTo(...from);
          context.lineTo(...to);
        }
      }
    }
    const major = Math.round(level) % (interval * 5) === 0;
    context.lineJoin = "round";
    context.strokeStyle = "rgba(5,5,5,0.7)";
    context.lineWidth = major
      ? Math.max(3.5, width / 300)
      : Math.max(2.5, width / 420);
    context.stroke();
    context.strokeStyle = major
      ? "rgba(255,255,255,1)"
      : "rgba(255,255,255,0.85)";
    context.lineWidth = major
      ? Math.max(1.8, width / 640)
      : Math.max(1.2, width / 900);
    context.stroke();
  }
}

/** Paints the height ramp and contours, and the steep-slope mask, inside the lot. */
export function paintElevationOverlay({
  assets,
  boundary,
  width,
  height,
  elevation,
  slope,
  analysis,
}: {
  assets: LandAssets;
  boundary: number[][];
  width: number;
  height: number;
  elevation: boolean;
  slope: boolean;
  /** The lot's range: the ramp runs from its lowest to its highest point. */
  analysis: ElevationAnalysis;
}): HTMLCanvasElement | null {
  if (!elevation && !slope) return null;
  const ring = ringInRegion(assets, boundary);
  if (ring.length < 3) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.save();
  clipBoundary(context, ring, width, height);

  const size = assets.heightSize;
  const raster = document.createElement("canvas");
  raster.width = size;
  raster.height = size;
  const rasterContext = raster.getContext("2d");
  if (!rasterContext) return null;
  const pixels = rasterContext.createImageData(size, size);
  const { minMeters, maxMeters } = assets.meta.elevation;
  const lotMin = analysis.minFeet / METERS_TO_FEET;
  const lotSpan = Math.max(
    0.01,
    (analysis.maxFeet - analysis.minFeet) / METERS_TO_FEET,
  );
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      const offset = index * 4;
      if (elevation) {
        const meters =
          minMeters + assets.heights[index]! * (maxMeters - minMeters);
        const [red, green, blue] = ramp((meters - lotMin) / lotSpan);
        pixels.data[offset] = red;
        pixels.data[offset + 1] = green;
        pixels.data[offset + 2] = blue;
        pixels.data[offset + 3] = 190;
      }
      if (slope) {
        const steepness = slopePercentAt(assets, {
          u: (col + 0.5) / size,
          v: (row + 0.5) / size,
        });
        if (steepness >= STEEP_SLOPE_PERCENT) {
          const strength = Math.min(1, (steepness - STEEP_SLOPE_PERCENT) / 20);
          pixels.data[offset] = 220;
          pixels.data[offset + 1] = Math.round(48 - strength * 18);
          pixels.data[offset + 2] = 48;
          pixels.data[offset + 3] = Math.max(
            pixels.data[offset + 3]!,
            Math.round(160 + strength * 70),
          );
        }
      }
    }
  }
  rasterContext.putImageData(pixels, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(raster, 0, 0, width, height);
  if (elevation)
    drawContours(context, assets, width, height, analysis.contourFeet);

  context.restore();
  return canvas;
}

/** The profile's line and two numbered ends, on its own canvas so a drag repaints only this. */
export function paintProfileLine(
  width: number,
  height: number,
  profile: ProfileLine,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.beginPath();
  context.moveTo(profile.start.u * width, profile.start.v * height);
  context.lineTo(profile.end.u * width, profile.end.v * height);
  context.strokeStyle = "rgba(5,5,5,0.9)";
  context.lineWidth = Math.max(5, width / 230);
  context.stroke();
  context.setLineDash([width / 90, width / 160]);
  context.strokeStyle = "rgba(255,255,255,0.96)";
  context.lineWidth = Math.max(2, width / 600);
  context.stroke();
  context.setLineDash([]);
  const radius = Math.max(7, width / 120);
  [profile.start, profile.end].forEach((endpoint, index) => {
    const x = endpoint.u * width;
    const y = endpoint.v * height;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = "#f3f1ec";
    context.fill();
    context.strokeStyle = "#0a0a0a";
    context.lineWidth = Math.max(2, width / 700);
    context.stroke();
    context.fillStyle = "#0a0a0a";
    context.font = `700 ${Math.round(radius * 1.25)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), x, y + radius * 0.06);
  });
  return canvas;
}

export function combineOverlays(
  width: number,
  height: number,
  overlays: readonly (HTMLCanvasElement | null)[],
): HTMLCanvasElement | null {
  const shown = overlays.filter((overlay): overlay is HTMLCanvasElement =>
    Boolean(overlay),
  );
  if (shown.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  for (const overlay of shown) context.drawImage(overlay, 0, 0, width, height);
  return canvas;
}
