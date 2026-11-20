import type {
  MapLayer,
  MapLayerId,
  MapShape,
  ParcelLayers,
} from "@groundtruth/shared";
import type { LandMeta } from "@groundtruth/shared";
import type { LayerToggleId } from "../../content/layers";
import type { BuildableAreaEstimate } from "../BuildableArea/estimate";
import { regionUV } from "../ParcelScene/landMeta";

/** One colour per layer, far from the boundary's gold and from each other. */
export const LAYER_COLORS: Record<LayerToggleId, string> = {
  boundary: "#c4a15a",
  buildableArea: "#52d273",
  flood: "#4d8dff",
  streamSetback: "#b57bff",
  wetlands: "#2fd3b5",
  zoning: "#ff5fa2",
  roadRightOfWay: "#f4f1ea",
};

/** Bottom to top: area fills first, then the lines and labels. */
const ORDER: MapLayerId[] = [
  "flood",
  "wetlands",
  "streamSetback",
  "roadRightOfWay",
  "zoning",
];

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Draws the enabled layers onto a transparent canvas the size of the land
 * block's imagery, so the 3D terrain and the 2D picture show the same thing.
 * Returns null when no layer is on. `buildable` is the Buildable area
 * estimate's mask, shaded green under every other layer.
 *
 * With `labels`, every named shape gets a small tag inside it (the example
 * parcel); otherwise only zoning districts are named, as before.
 */
