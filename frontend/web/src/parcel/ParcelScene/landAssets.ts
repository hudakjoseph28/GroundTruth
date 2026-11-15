import { isLandMeta, landAssetDir, type LandMeta } from "./landMeta";

/** One parcel's baked assets, decoded and ready to draw. */
export interface LandAssets {
  meta: LandMeta;
  imageryUrl: string;
  imagery: HTMLImageElement;
  /** Heights from 0 (lowest) to 1 (highest), row 0 at the north edge. */
  heights: Float32Array;
  heightSize: number;
}

const cache = new Map<string, Promise<LandAssets | null>>();

/** Resolves to null when the parcel has no baked assets. Never rejects. */
export function loadLandAssets(sourceParcelId: string): Promise<LandAssets | null> {
  let pending = cache.get(sourceParcelId);
  if (!pending) {
    pending = load(sourceParcelId).catch(() => null);
    cache.set(sourceParcelId, pending);
  }
  return pending;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

async function load(sourceParcelId: string): Promise<LandAssets | null> {
  const base = `${import.meta.env.BASE_URL}parcels/${landAssetDir(sourceParcelId)}/`;
  const response = await fetch(`${base}meta.json`);
  if (!response.ok) return null;
  // An unbaked parcel gets the app shell back, which is not JSON.
  const meta: unknown = await response.json().catch(() => null);
  if (!isLandMeta(meta)) return null;

  const imageryUrl = base + meta.imagery.file;
  const [imagery, heightImage] = await Promise.all([
    loadImage(imageryUrl),
    loadImage(base + meta.elevation.file),
  ]);

  const size = heightImage.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = heightImage.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || size < 2 || canvas.height !== size) return null;
  context.drawImage(heightImage, 0, 0);
  const pixels = context.getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) heights[i] = pixels[i * 4]! / 255;

  return { meta, imageryUrl, imagery, heights, heightSize: size };
}

/** Bilinear height, 0..1, at a point in the baked region (u east, v south). */
export function heightAt(assets: LandAssets, u: number, v: number): number {
  const size = assets.heightSize;
  const x = Math.min(size - 1, Math.max(0, u * size - 0.5));
  const y = Math.min(size - 1, Math.max(0, v * size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (col: number, row: number) => assets.heights[row * size + col]!;
  const north = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const south = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return north * (1 - fy) + south * fy;
}
