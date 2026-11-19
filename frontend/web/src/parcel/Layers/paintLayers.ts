import type {
  MapLayer,
  MapLayerId,
  MapShape,
  ParcelLayers,
} from "@groundtruth/shared";
import type { LandMeta } from "@groundtruth/shared";
import { regionUV } from "../ParcelScene/landMeta";

/** One colour per layer, far from the boundary's gold and from each other. */
export const LAYER_COLORS: Record<MapLayerId | "boundary", string> = {
  boundary: "#c4a15a",
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
 * Returns null when no layer is on.
 */
export function paintLayers({
  meta,
  width,
  height,
  layers,
  enabled,
  wetlandsImage,
}: {
  meta: LandMeta;
  width: number;
  height: number;
  layers: ParcelLayers;
  enabled: ReadonlySet<MapLayerId>;
  wetlandsImage: HTMLImageElement | null;
}): HTMLCanvasElement | null {
  const on = ORDER.flatMap((id) => {
    const layer = layers.layers.find((candidate) => candidate.id === id);
    return layer && enabled.has(id) && layer.status === "found" ? [layer] : [];
  });
  if (on.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
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

  for (const layer of on) {
    const color = LAYER_COLORS[layer.id];
    context.save();
    switch (layer.id) {
      case "flood":
        for (const shape of layer.shapes) {
          const strong = shape.tone === "strong";
          trace(shape);
          context.fillStyle = rgba(color, strong ? 0.42 : 0.2);
          context.fill("evenodd");
          context.lineWidth = (strong ? 2 : 1.5) * scale;
          context.setLineDash(strong ? [] : [6 * scale, 4 * scale]);
          context.strokeStyle = rgba(color, strong ? 0.95 : 0.75);
          context.stroke();
        }
        break;
      case "wetlands":
        if (wetlandsImage)
          paintImage(context, wetlandsImage, layers.bbox, toPixel, color);
        break;
      case "streamSetback":
        for (const shape of layer.shapes) {
          trace(shape);
          context.fillStyle = rgba(color, 0.32);
          context.fill("evenodd");
          context.lineWidth = 2.5 * scale;
          context.strokeStyle = rgba(color, 0.95);
          context.stroke();
        }
        break;
      case "roadRightOfWay":
        for (const shape of layer.shapes) {
          trace(shape);
          context.fillStyle = rgba(color, 0.34);
          context.fill("evenodd");
          context.lineWidth = 2 * scale;
          context.strokeStyle = rgba(color, 0.95);
          context.stroke();
        }
        break;
      case "zoning":
        paintZoning(context, layer, trace, toPixel, color, scale);
        break;
    }
    context.restore();
  }
  return canvas;
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