export function paintLayers({
  meta,
  width,
  height,
  layers,
  enabled,
  wetlandsImage,
  buildable = null,
  labels = false,
  lot,
}: {
  meta: LandMeta;
  width: number;
  height: number;
  layers: ParcelLayers;
  enabled: ReadonlySet<MapLayerId>;
  wetlandsImage: HTMLImageElement | null;
  buildable?: BuildableAreaEstimate | null;
  labels?: boolean;
  /** The parcel's outer ring, [longitude, latitude]: labels prefer to sit on the lot. */
  lot?: number[][];
}): HTMLCanvasElement | null {
  const on = ORDER.flatMap((id) => {
    const layer = layers.layers.find((candidate) => candidate.id === id);
    return layer && enabled.has(id) && layer.status === "found" ? [layer] : [];
  });
  if (on.length === 0 && !buildable) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (buildable) paintBuildable(context, buildable, width, height);
  /** Line widths and type are given for a 1024 px picture. */
  const scale = width / 1024;
  const toPixel = (lon: number, lat: number): [number, number] => {
    const { u, v } = regionUV(meta.bbox, lon, lat);
    return [u * width, v * height];
  };
  const trace = (shape: MapShape) => {
    context.beginPath();
    for (const ring of shape.rings) {
      ring.forEach(([lon = 0, lat = 0], index) => {
        const [x, y] = toPixel(lon, lat);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    }
  };
  /** Fills the traced shape with a repeating texture, clipped to it. */
  const texture = (shape: MapShape, tile: HTMLCanvasElement | null) => {
    const pattern = tile && context.createPattern(tile, "repeat");
    if (!pattern) return;
    context.save();
    trace(shape);
    context.clip("evenodd");
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
    context.restore();
  };

  for (const layer of on) {
    const color = LAYER_COLORS[layer.id];
    context.save();
    context.lineJoin = "round";
    switch (layer.id) {
      case "flood":
        for (const shape of layer.shapes) {
          const strong = shape.tone === "strong";
          trace(shape);
          context.fillStyle = rgba(color, strong ? 0.34 : 0.2);
          context.fill("evenodd");
          // The Special Flood Hazard Area is hatched, as on FEMA's own maps.
          if (strong) texture(shape, hatchTile(color, scale));
          trace(shape);
          context.lineWidth = (strong ? 2.5 : 1.5) * scale;
          context.setLineDash(strong ? [] : [6 * scale, 4 * scale]);
          context.strokeStyle = rgba(color, strong ? 0.95 : 0.75);
          context.stroke();
        }
        break;
      case "wetlands":
        if (wetlandsImage)
          paintImage(context, wetlandsImage, layers.bbox, toPixel, color);
        for (const shape of layer.shapes) {
          trace(shape);
          context.fillStyle = rgba(color, 0.3);
          context.fill("evenodd");
          texture(shape, marshTile(color, scale));
          trace(shape);
          context.lineWidth = 2 * scale;
          context.strokeStyle = rgba(color, 0.95);
          context.stroke();
        }
        break;
      case "streamSetback":
        for (const shape of layer.shapes) {
          trace(shape);
          if (shape.tone === "light") {
            // The stream itself: water, with a lighter line down its middle.
            context.fillStyle = rgba(WATER, 0.92);
            context.fill("evenodd");
            context.lineWidth = 1.5 * scale;
            context.strokeStyle = rgba("#bfe0ff", 0.85);
            context.stroke();
            continue;
          }
          context.fillStyle = rgba(color, 0.24);
          context.fill("evenodd");
          context.lineWidth = 2.5 * scale;
          context.setLineDash([12 * scale, 6 * scale]);
          context.strokeStyle = rgba(color, 0.95);
          context.stroke();
          context.setLineDash([]);
        }
        break;
      case "roadRightOfWay":
        for (const shape of layer.shapes) {
          trace(shape);
          context.fillStyle = rgba(color, 0.3);
          context.fill("evenodd");
          context.lineWidth = 2 * scale;
          context.strokeStyle = rgba(color, 0.95);
          context.stroke();
        }
        break;
      case "zoning":
        paintZoning(context, layer, trace, toPixel, color, scale, !labels);
        break;
    }
    context.restore();
  }

  if (labels) {
    const lotRing = lot?.map(([lon = 0, lat = 0]) => toPixel(lon, lat));
    const placed: Box[] = [];
    // Features first, then the districts, whose codes keep clear of them.
    const features = on.filter((layer) => layer.id !== "zoning");
    const areas = features.flatMap((layer) =>
      layer.shapes.map((shape) => ({
        id: layer.id,
        rings: shape.rings.map((ring) => ring.map(([lon = 0, lat = 0]) => toPixel(lon, lat))),
      })),
    );
    for (const layer of [...features, ...on.filter((layer) => layer.id === "zoning")]) {
      for (const shape of layer.shapes) {
        if (!shape.label) continue;
        const others = areas.filter((area) => area.id !== layer.id).map((area) => area.rings);
        paintTag(context, shape, layer.id, toPixel, scale, width, height, lotRing, placed, others);
      }
    }
  }
  return canvas;
}

/**
 * The estimate's grid covers the same region as the picture, so its kept
 * cells stretch straight onto it. Hard pixel edges: it is a grid estimate.
 */
function paintBuildable(
  context: CanvasRenderingContext2D,
  estimate: BuildableAreaEstimate,
  width: number,
  height: number,
) {
  const size = estimate.gridSize;
  const grid = document.createElement("canvas");
  grid.width = size;
  grid.height = size;
  const gridContext = grid.getContext("2d");
  if (!gridContext) return;
  const pixels = gridContext.createImageData(size, size);
  const color = Number.parseInt(LAYER_COLORS.buildableArea.slice(1), 16);
  for (let index = 0; index < estimate.mask.length; index += 1) {
    if (!estimate.mask[index]) continue;
    pixels.data[index * 4] = (color >> 16) & 255;
    pixels.data[index * 4 + 1] = (color >> 8) & 255;
    pixels.data[index * 4 + 2] = color & 255;
    pixels.data[index * 4 + 3] = 110;
  }
  gridContext.putImageData(pixels, 0, 0);
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(grid, 0, 0, width, height);
  context.restore();
}

/** The stream's own blue, a little brighter than the flood zone's. */
const WATER = "#3d9bff";

function rgbaFrom(color: string, alpha: number): string {
  return color.startsWith("#") ? rgba(color, alpha) : color;
}

/** Diagonal hatching, for a Special Flood Hazard Area. */
function hatchTile(color: string, scale: number): HTMLCanvasElement | null {
  const size = Math.max(6, Math.round(16 * scale));
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const context = tile.getContext("2d");
  if (!context) return null;
  context.strokeStyle = rgbaFrom(color, 0.55);
  context.lineWidth = Math.max(1, 1.6 * scale);
  context.beginPath();
  // Three strokes so the lines meet across tile edges.
  for (const offset of [-size, 0, size]) {
    context.moveTo(offset, size);
    context.lineTo(offset + size, 0);
  }
  context.stroke();
  return tile;
}

/** Little tufts of marsh grass, the map symbol for a wetland. */
function marshTile(color: string, scale: number): HTMLCanvasElement | null {
  const size = Math.max(12, Math.round(34 * scale));
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const context = tile.getContext("2d");
  if (!context) return null;
  context.strokeStyle = rgbaFrom(color, 0.9);
  context.lineWidth = Math.max(1, 1.4 * scale);
  context.lineCap = "round";
  const tuft = (x: number, y: number) => {
    const h = size * 0.22;
    context.beginPath();
    context.moveTo(x - h * 0.6, y);
    context.lineTo(x + h * 0.6, y);
    context.moveTo(x, y);
    context.lineTo(x, y - h);
    context.moveTo(x - h * 0.15, y);
    context.lineTo(x - h * 0.55, y - h * 0.75);
    context.moveTo(x + h * 0.15, y);
    context.lineTo(x + h * 0.55, y - h * 0.75);
    context.stroke();
  };
  tuft(size * 0.28, size * 0.42);
  tuft(size * 0.78, size * 0.92);
  return tile;
}

type Box = [number, number, number, number];

const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * A tag naming one shape, inside it: a dark pill with the layer's colour. It
 * goes where the shape is widest, preferring the lot and the middle of the
 * view, and never on top of another tag. A road's tag runs along the road.
 */
function paintTag(
  context: CanvasRenderingContext2D,
  shape: MapShape,
  id: MapLayerId,
  toPixel: (lon: number, lat: number) => [number, number],
  scale: number,
  width: number,
  height: number,
  lot: [number, number][] | undefined,
  placed: Box[],
  /** Other layers' areas: a tag keeps off them where it can. */
  others: [number, number][][][],
) {
  const label = shape.label ?? "";
  const rings = shape.rings.map((ring) => ring.map(([lon = 0, lat = 0]) => toPixel(lon, lat)));
  const district = id === "zoning";
  // Big enough to read on the 3D block, where the picture is drawn small.
  const fontSize = Math.round((district ? 52 : 34) * scale);
  context.save();
  context.font = `${district ? 750 : 650} ${fontSize}px system-ui, -apple-system, sans-serif`;
  const textWidth = context.measureText(label).width;
  const padX = (district ? 20 : 15) * scale;
  const dot = district ? 0 : 18 * scale;
  const boxW = textWidth + padX * 2 + dot;
  const boxH = fontSize * 1.55;
  const angle = id === "roadRightOfWay" ? roadAngle(rings) : 0;
  const reach = (Math.abs(Math.cos(angle)) * boxW + Math.abs(Math.sin(angle)) * boxH) / 2;
  const reachY = (Math.abs(Math.sin(angle)) * boxW + Math.abs(Math.cos(angle)) * boxH) / 2;

  const step = width / 48;
  const margin = width * 0.09;
  const center: [number, number] = [width / 2, height / 2];
  let best: { at: [number, number]; score: number } | null = null;
  for (let y = margin; y <= height - margin; y += step) {
    for (let x = margin; x <= width - margin; x += step) {
      const at: [number, number] = [x, y];
      if (!insideRings(at, rings)) continue;
      const box: Box = [x - reach, y - reachY, x + reach, y + reachY];
      if (box[0] < 4 || box[1] < 4 || box[2] > width - 4 || box[3] > height - 4) continue;
      if (placed.some((other) => overlaps(box, other))) continue;
      // A district's code goes well inside it, away from the line it names.
      const room = Math.min(edgeDistance(at, rings), boxW * (district ? 3 : 1));
      // On the lot wins wherever a tag fits there.
      const onLot = lot && insideRings(at, [lot]) ? width : 0;
      const busy = others.filter((rings) => insideRings(at, rings)).length * boxW;
      const middle = Math.hypot(x - center[0], y - center[1]) / width;
      const score = room + onLot - busy - middle * boxW * 0.8;
      if (!best || score > best.score) best = { at, score };
    }
  }
  if (!best) {
    context.restore();
    return;
  }
  const [x, y] = best.at;
  placed.push([x - reach, y - reachY, x + reach, y + reachY]);
  const color = LAYER_COLORS[id];
  context.translate(x, y);
  context.rotate(angle);
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 10 * scale;
  context.shadowOffsetY = 2 * scale;
  roundRect(context, -boxW / 2, -boxH / 2, boxW, boxH, boxH / 2);
  context.fillStyle = "rgba(10, 10, 12, 0.82)";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 3 * scale;
  context.strokeStyle = rgba(color, 0.9);
  context.stroke();
  context.textBaseline = "middle";
  context.textAlign = "left";
  let textX = -boxW / 2 + padX;
  if (dot) {
    context.beginPath();
    context.arc(textX + 6 * scale, 0, 7 * scale, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    textX += dot;
  }
  context.fillStyle = district ? color : "#f5f5f7";
  context.fillText(label, textX, fontSize * 0.04);
  context.restore();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

/** The direction of a band's longest side, turned so text never reads upside down. */
function roadAngle(rings: [number, number][][]): number {
  let longest = 0;
  let angle = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length > longest) {
        longest = length;
        angle = Math.atan2(y2 - y1, x2 - x1);
      }
    }
  }
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

/** How far a point is from the nearest edge of any ring. */
function edgeDistance([x, y]: [number, number], rings: [number, number][][]): number {
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
  }
  return best;
}

/** NWI's own drawing, recoloured: wherever it is opaque, the layer's colour. */
function paintImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  bbox: ParcelLayers["bbox"],
  toPixel: (lon: number, lat: number) => [number, number],
  color: string,
) {
  const tint = document.createElement("canvas");
  tint.width = image.naturalWidth;
  tint.height = image.naturalHeight;
  const tinted = tint.getContext("2d");
  if (!tinted) return;
  tinted.drawImage(image, 0, 0);
  tinted.globalCompositeOperation = "source-in";
  tinted.fillStyle = rgba(color, 0.55);
  tinted.fillRect(0, 0, tint.width, tint.height);
  const [x0, y0] = toPixel(bbox.west, bbox.north);
  const [x1, y1] = toPixel(bbox.east, bbox.south);
  context.drawImage(tint, x0, y0, x1 - x0, y1 - y0);
}

function paintZoning(
  context: CanvasRenderingContext2D,
  layer: MapLayer,
  trace: (shape: MapShape) => void,
  toPixel: (lon: number, lat: number) => [number, number],
  color: string,
  scale: number,
  /** False when the caller tags every shape itself. */
  names = true,
) {
  context.lineJoin = "round";
  for (const shape of layer.shapes) {
    trace(shape);
    // A dark under-stroke keeps the line readable on bright fields.
    context.setLineDash([]);
    context.lineWidth = 5 * scale;
    context.strokeStyle = "rgba(10, 10, 10, 0.55)";
    context.stroke();
    context.setLineDash([10 * scale, 6 * scale]);
    context.lineWidth = 2.5 * scale;
    context.strokeStyle = color;
    context.stroke();
  }
  context.setLineDash([]);
  if (!names) return;
  context.font = `700 ${Math.round(38 * scale)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const shape of layer.shapes) {
    if (!shape.label) continue;
    const at = labelPoint(shape, toPixel);
    if (!at) continue;
    context.lineWidth = 7 * scale;
    context.strokeStyle = "rgba(10, 10, 10, 0.75)";
    context.strokeText(shape.label, at[0], at[1]);
    context.fillStyle = color;
    context.fillText(shape.label, at[0], at[1]);
  }
}

/**
 * Where a district's code goes: the middle of its largest ring's box when
 * that is inside the district, else nowhere (a label outside its district
 * would name the wrong land).
 */
export function labelPoint(
  shape: MapShape,
  toPixel: (lon: number, lat: number) => [number, number],
): [number, number] | null {
  const rings = shape.rings.map((ring) =>
    ring.map(([lon = 0, lat = 0]) => toPixel(lon, lat)),
  );
  let best: { area: number; box: [number, number, number, number] } | null =
    null;
  for (const ring of rings) {
    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      area += x1 * y2 - x2 * y1;
      minX = Math.min(minX, x1);
      minY = Math.min(minY, y1);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    area = Math.abs(area) / 2;
    if (!best || area > best.area)
      best = { area, box: [minX, minY, maxX, maxY] };
  }
  if (!best) return null;
  const point: [number, number] = [
    (best.box[0] + best.box[2]) / 2,
    (best.box[1] + best.box[3]) / 2,
  ];
  return insideRings(point, rings) ? point : null;
}

function insideRings(
  [x, y]: [number, number],
  rings: [number, number][][],
): boolean {
  let odd = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]!;
      const [x2, y2] = ring[i]!;
      if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1)
        odd = !odd;
    }
  }
  return odd;
}
